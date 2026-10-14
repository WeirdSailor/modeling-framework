// Run with: npm run test:dashboard2  (node --test; Node ≥ 23 strips the TS types natively)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SP_MS, floorToSp, presetWindow, settlementDaySpStarts, settlementSpStartUtc, londonMidnightUtc,
  londonLocalToUtc, snapCustomRange, validateCustomRange, axisTicks, pickTickStep, formatHHMM,
  isLondonMidnight, formatDayDateTime, fromLondonInputValue, toLondonInputValue, spStartsBetween,
} from '../time.ts'

const iso = ms => new Date(ms).toISOString()

test('normal day has 48 SPs', () => {
  assert.equal(settlementDaySpStarts('2026-10-14').length, 48)
  assert.equal(settlementDaySpStarts('2026-01-14').length, 48)
})

test('spring-forward day (2026-03-29) has 46 SPs in 30-minute UTC steps', () => {
  const sps = settlementDaySpStarts('2026-03-29')
  assert.equal(sps.length, 46)
  assert.equal(iso(sps[0]), '2026-03-29T00:00:00.000Z') // 00:00 GMT
  assert.equal(iso(sps[45]), '2026-03-29T22:30:00.000Z') // 23:30 BST
  for (let i = 1; i < sps.length; i++) assert.equal(sps[i] - sps[i - 1], SP_MS)
  // Local labels skip 01:00–02:00
  assert.deepEqual(sps.slice(1, 4).map(formatHHMM), ['00:30', '02:00', '02:30'])
})

test('fall-back day (2026-10-25) has 50 SPs and repeats 01:00–02:00 locally', () => {
  const sps = settlementDaySpStarts('2026-10-25')
  assert.equal(sps.length, 50)
  assert.equal(iso(sps[0]), '2026-10-24T23:00:00.000Z') // 00:00 BST
  assert.equal(iso(sps[49]), '2026-10-25T23:30:00.000Z') // 23:30 GMT
  for (let i = 1; i < sps.length; i++) assert.equal(sps[i] - sps[i - 1], SP_MS)
  assert.deepEqual(sps.slice(2, 7).map(formatHHMM), ['01:00', '01:30', '01:00', '01:30', '02:00'])
})

test('settlementSpStartUtc counts elapsed SPs from London midnight', () => {
  assert.equal(iso(settlementSpStartUtc('2026-10-13', 30)), '2026-10-13T13:30:00.000Z') // BST
  assert.equal(iso(settlementSpStartUtc('2026-12-01', 30)), '2026-12-01T14:30:00.000Z') // GMT
  assert.equal(iso(settlementSpStartUtc('2026-10-25', 50)), '2026-10-25T23:30:00.000Z')
  assert.equal(iso(settlementSpStartUtc('2026-03-29', 46)), '2026-03-29T22:30:00.000Z')
  assert.equal(iso(londonMidnightUtc('2026-07-01')), '2026-06-30T23:00:00.000Z')
})

test('preset window starts at the SP containing now (14:25 → 14:00–02:00 for 12h)', () => {
  const now = londonLocalToUtc(2026, 10, 15, 14, 25)
  const w = presetWindow(now, 12)
  assert.equal(formatHHMM(w.start), '14:00')
  assert.equal(formatHHMM(w.end), '02:00')
  assert.equal((w.end - w.start) / SP_MS, 24)
})

test('window rolls forward exactly at the SP boundary', () => {
  const boundary = Date.parse('2026-10-15T13:30:00.000Z')
  assert.equal(presetWindow(boundary - 1, 2).start, boundary - SP_MS)
  assert.equal(presetWindow(boundary, 2).start, boundary)
  assert.equal(floorToSp(boundary + SP_MS - 1), boundary)
})

test('12h window across the fall-back night still has 24 SPs', () => {
  const now = Date.parse('2026-10-24T20:10:00.000Z')
  const w = presetWindow(now, 12)
  assert.equal(spStartsBetween(w.start, w.end).length, 24)
})

test('custom range snaps start down and end up', () => {
  const r = snapCustomRange(Date.parse('2026-10-15T17:10:00Z'), Date.parse('2026-10-15T19:05:00Z'))
  assert.equal(iso(r.start), '2026-10-15T17:00:00.000Z')
  assert.equal(iso(r.end), '2026-10-15T19:30:00.000Z')
})

test('custom range validation', () => {
  const a = Date.parse('2026-10-15T17:00:00Z')
  const min = SP_MS, max = 48 * 3600_000
  assert.equal(validateCustomRange(a, a + SP_MS, min, max), null)
  assert.match(validateCustomRange(a, a, min, max), /after/)
  assert.match(validateCustomRange(a, a + 49 * 3600_000, min, max), /48h/)
  assert.match(validateCustomRange(NaN, a, min, max), /both/)
})

test('axis ticks follow London wall clock and exclude window edges', () => {
  const start = londonLocalToUtc(2026, 10, 15, 14, 0)
  const ticks = axisTicks(start, start + 12 * 3600_000, 60)
  assert.equal(ticks.length, 11)
  assert.equal(formatHHMM(ticks[0]), '15:00')
  assert.ok(isLondonMidnight(ticks[9]))
  assert.equal(formatDayDateTime(ticks[9]), 'Fri 16 Oct 00:00')
})

test('2-hourly ticks land on even local hours in BST', () => {
  const start = londonLocalToUtc(2026, 10, 15, 13, 0)
  const ticks = axisTicks(start, start + 24 * 3600_000, 120)
  assert.ok(ticks.every(t => Number(formatHHMM(t).slice(0, 2)) % 2 === 0))
})

test('custom tick step picks the smallest candidate ≥ min px', () => {
  assert.equal(pickTickStep(2 * 3600_000, 1500, [30, 60, 120], 80), 30)
  assert.equal(pickTickStep(48 * 3600_000, 900, [30, 60, 120, 180, 240, 360, 720], 80), 360)
})

test('datetime-local values round-trip in London time', () => {
  const v = '2026-10-15T18:00'
  const t = fromLondonInputValue(v)
  assert.equal(iso(t), '2026-10-15T17:00:00.000Z')
  assert.equal(toLondonInputValue(t), v)
  assert.ok(Number.isNaN(fromLondonInputValue('nope')))
})
