import type { SettlementPeriodData } from '@/models/types'

/** Use the least headroom within the inclusive Schedule From/To window.
 * Keep MEL and PN from the same period so the displayed AVAIL. remains MEL − PN.
 */
export function scheduleAvailability(
  bmUnitId: string,
  periods: SettlementPeriodData[],
  window: { fromPeriod: number; toPeriod: number },
): { mel: number; pn: number } | undefined {
  let worst: { mel: number; pn: number } | undefined
  for (const period of periods) {
    if (period.settlementPeriod < window.fromPeriod || period.settlementPeriod > window.toPeriod) continue
    const pn = period.pn[bmUnitId] ?? 0
    const mel = period.mel[bmUnitId] ?? pn
    if (!worst || mel - pn < worst.mel - worst.pn) worst = { mel, pn }
  }
  return worst
}
