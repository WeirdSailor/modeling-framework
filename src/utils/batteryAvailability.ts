import type { BMUnit, SettlementPeriodData } from '@/models/types'
import { maxBatteryPn } from '@/utils/batteryPn'

export interface BatteryAvailabilityRow {
  bmUnitId: string
  nationalGridBmUnit: string
  gspGroup: string
  mel: number
  pn: number | undefined
  avail: number
  priceToMel: number
}

export function computeBatteryAvailability(
  units: BMUnit[],
  settlementPeriods: SettlementPeriodData[],
  spCount: number
): BatteryAvailabilityRow[] {
  const windowSps = [...settlementPeriods]
    .sort((a, b) => a.settlementPeriod - b.settlementPeriod)
    .slice(0, spCount)

  return units.map(u => {
    const worstPn = maxBatteryPn(u.bmUnitId, windowSps)
    const mel = u.registeredCapacity ?? 0
    return {
      bmUnitId: u.bmUnitId,
      nationalGridBmUnit: u.nationalGridBmUnit,
      gspGroup: u.gspGroup,
      mel,
      pn: worstPn,
      avail: Math.max(0, mel - (worstPn ?? 0)),
      priceToMel: u.priceToMel ?? 0,
    }
  })
}
