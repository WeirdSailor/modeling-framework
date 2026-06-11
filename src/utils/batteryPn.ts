import type { SettlementPeriodData } from '@/models/types'

// Highest PN (incl. negative, i.e. charging) found for a unit across the given
// settlement periods. `undefined` means the unit has no PN entry at all in the
// window — distinct from a PN of exactly 0 (idle).
export function maxBatteryPn(bmUnitId: string, settlementPeriods: SettlementPeriodData[]): number | undefined {
  let result: number | undefined
  for (const sp of settlementPeriods) {
    const pn = sp.pn[bmUnitId]
    if (pn === undefined) continue
    if (result === undefined || pn > result) result = pn
  }
  return result
}
