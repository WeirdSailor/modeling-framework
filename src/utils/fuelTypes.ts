// Excluded from the normal Available units view
export const EXCLUDED_FUEL_TYPES = new Set([
  'WIND', 'SOLAR', 'INTNEM', 'INTFR', 'INTIRL', 'INTEW', 'INTNED', 'INTIFA2', 'INTELEC',
  'COAL', 'COALB', 'NUCLEAR', 'BATTERY',
])

// Excluded from fetching entirely — interconnectors, solar, and coal variants.
// WIND is fetched so Pullback scenario can display and curtail wind units.
export const FETCH_EXCLUDED_FUEL_TYPES = new Set([
  'SOLAR', 'INTNEM', 'INTFR', 'INTIRL', 'INTEW', 'INTNED', 'INTIFA2', 'INTELEC',
  'COAL', 'COALB',
])

// Fuel types that are relevant for Pullback (curtailment)
export const PULLBACK_FUEL_TYPES = new Set(['WIND'])

// Elexon's reference data has no 'BATTERY' fuelType — BESS units are tagged
// 'OTHER' or null, same as some non-battery units (e.g. solar farms). Detect
// batteries via BMU naming convention, restricted to OTHER/null fuelType so
// units with a known real fuel type (e.g. WBURB-1/2/3 CCGT) are never matched.
const BATTERY_ID_RE = /B-\d+[A-Z]?$/
const BATTERY_NAME_RE = /batt|bess|storage/i

export function isBatteryUnit(fuelType: string | null, nationalGridBmUnit: string, bmUnitName: string | null): boolean {
  if (fuelType !== null && fuelType !== 'OTHER') return false
  return BATTERY_ID_RE.test(nationalGridBmUnit) || BATTERY_NAME_RE.test(bmUnitName ?? '')
}
