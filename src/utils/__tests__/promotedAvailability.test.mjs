import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Load the real store and its alias-based imports in Node's isolated test worker.
const require = createRequire(import.meta.url)
const originalResolve = Module._resolveFilename
const originalTs = require.extensions['.ts']
const src = fileURLToPath(new URL('../../', import.meta.url))
let store
try {
  Module._resolveFilename = function (request, parent, ...rest) {
    return originalResolve.call(this, request.startsWith('@/') ? path.join(src, request.slice(2)) : request, parent, ...rest)
  }
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename)
  store = require('../../store/useModellingStore.ts').useModellingStore
} finally {
  Module._resolveFilename = originalResolve
  if (originalTs) require.extensions['.ts'] = originalTs
  else delete require.extensions['.ts']
}

const unit = (bmUnitId, extra = {}) => ({
  bmUnitId, nationalGridBmUnit: bmUnitId, fuelType: 'CCGT', registeredCapacity: 100,
  gspGroup: '_A', sel: 20, priceToMel: 100, ...extra,
})
const period = (settlementPeriod, pn = {}, mel = { A: 100 }) => ({
  settlementPeriod, settlementDate: '2026-11-23', startTime: '2026-11-23T00:00:00Z',
  pn, mel, mil: {}, demand: 80, emx: 0, eol: 0, emi: 0, margin: -80,
  hasConfirmedPn: true, proxyEmx: 0, proxyEol: 0,
})
const filters = extra => ({
  gspFilter: {}, asFilter: { sr: false, qr: false }, deRatePct: 0, priceThreshold: '', ...extra,
})

beforeEach(() => store.setState(store.getInitialState(), true))

test('Schedule commit captures window availability and de-rated usable MW at promotion', () => {
  const s = store.getState()
  s.setUnits([unit('A')])
  s.setSettlementPeriods([period(1), period(2, { A: 40 }), period(3, { A: 75 })])
  s.setWorkingPlanWindow(1, 2)
  s.addToWorkingPlan([{ bmUnitId: 'A', actionType: 'start' }])
  const id = s.commitWorkingPlan('Test', '', filters({ deRatePct: 25 }))
  const draft = store.getState().drafts.find(d => d.id === id)
  assert.equal(draft.status, 'promoted')
  assert.deepEqual(draft.availabilitySnapshot.A, { availableMw: 60, usableMw: 45 })
})

test('snapshot uses each working-plan action window, including an open-ended To', () => {
  const s = store.getState()
  s.setUnits([unit('A')])
  s.setSettlementPeriods([period(1), period(2, { A: 40 }), period(3, { A: 75 })])
  s.setWorkingPlanWindow(1, 1)
  s.addToWorkingPlan([{ bmUnitId: 'A', actionType: 'start' }])
  s.updateWorkingPlanAction('A', { fromPeriod: 2, toPeriod: undefined })
  const id = s.commitWorkingPlan('Custom window', '', filters({ deRatePct: 20 }))
  assert.deepEqual(store.getState().drafts.find(d => d.id === id).availabilitySnapshot.A, { availableMw: 25, usableMw: 20 })
})

test('promotion captures constraint, service, and price exclusions in Usable', () => {
  const s = store.getState()
  s.setUnits([unit('A', { gspGroup: '_B' }), unit('B'), unit('C', { priceToMel: 200 }), unit('D')])
  s.setSettlementPeriods([period(1, {}, { A: 100, B: 100, C: 100, D: 100 })])
  s.setUnitService('B', 'SR')
  s.addToWorkingPlan(['A', 'B', 'C', 'D'].map(bmUnitId => ({ bmUnitId, actionType: 'start' })))
  const id = s.commitWorkingPlan('Filters', '', filters({ gspFilter: { _B: 'exclude' }, asFilter: { sr: true, qr: false }, priceThreshold: '150', deRatePct: 50 }))
  const snapshot = store.getState().drafts.find(d => d.id === id).availabilitySnapshot
  for (const key of ['A', 'B', 'C']) assert.deepEqual(snapshot[key], { availableMw: 100, usableMw: 0 })
  assert.deepEqual(snapshot.D, { availableMw: 100, usableMw: 50 })
})

test('promoted snapshot stays fixed through data, service, filter, and inline changes', () => {
  const s = store.getState()
  s.setUnits([unit('A')])
  s.setSettlementPeriods([period(1, { A: 40 }), period(2, { A: 50 })])
  const id = s.createDraft()
  s.addUnitsToDraft(id, ['A'])
  s.updateUnitWindow(id, 'A', 1, 1)
  s.promoteDraft(id, filters({ deRatePct: 25 }))
  const expected = { availableMw: 60, usableMw: 45 }
  s.setUnits([unit('A', { registeredCapacity: 500 })])
  s.setSettlementPeriods([period(1, { A: 20 }, { A: 500 }), period(2, {}, { A: 500 })])
  s.setUnitService('A', 'SR')
  s.setDataOverride('A', 'mel', 900)
  s.updateUnitWindow(id, 'A', 2, undefined)
  s.updateUnitReason(id, 'A', 'INERTIA')
  s.updateUnitNotes(id, 'A', 'Edited')
  s.updateUnitOperationType(id, 'A', 'AS')
  s.promoteDraft(id, filters({ deRatePct: 100 }))
  assert.deepEqual(store.getState().drafts.find(d => d.id === id).availabilitySnapshot.A, expected)
})

test('Workspace promotion defaults Usable to Avail and re-promotion captures fresh values', () => {
  const s = store.getState()
  s.setUnits([unit('A')])
  s.setSettlementPeriods([period(1, { A: 100 })])
  const id = s.createDraft()
  s.addUnitsToDraft(id, ['A'])
  s.promoteDraft(id)
  assert.deepEqual(store.getState().drafts.find(d => d.id === id).availabilitySnapshot.A, { availableMw: 0, usableMw: 0 })
  const copy = s.duplicateDraft(id)
  assert.equal(store.getState().drafts.find(d => d.id === copy).availabilitySnapshot, undefined)
  s.reopenDraft(id)
  s.setSettlementPeriods([period(1, { A: 20 })])
  s.promoteDraft(id)
  assert.deepEqual(store.getState().drafts.find(d => d.id === id).availabilitySnapshot.A, { availableMw: 80, usableMw: 80 })
})

test('no source periods leaves the snapshot unavailable rather than inventing a value', () => {
  const s = store.getState()
  s.setUnits([unit('A')])
  const id = s.createDraft()
  s.addUnitsToDraft(id, ['A'])
  s.promoteDraft(id)
  assert.equal(store.getState().drafts.find(d => d.id === id).availabilitySnapshot.A, undefined)
})
