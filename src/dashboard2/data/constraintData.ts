import { buildDemoConstraintRuns } from '@/config/constraintFixtures'
import { bandForUtilisation } from '@/utils/constraintSummary'
import type { SpState, StripAreaData, TimeWindow } from '../types'

/** The Dashboard and detail page always show the same demo forecast. */
export function buildConstraintArea(window: TimeWindow, nowMs: number): StripAreaData {
  const run = buildDemoConstraintRuns(nowMs).current
  const startMs = Date.parse(window.start), endMs = Date.parse(window.end)
  const bySlot = new Map<number, Record<string, SpState>>()
  for (const constraint of run.constraints) {
    for (const period of constraint.periods) {
      const t = Date.parse(period.start)
      if (t < startMs || t >= endMs) continue
      const band = bandForUtilisation(period.limitMw > 0 ? period.flowMw / period.limitMw * 100 : null)
      if (band === 'noData') continue
      const states = bySlot.get(t) ?? {}
      if (band === 'active' || band === 'activeSevere') states[constraint.id] = 'violated'
      else if (band === 'near') states[constraint.id] = 'tight'
      bySlot.set(t, states)
    }
  }
  return {
    kind: 'strip', id: 'constraints',
    items: run.constraints.map(c => ({ id: c.id, name: c.name })),
    periods: [...bySlot].sort((a, b) => a[0] - b[0]).map(([t, itemStates]) => ({
      spStart: new Date(t).toISOString(), itemStates, actions: [],
    })),
  }
}
