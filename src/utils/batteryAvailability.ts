import type { BMUnit, SettlementPeriodData } from '@/models/types'
import { maxBatteryPn } from '@/utils/batteryPn'

export interface BatteryAvailabilityRow {
  bmUnitId: string
  nationalGridBmUnit: string
  fuelType: string
  gspGroup: string
  mel: number
  mil: number
  pn: number | undefined
  avail: number
  mdo: number // Maximum Delivery Offer — headroom up to MEL: max(0, MEL - PN)
  mdb: number // Maximum Delivery Bid — headroom down to MIL: max(0, PN - MIL)
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
    const pn = worstPn ?? 0
    const mel = u.registeredCapacity ?? 0
    const mil = -(u.registeredImportCapacity ?? 0)
    return {
      bmUnitId: u.bmUnitId,
      nationalGridBmUnit: u.nationalGridBmUnit,
      fuelType: u.fuelType,
      gspGroup: u.gspGroup,
      mel,
      mil,
      pn: worstPn,
      avail: Math.max(0, mel - pn),
      mdo: Math.max(0, mel - pn),
      mdb: Math.max(0, pn - mil),
      priceToMel: u.priceToMel ?? 0,
    }
  })
}
