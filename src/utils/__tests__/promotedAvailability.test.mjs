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

for (const [actionType, pn, service, expected] of [
  ['start', 0, undefined, { emx: 100, eol: 100, emi: 20, outputLevel: 100 }],
  ['deload', 60, undefined, { emx: 100, eol: 20, emi: 20, outputLevel: 20 }],
  ['deloadZero', 60, undefined, { emx: 100, eol: 0, emi: 20, outputLevel: 0 }],
  ['desync', 60, undefined, { emx: 0, eol: 0, emi: 0, outputLevel: 0 }],
  ['capacity', 60, undefined, { emx: 140, eol: 60, emi: 20, outputLevel: 0 }],
  ['unusable', 60, undefined, { emx: 100, eol: 60, emi: 20, outputLevel: 0, serviceCapacityMw: 0 }],
  ['allocate', 60, 'SR', { emx: 100, eol: 60, emi: 20, outputLevel: 0, serviceCapacityMw: 40 }],
  ['allocate', 60, 'QR', { emx: 100, eol: 60, emi: 20, outputLevel: 0, serviceCapacityMw: 40 }],
]) {
  test(`Type A Action promotes ${actionType}${service ? ` to ${service}` : ''} with the chosen effect and existing window`, () => {
    const s = store.getState()
    s.setUnits([unit('A')])
    s.setSettlementPeriods([period(1, { A: pn }), period(2, { A: pn }), period(3, { A: pn })])
    s.setUnitService('A', 'SR')
    s.setWorkingPlanWindow(2, 2)
    s.addToWorkingPlan([{ bmUnitId: 'A', actionType: 'desync' }])
    s.updateWorkingPlanAction('A', { note: 'Keep this note', reasonCode: 'INERTIA' })
    const before = store.getState().settlementPeriods[0]
    const id = s.commitWorkingPlan('Chosen action', '', filters({}), actionType, service)
    const state = store.getState()
    const draft = state.drafts.find(d => d.id === id)
    const [action] = draft.actions
    assert.equal(draft.status, 'promoted')
    assert.equal(action.actionType, actionType, 'chosen action overrides temporary assignment')
    assert.equal(action.fromPeriod, 2)
    assert.equal(action.toPeriod, 2)
    assert.equal(action.reasonCode, 'INERTIA')
    assert.equal(action.outputLevel, expected.outputLevel)
    assert.equal(draft.unitNotes.A, 'Keep this note')
    assert.equal(state.workingPlans[state.currentUser].length, 0)
    for (const field of ['emx', 'eol', 'emi']) {
      assert.equal(state.settlementPeriods[1][field], expected[field], field)
      assert.equal(state.settlementPeriods[0][field], before[field], `${field} outside window`)
      assert.equal(state.settlementPeriods[2][field], before[field], `${field} after window`)
    }
    if (actionType === 'allocate' || actionType === 'unusable') {
      assert.equal(action.allocatedService, service ?? 'SR')
      assert.equal(action.serviceCapacityMw, expected.serviceCapacityMw)
      assert.equal(state.unitServices.A, 'SR', 'windowed action leaves standing service data intact')
    }
    assert.deepEqual(draft.availabilitySnapshot.A, { availableMw: 100 - pn, usableMw: 100 - pn })
  })
}

test('invalid action for any selected unit leaves the entire working plan and drafts unchanged', () => {
  const s = store.getState()
  s.setUnits([unit('ON'), unit('OFF')])
  s.setSettlementPeriods([period(1, { ON: 60, OFF: 0 }, { ON: 100, OFF: 100 })])
  s.setWorkingPlanWindow(1, 1)
  s.addToWorkingPlan([{ bmUnitId: 'ON', actionType: 'deload' }, { bmUnitId: 'OFF', actionType: 'start' }])
  const before = store.getState()
  assert.throws(() => s.commitWorkingPlan('Invalid', '', filters({}), 'desync'), /OFF/)
  assert.equal(store.getState().workingPlans, before.workingPlans)
  assert.equal(store.getState().drafts, before.drafts)
  assert.equal(store.getState().settlementPeriods, before.settlementPeriods)
})

test('allocation requires a service and spare capacity throughout the selected window', () => {
  const s = store.getState()
  s.setUnits([unit('A')])
  s.setSettlementPeriods([period(1, { A: 60 }), period(2, { A: 100 })])
  s.setWorkingPlanWindow(1, 2)
  s.addToWorkingPlan([{ bmUnitId: 'A', actionType: 'deload' }])
  assert.throws(() => s.commitWorkingPlan('Missing service', '', filters({}), 'allocate'), /Choose a service/)
  assert.throws(() => s.commitWorkingPlan('No spare', '', filters({}), 'allocate', 'QR'), /no spare capacity/)
  assert.equal(store.getState().drafts.length, 0)
  assert.equal(store.getState().workingPlans[s.currentUser].length, 1)
})

test('allocation contracts the minimum spare MW in the unit window', () => {
  const s = store.getState()
  s.setUnits([unit('A')])
  s.setSettlementPeriods([period(1, { A: 60 }), period(2, { A: 85 })])
  s.setWorkingPlanWindow(1, 2)
  s.addToWorkingPlan([{ bmUnitId: 'A', actionType: 'deload' }])
  const id = s.commitWorkingPlan('Spare QR', '', filters({}), 'allocate', 'QR')
  assert.equal(store.getState().drafts.find(d => d.id === id).actions[0].serviceCapacityMw, 15)
})

test('Flag Unusable requires an existing contract and preserves QR while zeroing its usable service MW', () => {
  const s = store.getState()
  s.setUnits([unit('A')])
  s.setSettlementPeriods([period(1, { A: 100 })])
  s.setWorkingPlanWindow(1, 1)
  s.addToWorkingPlan([{ bmUnitId: 'A', actionType: 'desync' }])
  assert.throws(() => s.commitWorkingPlan('Uncontracted', '', filters({}), 'unusable'), /no SR\/QR contract/)
  s.setUnitService('A', 'QR')
  const id = s.commitWorkingPlan('QR unavailable', '', filters({}), 'unusable')
  const [action] = store.getState().drafts.find(d => d.id === id).actions
  assert.equal(action.allocatedService, 'QR')
  assert.equal(action.serviceCapacityMw, 0)
  assert.equal(store.getState().settlementPeriods[0].eol, 100)
  assert.equal(store.getState().unitServices.A, 'QR')
})
