import type { BMUnit, SettlementPeriodData, ModellingAction, AreaRequirementRow } from '@/models/types'
import { actionTypeOf, areaDelta, covers } from '@/utils/actionEffects'

// Fuel types that contribute inertia (synchronous machines only)
const SYNCHRONOUS_FUEL_TYPES = new Set(['CCGT', 'NUCLEAR', 'NPSHYD', 'OCGT', 'PS', 'COAL'])
// Fuel types eligible for Response contribution
const RESPONSE_FUEL_TYPES = new Set(['PS', 'NPSHYD', 'OCGT', 'CCGT'])

const NON_MARGIN_AREA_IDS = [
  'recovery_reserve', 'freq_control_reserve', 'general_reserve',
  'contingency_reserve', 'response', 'inertia', 'voltage',
] as const

// MW / GVAs / MVAr contribution of promoting one unit to a given area for a given SP.
// Returns 0 for margin — margin uses the existing computeAggregates path.
export function unitAreaContribution(
  bmUnitId: string,
  area: string,
  sp: SettlementPeriodData,
  units: BMUnit[]
): number {
  if (area === 'margin') return 0
  const unit = units.find(u => u.bmUnitId === bmUnitId)
  const mel = unit?.registeredCapacity ?? sp.mel[bmUnitId] ?? 0
  const pn = sp.pn[bmUnitId] ?? 0
  const headroom = Math.max(0, mel - pn)

  switch (area) {
    case 'recovery_reserve':
    case 'freq_control_reserve':
    case 'general_reserve':
    case 'contingency_reserve':
      return headroom
    case 'response':
      return unit && RESPONSE_FUEL_TYPES.has(unit.fuelType) ? headroom : 0
    case 'inertia':
      return unit && SYNCHRONOUS_FUEL_TYPES.has(unit.fuelType)
        ? (unit.registeredCapacity ?? 0) * 0.05
        : 0
    case 'voltage':
      return (unit?.registeredCapacity ?? 0) * 0.3
    default:
      return 0
  }
}

// One action's contribution to an area in one SP. Start keeps the original promote-a-unit
// formula; the other action types use actionEffects.areaDelta (which can be negative).
function actionAreaContribution(
  action: ModellingAction,
  area: string,
  sp: SettlementPeriodData,
  units: BMUnit[]
): number {
  if (actionTypeOf(action) === 'start') return unitAreaContribution(action.bmUnitId, area, sp, units)
  return areaDelta(action, area, sp, units.find(u => u.bmUnitId === action.bmUnitId))
}

// Compute effective availability for all non-Margin areas across all SPs.
// Returns a new array of SPs with areaAvailability filled.
// Called after refreshAggregates so sp.emx/eol/emi are already fresh.
export function computeAreaAvailabilities(
  settlementPeriods: SettlementPeriodData[],
  promotedActions: ModellingAction[],
  units: BMUnit[],
  areaRequirements: Record<string, AreaRequirementRow[]>
): SettlementPeriodData[] {
  return settlementPeriods.map(sp => {
    const spIdx = sp.settlementPeriod
    const areaAvailability: Record<string, number> = {}

    for (const area of NON_MARGIN_AREA_IDS) {
      const rows = areaRequirements[area] ?? []
      const row = rows.find(r => r.sp === spIdx)
      const base = row ? Math.max(0, row.contracted - row.constrained) : 0

      const seen = new Set<string>()
      let contribution = 0
      for (const action of promotedActions) {
        if (!covers(action, spIdx) || seen.has(action.bmUnitId)) continue
        seen.add(action.bmUnitId)
        contribution += actionAreaContribution(action, area, sp, units)
      }
      // Desync can push the sum below zero (prototype approximation, spec §6.2).
      areaAvailability[area] = Math.max(0, base + contribution)
    }

    return { ...sp, areaAvailability }
  })
}

// For draft overlay rendering: compute projected availability if draft actions were promoted.
// alreadyModelled = bmUnitIds already counted in sp.areaAvailability[area] (promoted draft units).
// It only blocks Start actions; the other action types act on running units by definition.
export function applyDraftToAreaBaseline(
  sp: SettlementPeriodData,
  baseAvailability: number,
  draftActions: ModellingAction[],
  alreadyModelled: Set<string>,
  units: BMUnit[],
  area: string
): number {
  if (area === 'margin') return baseAvailability
  const spIdx = sp.settlementPeriod
  const seen = new Set<string>()
  let addition = 0

  for (const action of draftActions) {
    if (!covers(action, spIdx) || seen.has(action.bmUnitId)) continue
    if (actionTypeOf(action) === 'start' && alreadyModelled.has(action.bmUnitId)) continue
    seen.add(action.bmUnitId)
    addition += actionAreaContribution(action, area, sp, units)
  }
  return Math.max(0, baseAvailability + addition)
}

export type AreaStatus = 'ok' | 'tight' | 'shortfall'

export interface AreaStatusResult {
  status: AreaStatus
  worstGap: number       // min(avail - req) over window; negative = shortfall
  worstAvail: number     // avail at worst SP
  worstReq: number       // req at worst SP
}

// Compute worst-case status for an area across the first spCount SPs.
// reservePct is only used for area === 'margin'.
export function computeAreaStatus(
  area: string,
  settlementPeriods: SettlementPeriodData[],
  areaRequirements: Record<string, AreaRequirementRow[]>,
  spCount: number,
  reservePct = 10
): AreaStatusResult {
  const window = settlementPeriods.slice(0, spCount)
  if (window.length === 0) return { status: 'ok', worstGap: 0, worstAvail: 0, worstReq: 0 }

  let worstGap = Infinity
  let worstAvail = 0
  let worstReq = 0

  for (const sp of window) {
    let avail: number
    let req: number
    if (area === 'margin') {
      avail = sp.emx
      const generalReserveRow = (areaRequirements['general_reserve'] ?? []).find(r => r.sp === sp.settlementPeriod)
      req = sp.demand * (1 + reservePct / 100) + (generalReserveRow?.requirement ?? 0)
    } else {
      avail = sp.areaAvailability?.[area] ?? 0
      const row = (areaRequirements[area] ?? []).find(r => r.sp === sp.settlementPeriod)
      req = row?.requirement ?? 0
    }
    const gap = avail - req
    if (gap < worstGap) { worstGap = gap; worstAvail = avail; worstReq = req }
  }

  if (!isFinite(worstGap)) return { status: 'ok', worstGap: 0, worstAvail: 0, worstReq: 0 }

  const status: AreaStatus =
    worstGap < 0 ? 'shortfall' :
    worstReq > 0 && worstGap < worstReq * 0.1 ? 'tight' : 'ok'

  return { status, worstGap, worstAvail, worstReq }
}
