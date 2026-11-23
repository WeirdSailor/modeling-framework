import { test } from 'node:test'
import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const originalResolve = Module._resolveFilename
const originalTs = require.extensions['.ts']
const originalTsx = require.extensions['.tsx']
const src = fileURLToPath(new URL('../../', import.meta.url))
let adapters, reference, derive, fixtures, mockProvider, areaSources, IcChart, cursor, geometry, icConfig
try {
  Module._resolveFilename = function (request, parent, ...rest) {
    return originalResolve.call(this, request.startsWith('@/') ? path.join(src, request.slice(2)) : request, parent, ...rest)
  }
  require.extensions['.ts'] = require.extensions['.tsx'] = (module, filename) => module._compile(ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename)
  adapters = require('../data/realAdapters.ts')
  reference = require('../data/interconnectorReference.ts')
  derive = require('../derive.ts')
  fixtures = require('../../config/interconnectorFixtures.ts')
  mockProvider = require('../data/MockDashboardDataProvider.ts')
  areaSources = require('../state/areaSources.ts')
  IcChart = require('../components/charts/IcChart.tsx').default
  cursor = require('../state/cursorStore.ts')
  geometry = require('../geometry.ts')
  icConfig = require('../dashboard.config.ts').AREA_CONFIG.find(c => c.id === 'interconnectors')
} finally {
  Module._resolveFilename = originalResolve
  if (originalTs) require.extensions['.ts'] = originalTs
  else delete require.extensions['.ts']
  if (originalTsx) require.extensions['.tsx'] = originalTsx
  else delete require.extensions['.tsx']
}

const SP = 1_800_000
const base = Date.parse('2026-11-23T00:00:00Z')
const iso = ms => new Date(ms).toISOString()
const period = (index, pn, confirmed = true) => ({
  settlementDate: '2026-11-23', settlementPeriod: index + 1,
  startTime: iso(base + index * SP), pn, hasConfirmedPn: confirmed,
})
const refs = [
  { bmUnitId: 'I_IBG-TEST1', interconnectorId: 'BRITNED' },
  { bmUnitId: 'I_IBD-TEST1', interconnectorId: 'BRITNED' },
  { bmUnitId: 'I_IFG-TEST1', interconnectorId: 'FRANCE' },
  { bmUnitId: 'I_IMG-TEST1', interconnectorId: 'MOYLE' },
]
const win = { start: iso(base + SP), end: iso(base + 4 * SP) }

test('group generation and demand accounts by reference interconnector, preserving signed totals', () => {
  const ctx = { settlementPeriods: [0, 1, 2, 3].map(index => period(index, {
    'I_IBG-TEST1': 700 + 100 * index, 'I_IBD-TEST1': -200,
    'I_IFG-TEST1': -300 + 10 * index, 'I_FUTURE-1': 20,
    'T_POWER-1': 9999,
  })) }
  const rows = adapters.buildInterconnectorRows(win, ctx, refs)
  assert.deepEqual(rows.map(r => r.name), ['BritNed', 'I_FUTURE-1', 'IFA', 'Moyle'])
  const britned = rows.find(r => r.id === 'BRITNED').area
  assert.deepEqual(britned.periods.map(p => p.netPositionMw), [500, 600, 700, 800])
  const total = adapters.buildRealArea('interconnectors', win, ctx)
  for (const p of total.periods) {
    const sum = rows.reduce((n, row) => n + (row.area.periods.find(r => r.spStart === p.spStart)?.netPositionMw ?? 0), 0)
    assert.equal(sum, p.netPositionMw)
  }
  assert.deepEqual(derive.icSwings(britned.periods, base + SP, base + 4 * SP).map(s => s.swing), [100, 100, 100])
  assert.deepEqual(rows.find(r => r.id === 'MOYLE').area.periods, [])
})

test('missing account data stays a gap; an explicit zero is a valid position', () => {
  const ctx = { settlementPeriods: [
    period(0, { 'I_IBG-TEST1': 100 }), period(1, {}),
    period(2, { 'I_IBG-TEST1': 0 }), period(3, { 'I_IBG-TEST1': 300 }),
  ] }
  const row = adapters.buildInterconnectorRows(win, ctx, refs).find(r => r.id === 'BRITNED')
  assert.deepEqual(row.area.periods.map(p => p.netPositionMw), [100, 0, 300])
  assert.deepEqual(derive.icSwings(row.area.periods, base + SP, base + 4 * SP), [
    { boundaryMs: base + 3 * SP, swing: 300, estimated: false },
  ])
})

test('individual charts suppress confirmed-to-estimate seams and fade subsequent estimated swings', () => {
  const ctx = { settlementPeriods: [
    period(0, { 'I_IBG-TEST1': 100 }), period(1, { 'I_IBG-TEST1': 200 }),
    period(2, { 'I_IBG-TEST1': 1800 }, false), period(3, { 'I_IBG-TEST1': 2000 }, false),
  ] }
  const row = adapters.buildInterconnectorRows(win, ctx, refs).find(r => r.id === 'BRITNED')
  assert.deepEqual(derive.icSwings(row.area.periods, base + SP, base + 4 * SP), [
    { boundaryMs: base + SP, swing: 100, estimated: false },
    { boundaryMs: base + 3 * SP, swing: 200, estimated: true },
  ])
  assert.equal(row.area.periods[2].sourceStart, '2026-11-22T01:00:00.000Z')
})

test('reference parsing uses the Elexon key and excludes generation units and unassigned units', () => {
  assert.deepEqual(reference.parseInterconnectorReference([
    { elexonBmUnit: 'I_IBG-TEST1', nationalGridBmUnit: 'IBG-TEST1', interconnectorId: 'BRITNED' },
    { elexonBmUnit: null, nationalGridBmUnit: 'I_IFG-TEST1', interconnectorId: 'FRANCE' },
    { elexonBmUnit: 'T_POWER-1', interconnectorId: null },
    { elexonBmUnit: 'I_FUTURE-1', interconnectorId: null },
  ]), refs.filter(r => r.bmUnitId !== 'I_IBD-TEST1' && r.bmUnitId !== 'I_IMG-TEST1'))
})

test('reference loading can retry a failed request and caches successful results', async () => {
  const previousFetch = globalThis.fetch
  let calls = 0
  try {
    globalThis.fetch = async () => {
      calls++
      return calls === 1 ? { ok: false, status: 503 } : {
        ok: true, json: async () => [{ elexonBmUnit: 'I_IBG-TEST1', interconnectorId: 'BRITNED' }],
      }
    }
    await assert.rejects(reference.loadInterconnectorReference(), /503/)
    const loaded = await reference.loadInterconnectorReference()
    assert.deepEqual(loaded, [refs[0]])
    assert.strictEqual(await reference.loadInterconnectorReference(), loaded)
    assert.equal(calls, 2)
  } finally { globalThis.fetch = previousFetch }
})

const demoNow = Date.parse('2026-11-23T23:42:00Z')
const demoAnchor = demoNow - demoNow % SP
const demoWindow = count => ({ start: iso(demoAnchor), end: iso(demoAnchor + count * SP) })

test('demo has seven affected interconnectors and three quieter ones in the default 12-hour view', () => {
  const window = demoWindow(24)
  const rows = fixtures.buildDemoInterconnectorRows(window, demoNow)
  assert.equal(rows.length, 10)
  const tones = rows.map(row => {
    const swings = derive.icSwings(row.area.periods, demoAnchor, demoAnchor + 24 * SP)
    return derive.icTone(Math.abs(derive.largestSwing(swings).swing), 1500, 2000)
  })
  assert.ok(tones.filter(t => t === 'red').length >= 2)
  assert.ok(tones.filter(t => t === 'amber').length >= 2)
  assert.equal(tones.filter(t => t === 'normal').length, 3)
  const total = fixtures.buildDemoInterconnectors(window, demoNow)
  const swings = derive.icSwings(total.periods, demoAnchor, demoAnchor + 24 * SP)
  assert.ok(swings.filter(s => Math.abs(s.swing) >= 2000).length >= 4)
  assert.ok(swings.some(s => s.swing <= -2000))
  assert.ok(swings.some(s => s.swing >= 2000))
  assert.ok(swings.some(s => s.estimated))
  assert.ok(swings.some(s => !s.estimated))
  assert.ok(!swings.some(s => s.boundaryMs === demoAnchor + 4 * SP), 'no swing across the estimate seam')
})

test('demo Dashboard totals are the sum of individual positions at every SP and horizon', () => {
  const full = fixtures.buildDemoInterconnectors(demoWindow(48), demoNow)
  for (const count of [4, 8, 16, 24, 48]) {
    const window = demoWindow(count)
    const rows = fixtures.buildDemoInterconnectorRows(window, demoNow)
    const total = fixtures.buildDemoInterconnectors(window, demoNow)
    assert.equal(total.periods.length, count + 1, 'include preceding SP for first swing')
    assert.deepEqual(total.periods, full.periods.slice(0, count + 1))
    assert.deepEqual(mockProvider.buildMockArea('interconnectors', window, demoNow), total)
    for (const [index, period] of total.periods.entries()) {
      assert.equal(period.netPositionMw, rows.reduce((sum, row) => sum + row.area.periods[index].netPositionMw, 0))
      assert.ok(rows.every(row => row.area.periods[index].spStart === period.spStart))
    }
    assert.deepEqual(fixtures.buildDemoInterconnectorRows(window, demoNow), rows, 'deterministic across rerenders')
  }
})

test('interconnector demo profiles have independent irregular changes rather than repeated cycles', () => {
  const rows = fixtures.buildDemoInterconnectorRows(demoWindow(48), demoNow)
  const fingerprints = new Set()
  for (const row of rows) {
    const positions = row.area.periods.map(p => p.netPositionMw)
    assert.notDeepEqual(positions, [...positions].reverse())
    assert.notDeepEqual(positions.slice(1, 25), positions.slice(25))
    assert.ok(new Set(positions).size > 5)
    fingerprints.add(JSON.stringify(positions))
    const largeChanges = derive.icSwings(row.area.periods, demoAnchor, demoAnchor + 48 * SP)
      .filter(s => Math.abs(s.swing) >= 1500)
    if (largeChanges.length >= 3) {
      assert.ok(new Set(largeChanges.slice(1).map((s, i) => s.boundaryMs - largeChanges[i].boundaryMs)).size > 1)
    }
  }
  assert.equal(fingerprints.size, 10)
})

test('each individual chart renders visible grey bars between the issue spikes', () => {
  const window = demoWindow(24)
  const scale = geometry.createXScale(demoAnchor, demoAnchor + 24 * SP, 1000)
  for (const row of fixtures.buildDemoInterconnectorRows(window, demoNow)) {
    const html = renderToStaticMarkup(createElement(cursor.CursorContext.Provider, { value: cursor.createCursorStore() },
      createElement(IcChart, {
        area: row.area, cfg: icConfig, scale, height: 96, nowMs: demoNow,
        showDirectionLabels: false, onDrillDown: () => {},
      })))
    const greyBars = [...html.matchAll(/<rect\b[^>]*fill="#7D8A9C"[^>]*>/g)]
    const visible = greyBars.filter(([tag]) => Number(tag.match(/height="([^"]+)"/)[1]) >= 2)
    assert.ok(visible.length >= 5, `${row.name}: visible normal bars`)
    assert.ok(!html.includes('Import to GB') && !html.includes('Export from GB'))
  }
})

test('opposing individual demo swings cancel correctly in the consolidated graph', () => {
  const window = demoWindow(24)
  const individual = fixtures.buildDemoInterconnectorRows(window, demoNow).map(row =>
    new Map(derive.icSwings(row.area.periods, demoAnchor, demoAnchor + 24 * SP).map(s => [s.boundaryMs, s.swing])))
  const total = fixtures.buildDemoInterconnectors(window, demoNow)
  let cancellation = false
  for (const consolidated of derive.icSwings(total.periods, demoAnchor, demoAnchor + 24 * SP)) {
    const swings = individual.map(series => series.get(consolidated.boundaryMs))
    assert.equal(consolidated.swing, swings.reduce((sum, swing) => sum + swing, 0))
    if (swings.reduce((sum, swing) => sum + Math.abs(swing), 0) >= 3500 && Math.abs(consolidated.swing) < 1500) cancellation = true
  }
  assert.ok(cancellation)
})

test('demo source migration preserves other areas and later explicit Real choices', () => {
  const previousWindow = globalThis.window
  try {
    for (const [saved, expected] of [
      [null, 'mock'],
      [{ interconnectors: 'real', reserve: 'mock' }, 'mock'],
      [{ interconnectors: 'real', reserve: 'mock', __icSourceVersion: 1 }, 'real'],
    ]) {
      globalThis.window = { localStorage: { getItem: () => saved === null ? null : JSON.stringify(saved) } }
      let result
      function Probe() { result = areaSources.useAreaSources().sources; return null }
      renderToStaticMarkup(createElement(Probe))
      assert.equal(result.interconnectors, expected)
      if (saved) assert.equal(result.reserve, 'mock')
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})

test('sparse Reserve/Response demos replace older defaults while later Real overrides persist', () => {
  const previousWindow = globalThis.window
  try {
    for (const version of [undefined, 1]) {
      const saved = {
        reserve: 'real', response: 'real', inertia: 'mock', interconnectors: 'real',
        __icSourceVersion: 1, __stripSourceVersion: version,
      }
      globalThis.window = { localStorage: { getItem: () => JSON.stringify(saved) } }
      let result
      function Probe() { result = areaSources.useAreaSources().sources; return null }
      renderToStaticMarkup(createElement(Probe))
      assert.equal(result.reserve, version === 1 ? 'real' : 'mock')
      assert.equal(result.response, version === 1 ? 'real' : 'mock')
      assert.equal(result.inertia, 'mock')
      assert.equal(result.interconnectors, 'real')
    }
  } finally {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  }
})
