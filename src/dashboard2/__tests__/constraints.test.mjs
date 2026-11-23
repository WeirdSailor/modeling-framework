import { test } from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

// Exercise the actual fixture, detail model and Dashboard adapter with project aliases.
const require = createRequire(import.meta.url)
const originalResolve = Module._resolveFilename
const originalTs = require.extensions['.ts']
const src = fileURLToPath(new URL('../../', import.meta.url))
let fixtures, summary, adapters, mockProvider, randomDemo
try {
  Module._resolveFilename = function (request, parent, ...rest) {
    return originalResolve.call(this, request.startsWith('@/') ? path.join(src, request.slice(2)) : request, parent, ...rest)
  }
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename)
  fixtures = require('../../config/constraintFixtures.ts')
  summary = require('../../utils/constraintSummary.ts')
  adapters = require('../data/realAdapters.ts')
  mockProvider = require('../data/MockDashboardDataProvider.ts')
  randomDemo = require('../../config/demoRandom.ts')
} finally {
  Module._resolveFilename = originalResolve
  if (originalTs) require.extensions['.ts'] = originalTs
  else delete require.extensions['.ts']
}

const nowMs = Date.parse('2026-11-23T23:42:00Z')
const anchor = fixtures.floorToSpMs(nowMs)
const iso = ms => new Date(ms).toISOString()
const windowFor = count => ({ start: iso(anchor), end: iso(anchor + count * summary.SP_MS) })
const runs = fixtures.buildDemoConstraintRuns(nowMs)
const detailFor = count => summary.buildConstraintTileViewModel({
  ...runs, now: iso(nowMs), window: windowFor(count),
})

test('12-hour constraint detail has several active, near-limit and clear boundaries', () => {
  const vm = detailFor(24)
  assert.equal(vm.activeRows.length, 6)
  assert.equal(vm.nearRows.length, 3)
  assert.equal(vm.withinCount, 11)
  assert.ok(vm.totals.peakTogether >= 3)
  assert.ok(vm.activeCountPerSlot.filter(n => n > 0).length <= 6)
  assert.ok(vm.changes.new.some(r => r.id === 'SC1'))
  assert.ok(vm.changes.cleared.some(r => r.id === 'B14'))
  assert.ok(vm.changes.worse.some(r => r.id === 'B7a'))
})

test('Dashboard constraint blocks match every detail cell at all supported horizons', () => {
  const all = adapters.buildRealArea('constraints', windowFor(48), { nowMs })
  for (const count of [4, 8, 16, 24, 48]) {
    const dashboard = adapters.buildRealArea('constraints', windowFor(count), { nowMs })
    const vm = detailFor(count)
    assert.equal(dashboard.periods.length, count)
    assert.equal(vm.slotTimes.length, count)
    assert.deepEqual(mockProvider.buildMockArea('constraints', windowFor(count), nowMs), dashboard)
    assert.deepEqual(dashboard.periods, all.periods.slice(0, count), `stable forecast at ${count} SPs`)
    const rows = [...vm.activeRows, ...vm.nearRows, ...vm.withinRows]
    for (let i = 0; i < count; i++) {
      const expected = {}
      for (const row of rows) {
        const band = row.cells[i].band
        if (summary.isActiveBand(band)) expected[row.id] = 'violated'
        else if (band === 'near') expected[row.id] = 'tight'
      }
      assert.equal(dashboard.periods[i].spStart, iso(vm.slotTimes[i]))
      assert.deepEqual(dashboard.periods[i].itemStates, expected)
      assert.equal(Object.values(expected).filter(s => s === 'violated').length, vm.activeCountPerSlot[i])
    }
  }
})

test('full-day demo has short issues separated by clear recovery periods', () => {
  assert.equal(runs.current.constraints.length, 20)
  for (const constraint of runs.current.constraints) {
    assert.equal(constraint.periods.length, 48)
    assert.ok(constraint.periods.every(p => p.flowMw >= 0 && p.limitMw > 0))
  }
  const vm = detailFor(48)
  assert.ok(vm.activeRows.length > detailFor(24).activeRows.length)
  assert.ok(vm.activeCountPerSlot.slice(24).some(n => n > 0))
  assert.deepEqual(fixtures.buildDemo24hRun(nowMs), runs.current)
})

test('Reserve, Response and Constraints demo rows are clear for at least two thirds of 12h and 24h', () => {
  for (const id of ['reserve', 'response', 'constraints']) {
    for (const count of [24, 48]) {
      const area = mockProvider.buildMockArea(id, windowFor(count), nowMs)
      const flagged = area.periods.filter(p => Object.keys(p.itemStates).length > 0)
      assert.equal(area.periods.length, count)
      assert.ok(flagged.length > 0 && flagged.length <= count / 3, `${id}: sparse issues at ${count} SPs`)
      assert.ok(flagged.some(p => Object.values(p.itemStates).includes('tight')))
      assert.ok(flagged.some(p => Object.values(p.itemStates).includes('violated')))
      let consecutive = 0
      for (const period of area.periods) {
        consecutive = Object.keys(period.itemStates).length > 0 ? consecutive + 1 : 0
        assert.ok(consecutive <= 3, `${id}: event lasts at most three SPs`)
      }
    }
  }
})

test('random demo events vary in length, spacing and area while staying stable across horizons', () => {
  const fingerprints = []
  for (const id of ['reserve', 'response', 'constraints']) {
    const area = mockProvider.buildMockArea(id, windowFor(48), nowMs)
    const flags = area.periods.map(p => Object.keys(p.itemStates).length > 0)
    const events = []
    flags.forEach((flag, i) => {
      if (!flag) return
      if (!flags[i - 1]) events.push({ start: i, length: 1 })
      else events.at(-1).length++
    })
    assert.ok(new Set(events.map(e => e.length)).size > 1, `${id}: varying durations`)
    assert.ok(new Set(events.slice(1).map((e, i) => e.start - events[i].start)).size > 1, `${id}: uneven spacing`)
    assert.notDeepEqual(flags, [...flags].reverse(), `${id}: not mirrored`)
    fingerprints.push(JSON.stringify(flags))
    for (const count of [4, 8, 16, 24, 48]) {
      assert.deepEqual(mockProvider.buildMockArea(id, windowFor(count), nowMs).periods, area.periods.slice(0, count))
    }
    assert.deepEqual(mockProvider.buildMockArea(id, windowFor(48), nowMs), area)
  }
  assert.equal(new Set(fingerprints).size, 3, 'each area has its own event times')
})

test('seeded event generation produces different sparse scenarios without changing on rerender', () => {
  const fingerprints = new Set()
  for (let seed = 0; seed < 50; seed++) {
    const events = randomDemo.demoIssueWindows(String(seed))
    assert.deepEqual(randomDemo.demoIssueWindows(String(seed)), events)
    assert.ok(events.some(e => e.start < 24))
    assert.ok(events.some(e => e.start >= 24))
    fingerprints.add(JSON.stringify(events))
    const slots = events.flatMap(e => Array.from({ length: e.length }, (_, i) => e.start + i))
    assert.ok(slots.filter(i => i < 24).length <= 8)
    assert.ok(slots.filter(i => i >= 24).length <= 8)
    assert.equal(new Set(slots).size, slots.length)
  }
  assert.equal(fingerprints.size, 50)
})
