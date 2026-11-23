// Real-data adapters for Dashboard 2. They read the same sources as the existing Dashboard tab —
// the Zustand store (Elexon-derived settlementPeriods + operator-entered areaRequirements) and the
// ConstraintsTile fixtures. Mapping and assumptions: Docs/Design/Dashboard/DATA_MAPPING.md.

import { useModellingStore } from '@/store/useModellingStore'
import { getArea, type AreaId as StoreAreaId } from '@/config/areas'
import { applyDraftToBaseline } from '@/utils/margin'
import { applyDraftToAreaBaseline } from '@/utils/areaAggregates'
import { workingPlanAsDraft } from '@/utils/workingPlan'
import type {
  AreaRequirementRow, BMUnit, DraftPlan, ModellingAction, SettlementPeriodData,
} from '@/models/types'
import { CORRECT_ELEXON_SP_TO_UTC, STRIP_TIGHT_MW } from '../dashboard.config'
import { draftCovers, itemStateFromHeadroom, overlayPeriods, type OverlayInput } from '../derive'
import { SP_MS, settlementSpStartUtc } from '../time'
import { interconnectorName, type InterconnectorReference } from './interconnectorReference'
import { buildConstraintArea } from './constraintData'
import type {
  AreaData, AreaId, DraftOverlay, IcAreaData, LineAreaData, LinePeriod, SpState, StripAreaData, StripPeriod,
  TimeWindow,
} from '../types'

export interface RealContext {
  settlementPeriods: SettlementPeriodData[]
  areaRequirements: Record<string, AreaRequirementRow[]>
  reservePct: number
  nowMs: number
  units: BMUnit[]
  overlayDrafts: DraftPlan[]           // not-yet-promoted drafts to overlay (status 'draft', not hidden in the sidebar)
  promotedActions: ModellingAction[]  // already in the baseline (sp.emx / areaAvailability)
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

export function readRealContext(reservePct: number, nowMs: number, hiddenDraftIds: ReadonlySet<string>): RealContext {
  const { settlementPeriods, areaRequirements, units, drafts, workingPlans, currentUser } = useModellingStore.getState()
  // The current operator's working plan overlays like a draft (Scheduling Actions spec §8.4).
  const workingPlanDraft = workingPlanAsDraft(workingPlans[currentUser], currentUser)
  const overlaySource = workingPlanDraft ? [...drafts, workingPlanDraft] : drafts
  return {
    settlementPeriods, areaRequirements, reservePct, nowMs, units,
    // Same draft set as MarginChart / AreaChart: every 'draft'-status plan the sidebar has not hidden.
    overlayDrafts: overlaySource.filter(d => d.status === 'draft' && !hiddenDraftIds.has(d.id)),
    promotedActions: drafts.filter(d => d.status === 'promoted').flatMap(d => d.actions),
  }
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

function slotsIn(ctx: Pick<RealContext, 'settlementPeriods'>, fromMs: number, toMs: number): Slot[] {
  return ctx.settlementPeriods
    .map(sp => ({ startMs: slotStartMs(sp), sp }))
    .filter(s => s.startMs >= fromMs && s.startMs < toMs)
    .sort((a, b) => a.startMs - b.startMs)
}

function requirementIndex(ctx: RealContext, area: string): Map<number, AreaRequirementRow> {
  return new Map((ctx.areaRequirements[area] ?? []).map(r => [r.sp, r]))
}

function allSlots(ctx: RealContext): Slot[] {
  return slotsIn(ctx, -Infinity, Infinity)
}

const iso = (ms: number) => new Date(ms).toISOString()

// ── Line areas ───────────────────────────────────────────────────────────

interface LineRow { startMs: number; sp: SettlementPeriodData; period: LinePeriod }

/**
 * Builds a line area from rows over the WHOLE store window (so a draft covering the SP just outside the
 * view still bridges correctly), then trims baseline and overlays to the view window.
 */
function lineArea(
  id: AreaId,
  rows: LineRow[],
  ctx: RealContext,
  w: { startMs: number; endMs: number },
  draftAvailable: (draft: DraftPlan, row: LineRow) => number,
): LineAreaData {
  const inView = (p: LinePeriod) => { const t = Date.parse(p.spStart); return t >= w.startMs && t < w.endMs }
  const draftOverlays: DraftOverlay[] = []
  for (const draft of ctx.overlayDrafts) {
    const inputs: OverlayInput[] = rows.map(row => {
      const covered = draftCovers(draft.actions, row.sp.settlementPeriod)
      return { period: row.period, covered, draftAvailable: covered ? draftAvailable(draft, row) : row.period.available }
    })
    const periods = overlayPeriods(inputs).filter(inView)
    if (periods.some(p => !p.bridge)) {
      draftOverlays.push({ draftId: draft.id, name: draft.name, color: draft.color, periods })
    }
  }
  return { kind: 'line', id, periods: rows.map(r => r.period).filter(inView), draftOverlays }
}

function posMargin(ctx: RealContext, w: { startMs: number; endMs: number }): LineAreaData {
  // Same requirement as the existing Margin tile: TR2 + General Reserve requirement.
  const genReserve = requirementIndex(ctx, 'general_reserve')
  const rows: LineRow[] = allSlots(ctx).map(({ startMs, sp }) => ({
    startMs, sp,
    period: {
      spStart: iso(startMs),
      requirement: sp.demand * (1 + ctx.reservePct / 100) + (genReserve.get(sp.settlementPeriod)?.requirement ?? 0),
      available: sp.emx,
    },
  }))
  // Draft EMX exactly as MarginChart computes it: units already generating (PN > 1) or in a promoted
  // action covering this SP are already in the baseline and add nothing.
  return lineArea('posMargin', rows, ctx, w, (draft, { sp }) => {
    const alreadyModelled = new Set<string>()
    for (const [bmUnit, pn] of Object.entries(sp.pn)) if (pn > 1) alreadyModelled.add(bmUnit)
    for (const a of ctx.promotedActions) {
      if (draftCovers([a], sp.settlementPeriod)) alreadyModelled.add(a.bmUnitId)
    }
    return applyDraftToBaseline(sp, sp.emx, sp.eol, sp.emi, draft.actions, alreadyModelled, ctx.units).emx
  })
}

function areaLine(id: AreaId, storeArea: StoreAreaId, ctx: RealContext, w: { startMs: number; endMs: number }): LineAreaData {
  const reqs = requirementIndex(ctx, storeArea)
  const rows: LineRow[] = []
  for (const { startMs, sp } of allSlots(ctx)) {
    const row = reqs.get(sp.settlementPeriod)
    const available = sp.areaAvailability?.[storeArea]
    if (!row || available === undefined) continue // gap, never zero
    rows.push({ startMs, sp, period: { spStart: iso(startMs), requirement: row.requirement, available } })
  }
  // Draft availability exactly as AreaChart computes it: units in any promoted draft add nothing.
  const promotedUnits = new Set(ctx.promotedActions.map(a => a.bmUnitId))
  return lineArea(id, rows, ctx, w, (draft, { sp, period }) =>
    applyDraftToAreaBaseline(sp, period.available, draft.actions, promotedUnits, ctx.units, storeArea))
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

// ── Interconnectors: Σ PN over I_* BMUs (+ = import to GB) ────────────────

// Unconfirmed slots (hasConfirmedPn = false) carry fetchAllData's D-1 proxy: yesterday's PN for the same
// Elexon SP number — for today's AND tomorrow's slots alike. Each period records where its value really
// comes from, so icSwings leaves a gap at the confirmed→estimate seam and at the midnight wrap inside the
// estimates (today SP48 ← yesterday SP48, tomorrow SP1 ← yesterday SP1).
function interconnectors(
  ctx: Pick<RealContext, 'settlementPeriods'>,
  w: { startMs: number; endMs: number },
  includes: (bmUnit: string) => boolean = bmUnit => bmUnit.startsWith('I_'),
): IcAreaData {
  const periods: IcAreaData['periods'] = []
  const first = ctx.settlementPeriods.reduce<SettlementPeriodData | undefined>(
    (a, sp) => (!a || sp.settlementPeriod < a.settlementPeriod ? sp : a), undefined)
  const proxyDate = first ? addDays(first.settlementDate, -1) : null // fetchAllData's yesterdayDate
  for (const { startMs, sp } of slotsIn(ctx, w.startMs - SP_MS, w.endMs)) {
    let net = 0
    let found = false
    for (const [bmUnit, pn] of Object.entries(sp.pn)) {
      if (!includes(bmUnit)) continue
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

export interface InterconnectorRow {
  id: string
  name: string
  area: IcAreaData
}

/** Apply the consolidated chart's time conversion and estimate seams to each connection. */
export function buildInterconnectorRows(
  window: TimeWindow, ctx: Pick<RealContext, 'settlementPeriods'>, references: InterconnectorReference[],
): InterconnectorRow[] {
  const groups = new Map<string, Set<string>>()
  const byUnit = new Map(references.map(ref => [ref.bmUnitId, ref.interconnectorId]))
  for (const ref of references) {
    const group = groups.get(ref.interconnectorId) ?? new Set<string>()
    group.add(ref.bmUnitId)
    groups.set(ref.interconnectorId, group)
  }
  // Preserve unfamiliar units instead of silently dropping their contribution.
  for (const sp of ctx.settlementPeriods) {
    for (const bmUnit of Object.keys(sp.pn)) {
      if (bmUnit.startsWith('I_') && !byUnit.has(bmUnit)) groups.set(bmUnit, new Set([bmUnit]))
    }
  }
  const w = { startMs: Date.parse(window.start), endMs: Date.parse(window.end) }
  return [...groups].map(([id, units]) => ({
    id, name: interconnectorName(id), area: interconnectors(ctx, w, bmUnit => units.has(bmUnit)),
  })).sort((a, b) => a.name.localeCompare(b.name))
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
    case 'constraints':     return buildConstraintArea(window, ctx.nowMs)
    case 'interconnectors': return interconnectors(ctx, w)
    default:                return null // negMargin, largestLoss: no real source
  }
}
