import type { ServiceType } from '@/models/types'
import type { BatteryAvailabilityRow } from '@/utils/batteryAvailability'

export interface ReliabilityRow extends BatteryAvailabilityRow {
  service: ServiceType | undefined
  constrained: boolean
  contracted: boolean
  highPrice: boolean
  included: boolean
}

export interface ReliabilityTotals {
  total: number
  constrained: number
  contracted: number
  highPrice: number
  usable: number
  reliable: number
  margin: number
}

export function computeBatteryReliability(
  rows: BatteryAvailabilityRow[],
  gspFilter: Record<string, 'include' | 'exclude'>,
  asFilter: { sr: boolean; qr: boolean },
  unitServices: Record<string, ServiceType>,
  deRatePct: number,
  requirementMW: number,
  priceThreshold?: number
): { rows: ReliabilityRow[]; totals: ReliabilityTotals } {
  const gspIncluded = Object.entries(gspFilter).filter(([, v]) => v === 'include').map(([k]) => k)
  const gspExcluded = Object.entries(gspFilter).filter(([, v]) => v === 'exclude').map(([k]) => k)

  function isConstrained(gspGroup: string): boolean {
    if (gspIncluded.length > 0 && !gspIncluded.includes(gspGroup)) return true
    if (gspExcluded.includes(gspGroup)) return true
    return false
  }

  const reliabilityRows: ReliabilityRow[] = rows.map(r => {
    const constrained = isConstrained(r.gspGroup)
    const service = unitServices[r.bmUnitId]
    const contracted = !constrained && (
      (service === 'SR' && asFilter.sr) || (service === 'QR' && asFilter.qr)
    )
    const highPrice = !constrained && !contracted
      && !!priceThreshold && priceThreshold > 0
      && r.priceToMel > priceThreshold
    const included = !constrained && !contracted && !highPrice
    return { ...r, service, constrained, contracted, highPrice, included }
  })

  const total = reliabilityRows.reduce((s, r) => s + r.avail, 0)
  const constrained = reliabilityRows.filter(r => r.constrained).reduce((s, r) => s + r.avail, 0)
  const contracted = reliabilityRows.filter(r => r.contracted).reduce((s, r) => s + r.avail, 0)
  const highPrice = reliabilityRows.filter(r => r.highPrice).reduce((s, r) => s + r.avail, 0)
  const usable = reliabilityRows.filter(r => r.included).reduce((s, r) => s + r.avail, 0)
  const reliable = usable * (1 - deRatePct / 100)
  const margin = reliable - requirementMW

  return {
    rows: reliabilityRows,
    totals: { total, constrained, contracted, highPrice, usable, reliable, margin },
  }
}
