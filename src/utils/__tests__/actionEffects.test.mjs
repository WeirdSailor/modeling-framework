import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actionTypeOf, covers, slotValues, isCandidate, marginDelta, areaDelta, changeMw,
} from '../actionEffects.ts'

// One slot: ON is running at 400 (MEL 600), OFF is off (declared MEL 0, MIL 7),
// LOW is running at 150, below its SEL of 200.
const sp = {
  settlementPeriod: 5,
  pn:  { ON: 400, OFF: 0, LOW: 150 },
  mel: { ON: 600, OFF: 0, LOW: 150 },
  mil: { OFF: 7 },
}
const ccgt = { fuelType: 'CCGT', registeredCapacity: 700, sel: 200 }
const wind = { fuelType: 'WIND', registeredCapacity: 300, sel: undefined }
const act = (bmUnitId, actionType, extra = {}) =>
  ({ bmUnitId, actionType, fromPeriod: 1, toPeriod: 10, outputLevel: 0, ...extra })
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`)

test('actionTypeOf defaults to start', () => {
  assert.equal(actionTypeOf({}), 'start')
  assert.equal(actionTypeOf({ actionType: 'desync' }), 'desync')
})

test('covers handles edges and open-ended windows', () => {
  assert.equal(covers({ fromPeriod: 3, toPeriod: 5 }, 3), true)
  assert.equal(covers({ fromPeriod: 3, toPeriod: 5 }, 5), true)
  assert.equal(covers({ fromPeriod: 3, toPeriod: 5 }, 6), false)
  assert.equal(covers({ fromPeriod: 3, toPeriod: 5 }, 2), false)
  assert.equal(covers({ fromPeriod: 3, toPeriod: undefined }, 48), true)
})

test('slotValues: startMel falls back to registered capacity when declared MEL is 0', () => {
  assert.equal(slotValues('OFF', sp, ccgt).startMel, 700)
  assert.equal(slotValues('ON', sp, ccgt).startMel, 600)
})

test('slotValues: SEL falls back to MIL when the unit has no SEL', () => {
  assert.equal(slotValues('OFF', sp, { fuelType: 'OCGT', registeredCapacity: 50 }).sel, 7)
})

test('isCandidate per type', () => {
  assert.equal(isCandidate('start', 'OFF', sp, ccgt), true)
  assert.equal(isCandidate('start', 'ON', sp, ccgt), false)
  assert.equal(isCandidate('deload', 'ON', sp, ccgt), true)
  assert.equal(isCandidate('deload', 'LOW', sp, ccgt), false)            // PN below SEL
  assert.equal(isCandidate('deload', 'ON', sp, { ...ccgt, sel: undefined }), false) // no SEL
  assert.equal(isCandidate('desync', 'ON', sp, ccgt), true)
  assert.equal(isCandidate('desync', 'OFF', sp, ccgt), false)
  assert.equal(isCandidate('capacity', 'ON', sp, ccgt), true)            // 700 > PN 400
  assert.equal(isCandidate('capacity', 'ON', sp, { ...ccgt, registeredCapacity: 400 }), false)
  assert.equal(isCandidate('capacity', 'OFF', sp, ccgt), false)
})

test('marginDelta: start', () => {
  assert.deepEqual(marginDelta(act('OFF', 'start', { outputLevel: 500 }), sp, ccgt), { emx: 700, eol: 500, emi: 200 })
  assert.deepEqual(marginDelta(act('ON', 'start', { outputLevel: 500 }), sp, ccgt), { emx: 0, eol: 0, emi: 0 })
})

test('marginDelta: start equals the pre-Scheduling-Actions formula when declared MEL > 0', () => {
  // Old rule for an off unit: emx += sp.mel[u] ?? 0, eol += outputLevel, emi += unit.sel ?? sp.mil[u] ?? 0
  const slot = { settlementPeriod: 1, pn: { X: 0 }, mel: { X: 450 }, mil: {} }
  const unit = { fuelType: 'CCGT', registeredCapacity: 500, sel: 120 }
  assert.deepEqual(marginDelta(act('X', undefined, { outputLevel: 300 }), slot, unit), { emx: 450, eol: 300, emi: 120 })
})

test('marginDelta: deload, desync, capacity', () => {
  assert.deepEqual(marginDelta(act('ON', 'deload'), sp, ccgt), { emx: 0, eol: -200, emi: 0 })
  assert.deepEqual(marginDelta(act('LOW', 'deload'), sp, ccgt), { emx: 0, eol: 0, emi: 0 })
  assert.deepEqual(marginDelta(act('ON', 'desync'), sp, ccgt), { emx: -600, eol: -400, emi: -200 })
  assert.deepEqual(marginDelta(act('OFF', 'desync'), sp, ccgt), { emx: 0, eol: 0, emi: 0 })
  assert.deepEqual(marginDelta(act('ON', 'capacity'), sp, ccgt), { emx: 300, eol: 0, emi: 0 })
  assert.deepEqual(marginDelta(act('OFF', 'capacity'), sp, ccgt), { emx: 0, eol: 0, emi: 0 })
})

test('areaDelta: start and margin are always 0 here', () => {
  assert.equal(areaDelta(act('OFF', 'start'), 'general_reserve', sp, ccgt), 0)
  assert.equal(areaDelta(act('ON', 'desync'), 'margin', sp, ccgt), 0)
})

test('areaDelta: deload and capacity free headroom in reserve and response', () => {
  assert.equal(areaDelta(act('ON', 'deload'), 'general_reserve', sp, ccgt), 200)
  assert.equal(areaDelta(act('ON', 'deload'), 'response', sp, ccgt), 200)
  assert.equal(areaDelta(act('ON', 'deload'), 'inertia', sp, ccgt), 0)
  assert.equal(areaDelta(act('ON', 'capacity'), 'recovery_reserve', sp, ccgt), 300)
  assert.equal(areaDelta(act('ON', 'capacity'), 'response', sp, wind), 0)   // WIND gives no response
})

test('areaDelta: desync removes headroom, inertia and voltage', () => {
  assert.equal(areaDelta(act('ON', 'desync'), 'contingency_reserve', sp, ccgt), -200)
  near(areaDelta(act('ON', 'desync'), 'inertia', sp, ccgt), -35)
  near(areaDelta(act('ON', 'desync'), 'voltage', sp, ccgt), -210)
  assert.equal(areaDelta(act('ON', 'desync'), 'inertia', sp, wind), 0)      // non-synchronous
  assert.equal(areaDelta(act('OFF', 'desync'), 'voltage', sp, ccgt), 0)     // not running
})

test('changeMw per type', () => {
  assert.equal(changeMw('start', 'OFF', sp, ccgt), 700)
  assert.equal(changeMw('deload', 'ON', sp, ccgt), -200)
  assert.equal(changeMw('deload', 'LOW', sp, ccgt), 0)
  assert.equal(changeMw('desync', 'ON', sp, ccgt), -400)
  assert.equal(changeMw('capacity', 'ON', sp, ccgt), 300)
})
