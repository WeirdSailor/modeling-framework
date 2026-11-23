// Candidate rows for the Schedule tab pickers (spec §8.2).

import type { ActionType, BMUnit, SettlementPeriodData } from '@/models/types'
import { ACTION_TYPES } from '@/models/types'
import { changeMw, isCandidate, slotValues } from '@/utils/actionEffects'
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
  priceToSel: number
  priceToMel: number
  running: boolean
  qualifies: ActionType[]                // action types this unit is a candidate for
  change: Record<ActionType, number>     // signed MW per type (actionEffects.changeMw)
}

/**
 * Every unit that qualifies for at least one action type in `sp` (the window's first slot),
 * after display exclusions and promoted units. Keep GSP/service/price exclusions here
 * so their cards can explain what was filtered. Ranked by scenario, else by BMU name.
 */
export function buildCandidateRows({ units, sp, settlementPeriods, planWindow, promotedUnitIds, scenario, voltageArea }: {
  units: BMUnit[]
  sp: SettlementPeriodData | undefined
  settlementPeriods: SettlementPeriodData[]
  planWindow: { fromPeriod: number; toPeriod: number }
  promotedUnitIds: Set<string>
  scenario: string
  voltageArea: string
}): CandidateRow[] {
  if (!sp) return []

  const rows: CandidateRow[] = []
  for (const u of units) {
    if (EXCLUDED_FUEL_TYPES.has(u.fuelType) || u.registeredCapacity <= 0) continue
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
      priceToSel: u.priceToSel ?? 0,
      priceToMel: u.priceToMel ?? 0,
      running: v.pn > 1,
      qualifies,
      change: {
        start:    changeMw('start', u.bmUnitId, sp, u),
        deload:   changeMw('deload', u.bmUnitId, sp, u),
        desync:   changeMw('desync', u.bmUnitId, sp, u),
        capacity: changeMw('capacity', u.bmUnitId, sp, u),
      },
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
