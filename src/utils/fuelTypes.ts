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
