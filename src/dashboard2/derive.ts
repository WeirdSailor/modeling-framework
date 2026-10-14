// Pure derivations for Dashboard 2: headroom, strip cell state, action aggregation, worst-in-window,
// IC swings. Type-only imports so this runs under `node --test` with type stripping.

import type { IcPeriod, LinePeriod, SpState, StripAction, StripPeriod } from './types'

const SP_MS = 30 * 60 * 1000 // duplicated from time.ts to keep this module free of value imports

const ms = (iso: string) => Date.parse(iso)

export function inWindow(iso: string, startMs: number, endMs: number): boolean {
  const t = ms(iso)
  return t >= startMs && t < endMs
}

// ── Line rows ────────────────────────────────────────────────────────────

export function headroom(p: LinePeriod): number {
  return p.available - p.requirement
}

export interface LineWorst { headroom: number; requirement: number; spStart: string }

/** Minimum SP headroom in the window (first SP wins ties). Null when the window has no data. */
export function lineWorst(periods: LinePeriod[], startMs: number, endMs: number): LineWorst | null {
  let worst: LineWorst | null = null
  for (const p of periods) {
    if (!inWindow(p.spStart, startMs, endMs)) continue
    const h = headroom(p)
    if (!worst || h < worst.headroom) worst = { headroom: h, requirement: p.requirement, spStart: p.spStart }
  }
  return worst
}

export type ValueTone = 'crit' | 'warn' | 'muted'

/**
 * Colour for a line row's worst value. Amber only applies when something is actually required —
 * mirrors the existing dashboard's `worstReq > 0` rule so unconfigured (all-zero) requirements stay neutral.
 */
export function lineTone(h: number, requirement: number, tight: number): ValueTone {
  if (h < 0) return 'crit'
  if (requirement > 0 && h < tight) return 'warn'
  return 'muted'
}

// ── Strip rows ───────────────────────────────────────────────────────────

const RANK: Record<SpState, number> = { ok: 0, tight: 1, violated: 2 }

export function worstState(states: Iterable<SpState>): SpState {
  let worst: SpState = 'ok'
  for (const s of states) if (RANK[s] > RANK[worst]) worst = s
  return worst
}

export function cellState(period: StripPeriod): SpState {
  return worstState(Object.values(period.itemStates))
}

/** Sums MW by direction so a cell has at most two markers. */
export function aggregateActions(actions: StripAction[]): { down: number; up: number } {
  let down = 0, up = 0
  for (const a of actions) {
    if (a.direction === 'down') down += a.mw
    else up += a.mw
  }
  return { down, up }
}

export type CellVisual = 'violated' | 'tight' | 'managed' | 'ok'

export function cellVisual(period: StripPeriod): CellVisual {
  const s = cellState(period)
  if (s !== 'ok') return s
  return period.actions.length > 0 ? 'managed' : 'ok'
}

export type StripWorst =
  | { kind: 'violated'; spCount: number; itemCount: number }
  | { kind: 'tight'; spCount: number; itemCount: number }
  | { kind: 'ok' }

/**
 * Worst-in-window for a strip row. Violated SPs win over tight; itemCount is the number of distinct
 * items in that state anywhere in the window. Null when the window has no data.
 */
export function stripWorst(periods: StripPeriod[], startMs: number, endMs: number): StripWorst | null {
  const inWin = periods.filter(p => inWindow(p.spStart, startMs, endMs))
  if (inWin.length === 0) return null
  for (const target of ['violated', 'tight'] as const) {
    let spCount = 0
    const items = new Set<string>()
    for (const p of inWin) {
      if (cellState(p) === target) spCount++
      for (const [id, s] of Object.entries(p.itemStates)) if (s === target) items.add(id)
    }
    if (spCount > 0) return { kind: target, spCount, itemCount: items.size }
  }
  return { kind: 'ok' }
}

/** Item state from requirement vs availability. Requirement ≤ 0 means nothing is required → ok. */
export function itemStateFromHeadroom(requirement: number, available: number, tightThreshold: number): SpState {
  if (requirement <= 0) return 'ok'
  const h = available - requirement
  if (h < 0) return 'violated'
  if (h < tightThreshold) return 'tight'
  return 'ok'
}

// ── IC row ───────────────────────────────────────────────────────────────

export interface IcSwing { boundaryMs: number; swing: number; estimated: boolean }

/**
 * swing[b] = net[b] − net[b−1] for every SP b inside the window, plotted on b's start boundary.
 * Uses the SP before the window for the first boundary. No swing (a gap) where either side is missing,
 * or across a seam: confirmed ↔ estimated, or estimates whose source SPs are not consecutive.
 */
export function icSwings(periods: IcPeriod[], startMs: number, endMs: number): IcSwing[] {
  const byStart = new Map<number, IcPeriod>()
  for (const p of periods) byStart.set(ms(p.spStart), p)
  const out: IcSwing[] = []
  for (const [t, cur] of [...byStart].sort((a, b) => a[0] - b[0])) {
    if (t < startMs || t >= endMs) continue
    const prev = byStart.get(t - SP_MS)
    if (!prev || isIcSeam(prev, cur)) continue
    out.push({ boundaryMs: t, swing: cur.netPositionMw - prev.netPositionMw, estimated: !!cur.estimated })
  }
  return out
}

/** True when a swing between two adjacent periods would compare data from different sources/times. */
export function isIcSeam(prev: IcPeriod, cur: IcPeriod): boolean {
  if (!!prev.estimated !== !!cur.estimated) return true
  const ps = prev.sourceStart, cs = cur.sourceStart
  if (ps === undefined && cs === undefined) return false
  if (ps === undefined || cs === undefined) return true
  return ms(cs) - ms(ps) !== SP_MS
}

export function largestSwing(swings: IcSwing[]): IcSwing | null {
  let best: IcSwing | null = null
  for (const s of swings) if (!best || Math.abs(s.swing) > Math.abs(best.swing)) best = s
  return best
}

export type IcTone = 'red' | 'amber' | 'normal'

export function icTone(absSwing: number, amber: number, red: number): IcTone {
  if (absSwing >= red) return 'red'
  if (absSwing >= amber) return 'amber'
  return 'normal'
}
