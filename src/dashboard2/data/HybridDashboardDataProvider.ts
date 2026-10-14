// Composes real adapters and the mock into one DashboardData payload. The per-area choice comes
// from getSources() (defaults: AREA_SOURCES in dashboard.config.ts, overridable in Config → Data);
// an area on 'real' falls back to the mock if its adapter has no mapping or throws.

import { AREA_CONFIG, REAL_SOURCE_IS_FIXTURE, type AreaSources } from '../dashboard.config'
import type {
  AreaData, DashboardData, DashboardDataProvider, MockSource, StripAreaData, TimeWindow,
} from '../types'
import { buildMockArea, mockForecastRunAt } from './MockDashboardDataProvider'
import { buildRealArea, readRealContext, realDataLoadedAt } from './realAdapters'

/** Overlays mock actions onto real strip periods with the same spStart (never creates new SPs). */
function withMockActions(real: StripAreaData, mock: StripAreaData): StripAreaData {
  const actionsBySp = new Map(mock.periods.map(p => [Date.parse(p.spStart), p.actions]))
  return {
    ...real,
    periods: real.periods.map(p => {
      const extra = actionsBySp.get(Date.parse(p.spStart))
      return extra && extra.length > 0 ? { ...p, actions: [...p.actions, ...extra] } : p
    }),
  }
}

export class HybridDashboardDataProvider implements DashboardDataProvider {
  private readonly getReservePct: () => number
  private readonly getSources: () => AreaSources

  constructor(getReservePct: () => number, getSources: () => AreaSources) {
    this.getReservePct = getReservePct
    this.getSources = getSources
  }

  async fetch(window: TimeWindow): Promise<DashboardData> {
    const nowMs = Date.now()
    const ctx = readRealContext(this.getReservePct(), nowMs)
    const sources = this.getSources()
    const areas: AreaData[] = []
    const mockSources: MockSource[] = []
    let anyReal = false

    for (const cfg of AREA_CONFIG) {
      const { id } = cfg
      let area: AreaData | null = null
      if (sources[id] === 'real') {
        try {
          area = buildRealArea(id, window, ctx)
        } catch (err) {
          console.warn(`[dashboard2] real adapter for ${id} failed — falling back to mock`, err)
        }
      }

      if (!area) {
        areas.push(buildMockArea(id, window, nowMs))
        mockSources.push({ areaId: id, part: 'all' })
        continue
      }

      anyReal = true
      if (REAL_SOURCE_IS_FIXTURE[id]) mockSources.push({ areaId: id, part: 'all' })

      if (area.kind === 'strip' && cfg.kind === 'strip' && cfg.actionsSource === 'mock') {
        area = withMockActions(area, buildMockArea(id, window, nowMs) as StripAreaData)
        if (!REAL_SOURCE_IS_FIXTURE[id]) mockSources.push({ areaId: id, part: 'actions' })
      }
      areas.push(area)
    }

    const forecastRunAt = anyReal
      ? realDataLoadedAt() ?? nowMs
      : mockForecastRunAt(nowMs)

    return {
      forecastRunAt: new Date(forecastRunAt).toISOString(),
      updatedAt: new Date(nowMs).toISOString(),
      window,
      areas,
      mockSources,
    }
  }
}
