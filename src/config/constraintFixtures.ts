// Dummy/fixture data for the "Active constraints" dashboard tile prototype.
// Real transmission-constraint forecasts are not wired up yet — see CLAUDE.md.
// The full-day demo groups issues into short events with clear recovery periods.
// The original 4h worked example is retained separately for the design reference.

import type { ForecastRun } from '@/models/types'
import { SP_MS } from '@/utils/constraintSummary'
import { demoIssueWindows, demoRandom, randomInt } from './demoRandom'

interface ConstraintShape {
  id: string
  name: string
  limitMw: number
  utils: number[] // one utilisation % per SP, aligned across all constraints in a run
}

// ── 4h / 8-SP fixture (14:00-18:00 in the spec's worked example) ──────────

const CURRENT_4H: ConstraintShape[] = [
  { id: 'B6',  name: 'Boundary B6',               limitMw: 6800,  utils: [102, 104, 105, 106, 107, 108, 106, 103] },
  { id: 'SC1', name: 'Scotland Boundary SC1',      limitMw: 4200,  utils: [97, 102, 104, 98, 93, 99, 103, 101] },
  { id: 'EC5', name: 'East Coast Boundary EC5',    limitMw: 3350,  utils: [88, 91, 94, 103, 93, 90, 87, 85] },
  { id: 'B7a', name: 'Boundary B7a',               limitMw: 5900,  utils: [85, 88, 90, 92, 96, 101, 106, 109] },
  { id: 'B8',  name: 'Boundary B8',                limitMw: 5300,  utils: [99, 101, 96, 94, 97, 102, 104, 98] },
  { id: 'B9',  name: 'Boundary B9',                limitMw: 5100,  utils: [80, 82, 85, 88, 90, 93, 101, 96] },
  { id: 'B4',  name: 'Boundary B4',                limitMw: 3200,  utils: [92, 94, 96, 97, 98, 97, 95, 93] },
  { id: 'SC2', name: 'Scotland Boundary SC2',      limitMw: 2900,  utils: [90, 93, 95, 97, 96, 94, 92, 90] },
  { id: 'LE1', name: 'London Extra-High Voltage 1',limitMw: 2400,  utils: [90, 93, 95, 96, 95, 94, 92, 91] },
  { id: 'B2',  name: 'Boundary B2',                limitMw: 3900,  utils: [71, 73, 74, 76, 78, 77, 75, 72] },
  { id: 'B5',  name: 'Boundary B5',                limitMw: 4600,  utils: [62, 64, 66, 68, 69, 70, 68, 65] },
  { id: 'B7',  name: 'Boundary B7',                limitMw: 7700,  utils: [80, 82, 84, 86, 88, 87, 85, 83] },
  { id: 'B11', name: 'Boundary B11',               limitMw: 5200,  utils: [55, 57, 58, 60, 61, 61, 60, 58] },
  { id: 'B13', name: 'Boundary B13',               limitMw: 3000,  utils: [74, 75, 77, 79, 80, 79, 78, 76] },
  { id: 'B14', name: 'Boundary B14',               limitMw: 11500, utils: [86, 88, 90, 91, 92, 91, 89, 87] },
  { id: 'B15', name: 'Boundary B15',               limitMw: 6400,  utils: [66, 68, 70, 71, 72, 73, 71, 69] },
  { id: 'B17', name: 'Boundary B17',               limitMw: 4100,  utils: [48, 50, 52, 53, 54, 55, 53, 51] },
  { id: 'SC3', name: 'Scotland Boundary SC3',      limitMw: 2600,  utils: [79, 81, 83, 85, 86, 85, 84, 82] },
  { id: 'SW1', name: 'South West Boundary SW1',    limitMw: 3300,  utils: [68, 70, 71, 73, 74, 74, 72, 70] },
  { id: 'NW3', name: 'North West Boundary NW3',    limitMw: 2200,  utils: [60, 61, 63, 64, 65, 66, 64, 62] },
]

// Previous run (30 min earlier): identical except SC1 and B9 never exceed 100%,
// B14 breaches once (101% at the 16:00 SP), and B7a's peak is lower (105% vs 109%).
const PREVIOUS_4H: ConstraintShape[] = CURRENT_4H.map(c => {
  if (c.id === 'SC1') return { ...c, utils: [97, 99, 100, 98, 93, 99, 99, 99] }
  if (c.id === 'B9')  return { ...c, utils: [80, 82, 85, 88, 90, 93, 98, 96] }
  if (c.id === 'B14') return { ...c, utils: [86, 88, 90, 91, 101, 91, 89, 87] }
  if (c.id === 'B7a') return { ...c, utils: [85, 88, 90, 92, 96, 101, 103, 105] }
  return c
})

function stampRun(runId: string, runTimeMs: number, anchorMs: number, shapes: ConstraintShape[]): ForecastRun {
  return {
    runId,
    runTime: new Date(runTimeMs).toISOString(),
    constraints: shapes.map(s => ({
      id: s.id,
      name: s.name,
      periods: s.utils.map((u, i) => {
        const start = anchorMs + i * SP_MS
        const flowMw = Math.round(u * s.limitMw / 100) // half-up, per spec
        return { start: new Date(start).toISOString(), flowMw, limitMw: s.limitMw }
      }),
    })),
  }
}

/** Floors an epoch ms value to the nearest settlement-period boundary (UTC :00/:30). */
export function floorToSpMs(ms: number): number {
  return ms - (ms % SP_MS)
}

/**
 * Builds the 4h demo fixture anchored to `nowMs` so the tile always looks live:
 * window starts at the current SP boundary (mirrors the spec's 14:00 window with
 * now=14:10 — ~0-30min into the first SP), current run 15min old, previous run 45min old.
 */
export function buildDemo4hRuns(nowMs: number): { current: ForecastRun; previous: ForecastRun } {
  const anchorMs = floorToSpMs(nowMs)
  const current = stampRun('current', nowMs - 15 * 60 * 1000, anchorMs, CURRENT_4H)
  const previous = stampRun('previous', nowMs - 45 * 60 * 1000, anchorMs, PREVIOUS_4H)
  return { current, previous }
}

// ── 24h / 48-SP demo — sustained, intermittent and isolated issues ──

const ISSUE_WINDOWS = demoIssueWindows('constraints-uneven-v1')

const CURRENT_24H: ConstraintShape[] = CURRENT_4H.map((constraint, index) => {
  const random = demoRandom('constraint-' + constraint.id)
  let baseline = randomInt(random, 52, 83)
  const utils = Array.from({ length: 48 }, () => {
    baseline = Math.max(40, Math.min(92, baseline + randomInt(random, -6, 7)))
    return baseline
  })
  const active = index < 6 || constraint.id === 'B7' || constraint.id === 'B13'
  const near = index >= 6 && index <= 8
  if (active || near) {
    const eligible = ISSUE_WINDOWS.filter(w => index < 9 || w.start >= 24)
    const required = index < 9 ? eligible.find(w => w.start < 24) : eligible[0]
    for (const window of eligible) {
      if (window !== required && random() < 0.45) continue
      const offset = randomInt(random, 0, window.length - 1)
      const length = randomInt(random, 1, window.length - offset)
      for (let i = 0; i < length; i++) {
        const breach = active && (i === 0 || random() < 0.65)
        utils[window.start + offset + i] = breach
          ? randomInt(random, constraint.id === 'B7a' ? 108 : 101, 113)
          : randomInt(random, 95, 100)
      }
    }
  }
  return { ...constraint, utils }
})

// Keep meaningful New / Cleared / Worse comparisons throughout the full day.
const PREVIOUS_24H: ConstraintShape[] = CURRENT_24H.map(c => {
  if (c.id === 'SC1' || c.id === 'B9') return { ...c, utils: c.utils.map(u => Math.min(u, 100)) }
  if (c.id === 'B7a') return { ...c, utils: c.utils.map(u => Math.min(u, 105)) }
  if (c.id === 'B14') {
    const utils = [...c.utils]
    const random = demoRandom('previous-B14')
    utils[randomInt(random, 0, 23)] = randomInt(random, 101, 105)
    utils[randomInt(random, 24, 47)] = randomInt(random, 101, 105)
    return { ...c, utils }
  }
  return c
})

/** One shared full-day forecast for Dashboard blocks and the constraint detail list. */
export function buildDemoConstraintRuns(nowMs: number): { current: ForecastRun; previous: ForecastRun } {
  const anchorMs = floorToSpMs(nowMs)
  return {
    current: stampRun('current-24h', nowMs - 15 * 60 * 1000, anchorMs, CURRENT_24H),
    previous: stampRun('previous-24h', nowMs - 45 * 60 * 1000, anchorMs, PREVIOUS_24H),
  }
}

export function buildDemo24hRun(nowMs: number): ForecastRun {
  return buildDemoConstraintRuns(nowMs).current
}

// ── Contracted services (dummy, per-constraint) ─────────────────────────
// Not period-specific — like real SR/QR/Response contracts, these represent
// standing capacity committed to the boundary/area, not a single settlement
// period. Deterministic per constraint id so the demo is stable across renders.

export interface ContractedServices {
  slowReserveMw: number
  quickReserveMw: number
  response: { dm: number; dr: number; dc: number }
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}

function seededValue(seed: number, min: number, max: number, step = 5): number {
  const x = Math.sin(seed) * 10000
  const frac = x - Math.floor(x)
  return Math.round((min + frac * (max - min)) / step) * step
}

export function getContractedServices(constraintId: string): ContractedServices {
  const base = hashStr(constraintId)
  return {
    slowReserveMw: seededValue(base + 1, 100, 400),
    quickReserveMw: seededValue(base + 2, 50, 300),
    response: {
      dm: seededValue(base + 3, 20, 160),
      dr: seededValue(base + 4, 20, 160),
      dc: seededValue(base + 5, 20, 200),
    },
  }
}
