// Scenario ranking used by AvailableTable and the Schedule tab's candidate pickers.
// Moved unchanged from AvailableTable.tsx.

export interface RankableUnit {
  fuelType: string
  gspGroup: string
  pn: number
  mel: number   // registered capacity
  ndz: number
}

const SYNCHRONOUS_TYPES = new Set(['CCGT', 'COAL', 'NUCLEAR', 'OCGT', 'NPSHYD', 'PS', 'BIOMASS', 'OIL', 'GAS'])
const RESPONSE_PREF: Record<string, number> = { PS: 3000, NPSHYD: 2000, OCGT: 1000 }

export function scenarioScore(row: RankableUnit, scenarioId: string, voltageArea: string): number {
  const available = Math.max(0, row.mel - row.pn)
  switch (scenarioId) {
    case 'margin':
      return available
    case 'inertia':
      return (SYNCHRONOUS_TYPES.has(row.fuelType) ? 100000 : 0) + row.mel
    case 'voltage':
      return (voltageArea && row.gspGroup === voltageArea ? 100000 : 0) + row.mel
    case 'reserve':
      return (row.ndz > 0 ? -row.ndz * 10 : -99999) + available / 1000
    case 'response':
      return (RESPONSE_PREF[row.fuelType] ?? 0) + (row.ndz > 0 ? -row.ndz : -9999)
    case 'pullback':
      return row.pn  // units generating most have the most to give back
    default:
      return 0
  }
}
