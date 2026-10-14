import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  lineWorst, lineTone, cellState, cellVisual, aggregateActions, stripWorst, itemStateFromHeadroom,
  icSwings, largestSwing, icTone,
} from '../derive.ts'

const SP = 30 * 60 * 1000
const T0 = Date.parse('2026-10-15T13:00:00.000Z')
const at = k => new Date(T0 + k * SP).toISOString()

test('lineWorst finds minimum headroom inside the window and its requirement', () => {
  const periods = [
    { spStart: at(-1), requirement: 100, available: 0 },   // before window: ignored
    { spStart: at(0), requirement: 32000, available: 33000 },
    { spStart: at(1), requirement: 32100, available: 31430 },
    { spStart: at(2), requirement: 32000, available: 31800 },
    { spStart: at(4), requirement: 1, available: -5000 },  // at window end: ignored
  ]
  const w = lineWorst(periods, T0, T0 + 4 * SP)
  assert.equal(w.headroom, -670)
  assert.equal(w.requirement, 32100)
  assert.equal(w.spStart, at(1))
  assert.equal(lineWorst([], T0, T0 + SP), null)
})

test('lineTone: crit < 0, warn < tight only when something is required', () => {
  assert.equal(lineTone(-1, 100, 6), 'crit')
  assert.equal(lineTone(4, 120, 6), 'warn')
  assert.equal(lineTone(6, 120, 6), 'muted')
  assert.equal(lineTone(0, 0, 6), 'muted')
})

test('cell state is the worst item state; managed only when ok with actions', () => {
  const p = (itemStates, actions = []) => ({ spStart: at(0), itemStates, actions })
  assert.equal(cellState(p({ a: 'tight', b: 'violated' })), 'violated')
  assert.equal(cellState(p({})), 'ok')
  assert.equal(cellVisual(p({}, [{ direction: 'down', mw: 5 }])), 'managed')
  assert.equal(cellVisual(p({ a: 'tight' }, [{ direction: 'down', mw: 5 }])), 'tight')
  assert.equal(cellVisual(p({ a: 'ok' })), 'ok')
})

test('actions aggregate by direction', () => {
  assert.deepEqual(aggregateActions([
    { direction: 'down', mw: 100 }, { direction: 'down', mw: 50 }, { direction: 'up', mw: 100 },
  ]), { down: 150, up: 100 })
  assert.deepEqual(aggregateActions([]), { down: 0, up: 0 })
})

test('stripWorst: violated SPs and distinct violated items', () => {
  const periods = [
    { spStart: at(0), itemStates: { B6: 'tight' }, actions: [] },
    { spStart: at(1), itemStates: { B6: 'violated', SC1: 'violated' }, actions: [] },
    { spStart: at(2), itemStates: { B6: 'violated' }, actions: [] },
    { spStart: at(3), itemStates: {}, actions: [] },
  ]
  assert.deepEqual(stripWorst(periods, T0, T0 + 4 * SP), { kind: 'violated', spCount: 2, itemCount: 2 })
})

test('stripWorst: tight-only and all-ok and no-data', () => {
  const tight = [
    { spStart: at(0), itemStates: { DC_L: 'tight' }, actions: [] },
    { spStart: at(1), itemStates: { DC_L: 'tight' }, actions: [] },
  ]
  assert.deepEqual(stripWorst(tight, T0, T0 + 2 * SP), { kind: 'tight', spCount: 2, itemCount: 1 })
  assert.deepEqual(stripWorst([{ spStart: at(0), itemStates: {}, actions: [] }], T0, T0 + SP), { kind: 'ok' })
  assert.equal(stripWorst(tight, T0 + 5 * SP, T0 + 6 * SP), null)
})

test('itemStateFromHeadroom', () => {
  assert.equal(itemStateFromHeadroom(0, 0, 100), 'ok')
  assert.equal(itemStateFromHeadroom(500, 499, 100), 'violated')
  assert.equal(itemStateFromHeadroom(500, 599, 100), 'tight')
  assert.equal(itemStateFromHeadroom(500, 600, 100), 'ok')
})

test('IC swings use the SP before the window for the first boundary', () => {
  const periods = [
    { spStart: at(-1), netPositionMw: 800 },
    { spStart: at(0), netPositionMw: 900 },
    { spStart: at(1), netPositionMw: 3200 },
    { spStart: at(3), netPositionMw: 1600 }, // at(2) missing → no swing at 3
    { spStart: at(4), netPositionMw: 0 },    // outside window
  ]
  const s = icSwings(periods, T0, T0 + 4 * SP)
  assert.deepEqual(s, [
    { boundaryMs: T0, swing: 100 },
    { boundaryMs: T0 + SP, swing: 2300 },
  ])
  assert.deepEqual(largestSwing(s), { boundaryMs: T0 + SP, swing: 2300 })
  assert.equal(largestSwing([]), null)
})

test('IC tone thresholds', () => {
  assert.equal(icTone(2300, 1500, 2000), 'red')
  assert.equal(icTone(2000, 1500, 2000), 'red')
  assert.equal(icTone(1600, 1500, 2000), 'amber')
  assert.equal(icTone(1499, 1500, 2000), 'normal')
})
