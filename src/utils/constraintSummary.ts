// Pure, framework-free derivation for the "Active constraints" dashboard tile.
// No React, no Date.now() — `now` is always an input, never read from the clock here.

import type {
  ConstraintBand,
  ConstraintChangeType,
  ConstraintForecast,
  ConstraintPeriod,
  ConstraintStatus,
  ConstraintTileInput,
  ForecastRun,
} from '@/models/types'

export const NEAR_THRESHOLD = 95            // >=95 and <=100 -> near
export const ACTIVE_THRESHOLD = 100         // >100 and <=105 -> active
export const ACTIVE_SEVERE_THRESHOLD = 105  // >105 -> activeSevere
export const WORSE_THRESHOLD_PP = 2  // worst utilisation must rise by at least this many points to count as "worse"
export const DENSE_MODE_SP_THRESHOLD = 12 // windows with more SPs than this render as a dense strip (no gaps/values)
export const MIN_ACTIVE_CELL_PX = 6  // minimum rendered width for an active/near cell in dense mode

export const SP_MS = 30 * 60 * 1000

// ── Bands ────────────────────────────────────────────────────────────────

export function bandForUtilisation(util: number | null): ConstraintBand {
  if (util == null) return 'noData'
  if (util > ACTIVE_SEVERE_THRESHOLD) return 'activeSevere'
  if (util > ACTIVE_THRESHOLD) return 'active'
  if (util >= NEAR_THRESHOLD) return 'near'
  return 'within'
}

export function isActiveBand(band: ConstraintBand): boolean {
  return band === 'active' || band === 'activeSevere'
}

function periodUtilisation(p: ConstraintPeriod | null | undefined): number | null {
  if (!p) return null
  if (p.limitMw == null || p.limitMw <= 0) {
    if (p.limitMw != null) {
      // eslint-disable-next-line no-console
      console.warn(`constraintSummary: non-positive limitMw (${p.limitMw}) at ${p.start}; treating period as no-data`)
    }
    return null
  }
  if (p.flowMw == null) return null
  return (p.flowMw / p.limitMw) * 100
}

function toMs(iso: string): number {
  return new Date(iso).getTime()
}

// ── Shared window grid ──────────────────────────────────────────────────

export interface WindowedCell {
  start: string          // ISO, SP start
  end: string             // ISO, SP end (start + 30min)
  flowMw: number | null
  limitMw: number | null
  utilisationPct: number | null
  band: ConstraintBand
  coveredMinutes: number  // portion of this SP's 30 minutes that falls inside the window (0-30)
}

/** All distinct SP start times (ms) across the run's constraints that overlap the window, ascending. */
function windowSlotTimes(run: ForecastRun, windowStartMs: number, windowEndMs: number): number[] {
  const set = new Set<number>()
  for (const c of run.constraints) {
    for (const p of c.periods) {
      const t = toMs(p.start)
      if (t + SP_MS > windowStartMs && t < windowEndMs) set.add(t)
    }
  }
  return [...set].sort((a, b) => a - b)
}

function cellFor(period: ConstraintPeriod | undefined, slotStart: number, windowStartMs: number, windowEndMs: number): WindowedCell {
  const slotEnd = slotStart + SP_MS
  const overlapStart = Math.max(slotStart, windowStartMs)
  const overlapEnd = Math.min(slotEnd, windowEndMs)
  const coveredMinutes = Math.max(0, (overlapEnd - overlapStart) / 60000)
  const util = periodUtilisation(period)
  return {
    start: new Date(slotStart).toISOString(),
    end: new Date(slotEnd).toISOString(),
    flowMw: period?.flowMw ?? null,
    limitMw: period?.limitMw ?? null,
    utilisationPct: util,
    band: bandForUtilisation(util),
    coveredMinutes,
  }
}

/** Maps a constraint's periods onto a shared slot grid; missing SPs become no-data cells. */
export function windowedCellsFor(
  forecast: ConstraintForecast | undefined,
  slotTimes: number[],
  windowStartMs: number,
  windowEndMs: number,
): WindowedCell[] {
  const byStart = new Map<number, ConstraintPeriod>()
  if (forecast) for (const p of forecast.periods) byStart.set(toMs(p.start), p)
  return slotTimes.map(t => cellFor(byStart.get(t), t, windowStartMs, windowEndMs))
}

function worstPoint(cells: WindowedCell[]): { cell: WindowedCell; index: number } | null {
  let best: { cell: WindowedCell; index: number } | null = null
  cells.forEach((cell, index) => {
    if (cell.utilisationPct == null) return
    if (!best || cell.utilisationPct > (best.cell.utilisationPct as number)) best = { cell, index }
  })
  return best
}

// ── True (unclipped) intervals — needed to find violation starts before the window ─

interface FullCell {
  start: number
  end: number
  band: ConstraintBand
}

function fullSeries(forecast: ConstraintForecast): FullCell[] {
  return forecast.periods
    .map(p => {
      const util = periodUtilisation(p)
      return { start: toMs(p.start), end: toMs(p.start) + SP_MS, band: bandForUtilisation(util) }
    })
    .sort((a, b) => a.start - b.start)
}

export interface ConstraintInterval {
  start: number // true start (ms) — may precede the window
  end: number   // true end (ms) — may follow the window
}

function buildIntervals(series: FullCell[]): ConstraintInterval[] {
  const intervals: ConstraintInterval[] = []
  let cur: ConstraintInterval | null = null
  for (const cell of series) {
    if (isActiveBand(cell.band)) {
      if (cur && cur.end === cell.start) cur.end = cell.end
      else { cur = { start: cell.start, end: cell.end }; intervals.push(cur) }
    } else {
      cur = null
    }
  }
  return intervals
}

// ── Formatting helpers (UTC — matches the app's ISO/UTC convention) ────────

export function formatHHMM(ms: number): string {
  const d = new Date(ms)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Always shows hours, even when zero — e.g. "0h 30m", "4h 00m". Used for durations. */
export function formatDuration(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

/** Omits the hour when under 60 minutes — e.g. "20m", "2h 20m". Used for relative countdowns. */
export function formatRelative(ms: number): string {
  const totalMin = Math.round(ms / 60000)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`
}

// ── Per-constraint summary ──────────────────────────────────────────────

export interface ConstraintRowSummary {
  id: string
  name: string
  status: ConstraintStatus
  cells: WindowedCell[]                 // aligned 1:1 with the tile's shared slot grid
  worstUtilisationPct: number | null
  worstOverloadMw: number | null        // flow - limit at the worst point (negative = spare for near/within)
  worstAtMs: number | null
  firstViolationStartMs: number | null  // true start of the earliest active interval overlapping the window
  alreadyActiveAtWindowStart: boolean
  timeUntilFirstViolation: { primary: string; detail?: string } | null
  violatedDurationMs: number
  violatedIntervalCount: number
  change: ConstraintChangeType
  previousWorstUtilisationPct?: number
  previousWorstOverloadMw?: number
  previousWorstAtMs?: number
}

function summariseConstraint(
  forecast: ConstraintForecast | undefined,
  id: string,
  name: string,
  slotTimes: number[],
  windowStartMs: number,
  windowEndMs: number,
  nowMs: number,
  previousRun: ForecastRun | undefined,
): ConstraintRowSummary {
  const cells = windowedCellsFor(forecast, slotTimes, windowStartMs, windowEndMs)

  let status: ConstraintStatus = 'within'
  if (cells.some(c => isActiveBand(c.band))) status = 'active'
  else if (cells.some(c => c.band === 'near')) status = 'near'

  const wp = worstPoint(cells)
  const worstUtilisationPct = wp ? wp.cell.utilisationPct : null
  const worstOverloadMw = wp && wp.cell.flowMw != null && wp.cell.limitMw != null ? wp.cell.flowMw - wp.cell.limitMw : null
  const worstAtMs = wp ? toMs(wp.cell.start) : null

  let firstViolationStartMs: number | null = null
  let alreadyActiveAtWindowStart = false
  let timeUntilFirstViolation: ConstraintRowSummary['timeUntilFirstViolation'] = null
  let violatedDurationMs = 0
  let violatedIntervalCount = 0

  if (forecast) {
    const allIntervals = buildIntervals(fullSeries(forecast))
    const overlapping = allIntervals.filter(iv => iv.end > windowStartMs && iv.start < windowEndMs)
    violatedIntervalCount = overlapping.length
    for (const iv of overlapping) {
      const clippedStart = Math.max(iv.start, windowStartMs)
      const clippedEnd = Math.min(iv.end, windowEndMs)
      violatedDurationMs += clippedEnd - clippedStart
    }
    if (overlapping.length > 0) {
      firstViolationStartMs = overlapping[0].start
      alreadyActiveAtWindowStart = firstViolationStartMs <= windowStartMs
      if (firstViolationStartMs <= nowMs) {
        timeUntilFirstViolation = {
          primary: 'Now',
          detail: alreadyActiveAtWindowStart ? `since ${formatHHMM(firstViolationStartMs)}` : undefined,
        }
      } else {
        timeUntilFirstViolation = {
          primary: formatHHMM(firstViolationStartMs),
          detail: `in ${formatRelative(firstViolationStartMs - nowMs)}`,
        }
      }
    }
  }

  let change: ConstraintChangeType = null
  let previousWorstUtilisationPct: number | undefined
  let previousWorstOverloadMw: number | undefined
  let previousWorstAtMs: number | undefined
  if (previousRun) {
    const prevForecast = previousRun.constraints.find(c => c.id === id)
    const prevCells = windowedCellsFor(prevForecast, slotTimes, windowStartMs, windowEndMs)
    const prevActive = prevCells.some(c => isActiveBand(c.band))
    const prevWp = worstPoint(prevCells)
    previousWorstUtilisationPct = prevWp?.cell.utilisationPct ?? undefined
    previousWorstOverloadMw = prevWp && prevWp.cell.flowMw != null && prevWp.cell.limitMw != null
      ? prevWp.cell.flowMw - prevWp.cell.limitMw : undefined
    previousWorstAtMs = prevWp ? toMs(prevWp.cell.start) : undefined

    if (status === 'active' && !prevActive) {
      change = 'new'
    } else if (status !== 'active' && prevActive) {
      change = 'cleared'
    } else if (status === 'active' && prevActive && worstUtilisationPct != null && previousWorstUtilisationPct != null) {
      if (worstUtilisationPct - previousWorstUtilisationPct >= WORSE_THRESHOLD_PP) change = 'worse'
    }
  }

  return {
    id, name, status, cells,
    worstUtilisationPct, worstOverloadMw, worstAtMs,
    firstViolationStartMs, alreadyActiveAtWindowStart, timeUntilFirstViolation,
    violatedDurationMs, violatedIntervalCount,
    change, previousWorstUtilisationPct, previousWorstOverloadMw, previousWorstAtMs,
  }
}

// ── Tile-level view model ───────────────────────────────────────────────

export interface ConstraintChangesSummary {
  new: ConstraintRowSummary[]
  cleared: ConstraintRowSummary[]
  worse: ConstraintRowSummary[]
}

export interface ConstraintTileViewModel {
  slotTimes: number[]   // shared grid, ms epoch, ascending — one column per entry
  windowStartMs: number
  windowEndMs: number
  nowMs: number
  nowInWindow: boolean
  runTime: string
  activeRows: ConstraintRowSummary[]
  nearRows: ConstraintRowSummary[]
  withinCount: number
  activeCountPerSlot: number[]
  totals: { active: number; near: number; peakTogether: number }
  changes: ConstraintChangesSummary
  closestWithinLimits: { id: string; name: string; worstUtilisationPct: number; worstAtMs: number } | null
  denseMode: boolean
}

export function buildConstraintTileViewModel(input: ConstraintTileInput): ConstraintTileViewModel {
  const windowStartMs = toMs(input.window.start)
  const windowEndMs = toMs(input.window.end)
  const nowMs = toMs(input.now)
  const slotTimes = windowSlotTimes(input.current, windowStartMs, windowEndMs)

  const rows = input.current.constraints.map(c =>
    summariseConstraint(c, c.id, c.name, slotTimes, windowStartMs, windowEndMs, nowMs, input.previous),
  )

  const activeRows = rows.filter(r => r.status === 'active')
  const nearRows = rows.filter(r => r.status === 'near')
  const withinRows = rows.filter(r => r.status === 'within')

  const activeCountPerSlot = slotTimes.map((_, i) => rows.filter(r => isActiveBand(r.cells[i]?.band)).length)
  const peakTogether = activeCountPerSlot.length ? Math.max(...activeCountPerSlot) : 0

  const changes: ConstraintChangesSummary = {
    new: rows.filter(r => r.change === 'new'),
    cleared: rows.filter(r => r.change === 'cleared'),
    worse: rows.filter(r => r.change === 'worse'),
  }

  let closestWithinLimits: ConstraintTileViewModel['closestWithinLimits'] = null
  for (const r of withinRows) {
    if (r.worstUtilisationPct == null || r.worstAtMs == null) continue
    if (!closestWithinLimits || r.worstUtilisationPct > closestWithinLimits.worstUtilisationPct) {
      closestWithinLimits = { id: r.id, name: r.name, worstUtilisationPct: r.worstUtilisationPct, worstAtMs: r.worstAtMs }
    }
  }

  return {
    slotTimes, windowStartMs, windowEndMs, nowMs,
    nowInWindow: nowMs >= windowStartMs && nowMs <= windowEndMs,
    runTime: input.current.runTime,
    activeRows, nearRows, withinCount: withinRows.length,
    activeCountPerSlot,
    totals: { active: activeRows.length, near: nearRows.length, peakTogether },
    changes, closestWithinLimits,
    denseMode: slotTimes.length > DENSE_MODE_SP_THRESHOLD,
  }
}

// ── Sorting ──────────────────────────────────────────────────────────────

export type ConstraintSortMode = 'firstViolation' | 'severity'

export function sortConstraintRows(
  activeRows: ConstraintRowSummary[],
  nearRows: ConstraintRowSummary[],
  mode: ConstraintSortMode,
): ConstraintRowSummary[] {
  const active = [...activeRows].sort((a, b) => {
    if (mode === 'firstViolation') {
      const fa = a.firstViolationStartMs ?? Infinity
      const fb = b.firstViolationStartMs ?? Infinity
      if (fa !== fb) return fa - fb
    }
    const ua = a.worstUtilisationPct ?? -Infinity
    const ub = b.worstUtilisationPct ?? -Infinity
    if (ua !== ub) return ub - ua
    const oa = a.worstOverloadMw ?? -Infinity
    const ob = b.worstOverloadMw ?? -Infinity
    if (oa !== ob) return ob - oa
    return a.id.localeCompare(b.id)
  })
  const near = [...nearRows].sort((a, b) => (b.worstUtilisationPct ?? -Infinity) - (a.worstUtilisationPct ?? -Infinity))
  return [...active, ...near]
}

// ── Period tooltip content ──────────────────────────────────────────────

export interface PeriodTooltipLine {
  label: string
  value: string
}

export interface PeriodTooltipContent {
  title: string
  flow: PeriodTooltipLine | null
  limit: PeriodTooltipLine | null
  margin: (PeriodTooltipLine & { negative: boolean }) | null
  state: string
  ariaLabel: string
}

/** Formats the exact content for the single settlement-period hover/focus tooltip. */
export function formatPeriodTooltip(row: ConstraintRowSummary, index: number): PeriodTooltipContent {
  const cell = row.cells[index]
  const start = formatHHMM(new Date(cell.start).getTime())
  const end = formatHHMM(new Date(cell.end).getTime())
  const title = `${row.id} · ${start}–${end}`

  if (cell.band === 'noData' || cell.flowMw == null || cell.limitMw == null || cell.utilisationPct == null) {
    return {
      title, flow: null, limit: null, margin: null,
      state: 'No data',
      ariaLabel: `${row.id}, ${start} to ${end}, no data`,
    }
  }

  const flowMw = Math.round(cell.flowMw)
  const limitMw = Math.round(cell.limitMw)
  const marginMw = limitMw - flowMw
  const utilPct = Math.round(cell.utilisationPct)
  const negative = marginMw < 0
  const marginNumber = negative ? `−${Math.abs(marginMw).toLocaleString()}` : marginMw.toLocaleString()

  const stateWord = isActiveBand(cell.band) ? 'Active' : cell.band === 'near' ? 'Near' : 'Within limits'
  const prevActive = index > 0 && isActiveBand(row.cells[index - 1]?.band)
  const nextActive = index < row.cells.length - 1 && isActiveBand(row.cells[index + 1]?.band)
  const singlePeriod = isActiveBand(cell.band) && !prevActive && !nextActive
  const state = singlePeriod ? `${stateWord} · single period` : stateWord

  const ariaMargin = negative ? `minus ${Math.abs(marginMw).toLocaleString()}` : marginMw.toLocaleString()
  const ariaLabel = `${row.id}, ${start} to ${end}, flow ${flowMw.toLocaleString()} megawatts, limit ${limitMw.toLocaleString()} megawatts, `
    + `margin ${ariaMargin} megawatts, ${utilPct} percent, ${stateWord.toLowerCase()}${singlePeriod ? ', single period' : ''}`

  return {
    title,
    flow: { label: 'Flow', value: `${flowMw.toLocaleString()} MW` },
    limit: { label: 'Limit', value: `${limitMw.toLocaleString()} MW` },
    margin: { label: 'Margin', value: `${marginNumber} MW · ${utilPct}%`, negative },
    state,
    ariaLabel,
  }
}
