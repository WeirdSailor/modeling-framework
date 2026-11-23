// Mock lines and service product names come from JSON; issue timelines use shared seeded fixtures.
// Offsets are SP indices relative to the
// current SP; offset 0 is anchored to the start of the SP containing now at fetch time.

import rawMock from './mock-data.json'
import { buildDemoInterconnectors } from '@/config/interconnectorFixtures'
import { buildDemoServiceArea } from '@/config/serviceFixtures'
import { buildConstraintArea } from './constraintData'
import { MOCK_JITTER } from '../dashboard.config'
import { SP_MS, floorToSp } from '../time'
import type {
  AreaData, AreaId, DashboardData, DashboardDataProvider, StripAreaData, TimeWindow,
} from '../types'

interface MockLinePoint { offset: number; requirement: number; available: number }
interface MockStripArea {
  items: { id: string; name: string }[]
}
interface MockJson {
  forecastRunMinutesAgo: number
  areas: {
    posMargin: MockLinePoint[]
    negMargin: MockLinePoint[]
    inertia: MockLinePoint[]
    largestLoss: MockLinePoint[]
    reserve: MockStripArea
    response: MockStripArea
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
  if (id === 'constraints') return buildConstraintArea(window, nowMs)
  if (id === 'reserve' || id === 'response') return buildDemoServiceArea(id, mock.areas[id].items, window, nowMs)
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

  return buildDemoInterconnectors(window, nowMs)
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
