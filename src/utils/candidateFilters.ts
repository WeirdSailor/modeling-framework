import type { ServiceType } from '@/models/types'
import type { CandidateRow } from '@/components/schedule/candidates'
import type { CardId, UnitFilterState } from '@/components/UnitAvailabilityFilters'

export interface ScheduleFilters extends UnitFilterState {
  gspFilter: Record<string, 'include' | 'exclude'>
  selectedCard: CardId
}

export type CandidateCategory = 'constrained' | 'contracted' | 'highPrice' | 'usable'

export interface FilteredCandidateRow extends CandidateRow {
  category: CandidateCategory
  service: ServiceType | undefined
  availableMw: number
  usableMw: number
}

/** Classify before hiding rows so excluded units remain inspectable on their cards.
 * Categories are exclusive, with the same precedence as Battery Summary.
 */
export function classifyCandidates(
  rows: CandidateRow[],
  filters: ScheduleFilters,
  unitServices: Record<string, ServiceType>,
): FilteredCandidateRow[] {
  const included = Object.keys(filters.gspFilter).filter(key => filters.gspFilter[key] === 'include')
  const excluded = new Set(Object.keys(filters.gspFilter).filter(key => filters.gspFilter[key] === 'exclude'))
  const priceLimit = Number(filters.priceThreshold)
  const derate = Number.isFinite(filters.deRatePct) ? Math.min(100, Math.max(0, filters.deRatePct)) / 100 : 0

  return rows.filter(row => filters.typeFilter.size === 0 || filters.typeFilter.has(row.fuelType)).map(row => {
    const service = unitServices[row.bmUnitId]
    const constrained = (included.length > 0 && !included.includes(row.gspGroup)) || excluded.has(row.gspGroup)
    const contracted = (service === 'SR' && filters.asFilter.sr) || (service === 'QR' && filters.asFilter.qr)
    const category: CandidateCategory = constrained ? 'constrained'
      : contracted ? 'contracted'
      : priceLimit > 0 && row.priceToMel > priceLimit ? 'highPrice'
      : 'usable'
    const availableMw = row.mel - row.pn
    return { ...row, category, service, availableMw, usableMw: category === 'usable' ? availableMw * (1 - derate) : 0 }
  })
}

/** Sum usable MW after filtering and sorting so the running total follows the table. */
export function cumulativeAvailability<T extends { usableMw: number }>(rows: T[]): (T & { cumulativeMw: number })[] {
  let cumulativeMw = 0
  return rows.map(row => {
    cumulativeMw += row.usableMw
    return { ...row, cumulativeMw }
  })
}

export function matchesCandidateCard(row: FilteredCandidateRow, card: CardId): boolean {
  return card === 'total' || row.category === (card === 'derated' ? 'usable' : card)
}

export function candidateCards(rows: FilteredCandidateRow[]) {
  const summary = (category?: CandidateCategory) => {
    const list = category ? rows.filter(row => row.category === category) : rows
    return { count: list.length, sum: list.reduce((sum, row) => sum + row.availableMw, 0) }
  }
  const usable = summary('usable')
  const reliable = rows.reduce((sum, row) => sum + row.usableMw, 0)
  return {
    total: summary(),
    contracted: summary('contracted'),
    constrained: summary('constrained'),
    highPrice: summary('highPrice'),
    derated: { count: usable.count, sum: usable.sum - reliable },
    usable: { count: usable.count, sum: reliable },
  }
}
