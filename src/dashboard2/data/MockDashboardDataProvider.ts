// Mock provider backed by mock-data.json (spec §11). Offsets are SP indices relative to the
// current SP; offset 0 is anchored to the start of the SP containing now at fetch time.

import rawMock from './mock-data.json'
import { MOCK_JITTER } from '../dashboard.config'
import { SP_MS, floorToSp } from '../time'
import type {
  AreaData, AreaId, DashboardData, DashboardDataProvider, SpState, StripAction, StripAreaData, TimeWindow,
} from '../types'

interface MockLinePoint { offset: number; requirement: number; available: number }
interface MockStripArea {
  items: { id: string; name: string }[]
  periods: Record<string, { itemStates: Record<string, SpState>; actions: StripAction[] }>
}
interface MockJson {
  forecastRunMinutesAgo: number
  areas: {
    posMargin: MockLinePoint[]
    negMargin: MockLinePoint[]
    inertia: MockLinePoint[]
    largestLoss: MockLinePoint[]
    constraints: MockStripArea
    reserve: MockStripArea
    response: MockStripArea
    interconnectors: { periods: { offset: number; netPositionMw: number }[] }
  }
}

const mock = rawMock as unknown as MockJson

const LINE_IDS = ['posMargin', 'negMargin', 'inertia', 'largestLoss'] as const
const STRIP_IDS = ['constraints', 'reserve', 'response'] as const

/** forecastRunAt = now − forecastRunMinutesAgo, floored to a 15-minute boundary. */
export function mockForecastRunAt(nowMs: number): number {
  const q = 15 * 60 * 1000
  return Math.floor((nowMs - mock.forecastRunMinutesAgo * 60 * 1000) / q) * q
}

/** Builds one area from the mock, filtered to the window (IC keeps the SP before window.start). */
export function buildMockArea(id: AreaId, window: TimeWindow, nowMs: number): AreaData {
  const anchor = floorToSp(nowMs)
  const startMs = Date.parse(window.start)
  const endMs = Date.parse(window.end)
  const at = (offset: number) => anchor + offset * SP_MS
  const inWin = (t: number) => t >= startMs && t < endMs

  if ((LINE_IDS as readonly string[]).includes(id)) {
    const series = mock.areas[id as typeof LINE_IDS[number]]
    return {
      kind: 'line',
      id,
      periods: series
        .filter(p => inWin(at(p.offset)))
        .map(p => ({
          spStart: new Date(at(p.offset)).toISOString(),
          requirement: p.requirement,
          available: MOCK_JITTER ? p.available * (1 + (Math.random() * 2 - 1) * 0.02) : p.available,
        })),
    }
  }

  if ((STRIP_IDS as readonly string[]).includes(id)) {
    const area = mock.areas[id as typeof STRIP_IDS[number]]
    const periods: StripAreaData['periods'] = []
    // Every SP the mock covers (offsets −1…47) exists; only non-ok SPs are listed in the JSON.
    for (let offset = -1; offset <= 47; offset++) {
      const t = at(offset)
      if (!inWin(t)) continue
      const p = area.periods[String(offset)]
      periods.push({
        spStart: new Date(t).toISOString(),
        itemStates: { ...(p?.itemStates ?? {}) },
        actions: [...(p?.actions ?? [])],
      })
    }
    return { kind: 'strip', id, items: area.items, periods }
  }

  return {
    kind: 'ic',
    id: 'interconnectors',
    periods: mock.areas.interconnectors.periods
      .filter(p => at(p.offset) >= startMs - SP_MS && at(p.offset) < endMs)
      .map(p => ({ spStart: new Date(at(p.offset)).toISOString(), netPositionMw: p.netPositionMw })),
  }
}

export const ALL_AREA_IDS: AreaId[] = [...LINE_IDS, ...STRIP_IDS, 'interconnectors']

export class MockDashboardDataProvider implements DashboardDataProvider {
  async fetch(window: TimeWindow): Promise<DashboardData> {
    const nowMs = Date.now()
    return {
      forecastRunAt: new Date(mockForecastRunAt(nowMs)).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
      window,
      areas: ALL_AREA_IDS.map(id => buildMockArea(id, window, nowMs)),
      mockSources: ALL_AREA_IDS.map(areaId => ({ areaId, part: 'all' as const })),
    }
  }
}
