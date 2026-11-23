// Candidate rows for the Schedule tab pickers (spec §8.2).

import type { ActionType, BMUnit, SettlementPeriodData } from '@/models/types'
import { ACTION_TYPES } from '@/models/types'
import { isCandidate, slotValues } from '@/utils/actionEffects'
import { unitAreaContribution } from '@/utils/areaAggregates'
import { scenarioScore } from '@/utils/scenarioRanking'
import { EXCLUDED_FUEL_TYPES } from '@/utils/fuelTypes'
import { scheduleAvailability } from '@/utils/scheduleAvailability'

export interface CandidateRow {
  bmUnitId: string
  nationalGridBmUnit: string
  gspGroup: string
  fuelType: string
  pn: number
  mel: number
  reg: number
  sel: number
  ndz: number
  mzt?: number
  mnzt?: number
  inertiaGvas: number
  priceToSel: number
  priceToMel: number
  running: boolean
  qualifies: ActionType[]                // action types this unit is a candidate for
}

/**
 * Every unit that qualifies for at least one action type in `sp` (the window's first slot),
 * after display exclusions and promoted units. Keep GSP/service/price exclusions here
 * so their cards can explain what was filtered. Ranked by scenario, else by BMU name.
 */
export function buildCandidateRows({ units, sp, settlementPeriods, planWindow, promotedUnitIds, scenario, voltageArea, includeAllFuelTypes = false }: {
  units: BMUnit[]
  sp: SettlementPeriodData | undefined
  settlementPeriods: SettlementPeriodData[]
  planWindow: { fromPeriod: number; toPeriod: number }
  promotedUnitIds: Set<string>
  scenario: string
  voltageArea: string
  includeAllFuelTypes?: boolean
}): CandidateRow[] {
  if (!sp) return []

  const rows: CandidateRow[] = []
  for (const u of units) {
    // Schedule includes batteries; the Workspace display exclusions still apply to other types.
    if ((!includeAllFuelTypes && u.fuelType !== 'BATTERY' && EXCLUDED_FUEL_TYPES.has(u.fuelType)) || u.registeredCapacity <= 0) continue
    if (promotedUnitIds.has(u.bmUnitId)) continue
    const qualifies = ACTION_TYPES.filter(t => isCandidate(t, u.bmUnitId, sp, u))
    if (qualifies.length === 0) continue
    const v = slotValues(u.bmUnitId, sp, u)
    const availability = scheduleAvailability(u.bmUnitId, settlementPeriods, planWindow) ?? v
    rows.push({
      bmUnitId: u.bmUnitId,
      nationalGridBmUnit: u.nationalGridBmUnit,
      gspGroup: u.gspGroup,
      fuelType: u.fuelType,
      pn: availability.pn,
      mel: availability.mel,
      reg: v.reg,
      sel: u.sel ?? 0,
      ndz: u.ndz ?? 0,
      mzt: u.mzt,
      mnzt: u.mnzt,
      inertiaGvas: unitAreaContribution(u.bmUnitId, 'inertia', sp, [u]),
      priceToSel: u.priceToSel ?? 0,
      priceToMel: u.priceToMel ?? 0,
      running: v.pn > 1,
      qualifies,
    })
  }

  if (scenario !== 'none') {
    const score = (r: CandidateRow) =>
      scenarioScore({ fuelType: r.fuelType, gspGroup: r.gspGroup, pn: r.pn, mel: r.reg, ndz: r.ndz }, scenario, voltageArea)
    rows.sort((a, b) => score(b) - score(a))
  } else {
    rows.sort((a, b) => a.nationalGridBmUnit.localeCompare(b.nationalGridBmUnit))
  }
  return rows
}
