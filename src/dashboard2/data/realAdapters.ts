// Real-data adapters for Dashboard 2. They read the same sources as the existing Dashboard tab —
// the Zustand store (Elexon-derived settlementPeriods + operator-entered areaRequirements) and the
// ConstraintsTile fixtures. Mapping and assumptions: Docs/Design/Dashboard/DATA_MAPPING.md.

import { useModellingStore } from '@/store/useModellingStore'
import { getArea, type AreaId as StoreAreaId } from '@/config/areas'
import { buildDemo24hRun, buildDemo4hRuns } from '@/config/constraintFixtures'
import { bandForUtilisation } from '@/utils/constraintSummary'
import type { AreaRequirementRow, ConstraintBand, SettlementPeriodData } from '@/models/types'
import { CORRECT_ELEXON_SP_TO_UTC, STRIP_TIGHT_MW } from '../dashboard.config'
import { itemStateFromHeadroom } from '../derive'
import { SP_MS, settlementSpStartUtc } from '../time'
import type {
  AreaData, AreaId, IcAreaData, LineAreaData, SpState, StripAreaData, StripPeriod, TimeWindow,
} from '../types'

export interface RealContext {
  settlementPeriods: SettlementPeriodData[]
  areaRequirements: Record<string, AreaRequirementRow[]>
  reservePct: number
  nowMs: number
}

// ── "Forecast run" time for real data: when the last store data load finished ──────────────

let lastLoadedAt: number | null = null

if (typeof window !== 'undefined') {
  if (useModellingStore.getState().settlementPeriods.length > 0) lastLoadedAt = Date.now()
  useModellingStore.subscribe((state, prev) => {
    if (prev.isLoading && !state.isLoading && !state.error) lastLoadedAt = Date.now()
  })
}

export function realDataLoadedAt(): number | null {
  return lastLoadedAt
}

export function readRealContext(reservePct: number, nowMs: number): RealContext {
  const { settlementPeriods, areaRequirements } = useModellingStore.getState()
  return { settlementPeriods, areaRequirements, reservePct, nowMs }
}

// ── Slot timing ──────────────────────────────────────────────────────────

/**
 * True UTC start of a store slot. The store's startTime treats the Elexon SP number as UTC
 * (`${date}T${(sp-1)*30 min}Z`); Elexon SPs are actually counted from London midnight.
 */
export function slotStartMs(sp: SettlementPeriodData): number {
  return elexonSpStartMs(sp.settlementDate, elexonSpOf(sp))
}

/** The real Elexon SP number of a store slot, recovered from the startTime spToStartTime wrote. */
function elexonSpOf(sp: SettlementPeriodData): number {
  const d = new Date(sp.startTime)
  return (d.getUTCHours() * 60 + d.getUTCMinutes()) / 30 + 1
}

/** Start instant of Elexon (date, sp): true UTC, or the app's UTC labelling when the correction is off. */
function elexonSpStartMs(date: string, sp: number): number {
  if (CORRECT_ELEXON_SP_TO_UTC) return settlementSpStartUtc(date, sp)
  return Date.parse(`${date}T00:00:00.000Z`) + (sp - 1) * SP_MS
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

interface Slot { startMs: number; sp: SettlementPeriodData }

function slotsIn(ctx: RealContext, fromMs: number, toMs: number): Slot[] {
  return ctx.settlementPeriods
    .map(sp => ({ startMs: slotStartMs(sp), sp }))
    .filter(s => s.startMs >= fromMs && s.startMs < toMs)
    .sort((a, b) => a.startMs - b.startMs)
}

function requirementIndex(ctx: RealContext, area: string): Map<number, AreaRequirementRow> {
  return new Map((ctx.areaRequirements[area] ?? []).map(r => [r.sp, r]))
}

const iso = (ms: number) => new Date(ms).toISOString()

// ── Line areas ───────────────────────────────────────────────────────────

function posMargin(ctx: RealContext, w: { startMs: number; endMs: number }): LineAreaData {
  // Same requirement as the existing Margin tile: TR2 + General Reserve requirement.
  const genReserve = requirementIndex(ctx, 'general_reserve')
  return {
    kind: 'line',
    id: 'posMargin',
    periods: slotsIn(ctx, w.startMs, w.endMs).map(({ startMs, sp }) => ({
      spStart: iso(startMs),
      requirement: sp.demand * (1 + ctx.reservePct / 100) + (genReserve.get(sp.settlementPeriod)?.requirement ?? 0),
      available: sp.emx,
    })),
  }
}

function areaLine(id: AreaId, storeArea: StoreAreaId, ctx: RealContext, w: { startMs: number; endMs: number }): LineAreaData {
  const reqs = requirementIndex(ctx, storeArea)
  const periods: LineAreaData['periods'] = []
  for (const { startMs, sp } of slotsIn(ctx, w.startMs, w.endMs)) {
    const row = reqs.get(sp.settlementPeriod)
    const available = sp.areaAvailability?.[storeArea]
    if (!row || available === undefined) continue // gap, never zero
    periods.push({ spStart: iso(startMs), requirement: row.requirement, available })
  }
  return { kind: 'line', id, periods }
}

// ── Strip areas from requirement vs availability ─────────────────────────

function areaStrip(
  id: 'reserve' | 'response',
  storeAreas: StoreAreaId[],
  ctx: RealContext,
  w: { startMs: number; endMs: number },
): StripAreaData {
  const reqs = new Map(storeAreas.map(a => [a, requirementIndex(ctx, a)]))
  const periods: StripPeriod[] = []
  for (const { startMs, sp } of slotsIn(ctx, w.startMs, w.endMs)) {
    const itemStates: Record<string, SpState> = {}
    let hasData = false
    for (const area of storeAreas) {
      const row = reqs.get(area)!.get(sp.settlementPeriod)
      const available = sp.areaAvailability?.[area]
      if (!row || available === undefined) continue
      hasData = true
      const s = itemStateFromHeadroom(row.requirement, available, STRIP_TIGHT_MW[id])
      if (s !== 'ok') itemStates[area] = s
    }
    if (hasData) periods.push({ spStart: iso(startMs), itemStates, actions: [] })
  }
  return { kind: 'strip', id, items: storeAreas.map(a => ({ id: a, name: getArea(a).name })), periods }
}

// ── Constraints: same fixture runs the existing ConstraintsTile uses ─────

const BAND_STATE: Record<ConstraintBand, SpState | null> = {
  activeSevere: 'violated', active: 'violated', near: 'tight', within: 'ok', noData: null,
}

function constraints(ctx: RealContext, w: { startMs: number; endMs: number }): StripAreaData {
  const nSp = Math.round((w.endMs - w.startMs) / SP_MS)
  // Mirrors ConstraintsTile: 4h run for windows of ≤ 8 SPs, otherwise the 24h run.
  const run = nSp <= 8 ? buildDemo4hRuns(ctx.nowMs).current : buildDemo24hRun(ctx.nowMs)
  const bySlot = new Map<number, Record<string, SpState>>()
  for (const c of run.constraints) {
    for (const p of c.periods) {
      const t = Date.parse(p.start)
      if (t < w.startMs || t >= w.endMs) continue
      const state = BAND_STATE[bandForUtilisation(p.limitMw > 0 ? (p.flowMw / p.limitMw) * 100 : null)]
      if (state === null) continue
      const states = bySlot.get(t) ?? {}
      if (state !== 'ok') states[c.id] = state
      bySlot.set(t, states)
    }
  }
  return {
    kind: 'strip',
    id: 'constraints',
    items: run.constraints.map(c => ({ id: c.id, name: c.name })),
    periods: [...bySlot].sort((a, b) => a[0] - b[0]).map(([t, itemStates]) => ({ spStart: iso(t), itemStates, actions: [] })),
  }
}

// ── Interconnectors: Σ PN over I_* BMUs (+ = import to GB) ────────────────

// Unconfirmed slots (hasConfirmedPn = false) carry fetchAllData's D-1 proxy: yesterday's PN for the same
// Elexon SP number — for today's AND tomorrow's slots alike. Each period records where its value really
// comes from, so icSwings leaves a gap at the confirmed→estimate seam and at the midnight wrap inside the
// estimates (today SP48 ← yesterday SP48, tomorrow SP1 ← yesterday SP1).
function interconnectors(ctx: RealContext, w: { startMs: number; endMs: number }): IcAreaData {
  const periods: IcAreaData['periods'] = []
  const first = ctx.settlementPeriods.reduce<SettlementPeriodData | undefined>(
    (a, sp) => (!a || sp.settlementPeriod < a.settlementPeriod ? sp : a), undefined)
  const proxyDate = first ? addDays(first.settlementDate, -1) : null // fetchAllData's yesterdayDate
  for (const { startMs, sp } of slotsIn(ctx, w.startMs - SP_MS, w.endMs)) {
    let net = 0
    let found = false
    for (const [bmUnit, pn] of Object.entries(sp.pn)) {
      if (!bmUnit.startsWith('I_')) continue
      net += pn
      found = true
    }
    if (!found) continue
    const estimated = !sp.hasConfirmedPn
    const sourceMs = estimated && proxyDate ? elexonSpStartMs(proxyDate, elexonSpOf(sp)) : startMs
    periods.push({ spStart: iso(startMs), netPositionMw: net, estimated, sourceStart: iso(sourceMs) })
  }
  return { kind: 'ic', id: 'interconnectors', periods }
}

// ── Dispatcher ───────────────────────────────────────────────────────────

/** Returns the real-source area, or null when the area has no real mapping. */
export function buildRealArea(id: AreaId, window: TimeWindow, ctx: RealContext): AreaData | null {
  const w = { startMs: Date.parse(window.start), endMs: Date.parse(window.end) }
  switch (id) {
    case 'posMargin':       return posMargin(ctx, w)
    case 'inertia':         return areaLine('inertia', 'inertia', ctx, w)
    case 'reserve':         return areaStrip('reserve', ['recovery_reserve', 'freq_control_reserve', 'general_reserve', 'contingency_reserve'], ctx, w)
    case 'response':        return areaStrip('response', ['response'], ctx, w)
    case 'constraints':     return constraints(ctx, w)
    case 'interconnectors': return interconnectors(ctx, w)
    default:                return null // negMargin, largestLoss: no real source
  }
}
