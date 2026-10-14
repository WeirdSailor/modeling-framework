// All Dashboard 2 thresholds, scales and switches live here (spec §12).
// Bands and thresholds are placeholders for SME tuning.

import type { AreaId, AreaKind, HorizonId, StripAreaId } from './types'

export interface LineAreaConfig {
  id: AreaId; label: string; ariaName: string; kind: 'line'
  band: number   // fixed ± headroom scale, never autoscaled
  tight: number  // headroom below this is amber
  unit: string   // config only — not shown on screen
}
export interface StripAreaConfig {
  id: StripAreaId; label: string; ariaName: string; kind: 'strip'
  noun: string   // singular noun for the sub line ("constraint" / "product")
  unit: string
}
export interface IcAreaConfig {
  id: 'interconnectors'; label: string; ariaName: string; kind: 'ic'
  band: number
  amber: number  // absolute swing ≥ amber → amber
  red: number    // absolute swing ≥ red → red
  unit: string
}
export type AreaConfig = LineAreaConfig | StripAreaConfig | IcAreaConfig

// Display order is fixed (spec §8.0).
export const AREA_CONFIG: AreaConfig[] = [
  { id: 'posMargin',       label: '+ve MARGIN',      ariaName: '+ve margin',      kind: 'line',  band: 2000, tight: 500, unit: 'MW' },
  { id: 'negMargin',       label: '−ve MARGIN',      ariaName: '−ve margin',      kind: 'line',  band: 2000, tight: 500, unit: 'MW' },
  { id: 'constraints',     label: 'CONSTRAINTS',     ariaName: 'Constraints',     kind: 'strip', noun: 'constraint', unit: '' },
  { id: 'inertia',         label: 'INERTIA',         ariaName: 'Inertia',         kind: 'line',  band: 40,   tight: 6,   unit: 'GVA·s' },
  { id: 'reserve',         label: 'RESERVE',         ariaName: 'Reserve',         kind: 'strip', noun: 'product', unit: 'MW' },
  { id: 'response',        label: 'RESPONSE',        ariaName: 'Response',        kind: 'strip', noun: 'product', unit: 'MW' },
  { id: 'largestLoss',     label: 'LARGEST LOSS',    ariaName: 'Largest loss',    kind: 'line',  band: 1000, tight: 100, unit: 'MW' },
  { id: 'interconnectors', label: 'INTERCONNECTORS', ariaName: 'Interconnectors', kind: 'ic',    band: 3000, amber: 1500, red: 2000, unit: 'MW' },
]

export const ROW_HEIGHT: Record<AreaKind, number> = { line: 84, strip: 62, ic: 96 }
export const HEADER_HEIGHT = 34

// ── Data sources ──────────────────────────────────────────────────────────
// 'real' = the same store/fixtures the existing Dashboard tab reads; 'mock' = mock-data.json.
// See Docs/Design/Dashboard/DATA_MAPPING.md for the mapping behind each 'real' adapter.
export const AREA_SOURCES: Record<AreaId, 'real' | 'mock'> = {
  posMargin:       'real',
  negMargin:       'mock',
  constraints:     'real',
  inertia:         'real',
  reserve:         'real',
  response:        'real',
  largestLoss:     'mock',
  interconnectors: 'real',
}

// Real sources that are themselves fixtures (not live feeds) — listed under "Mock data" in the legend.
export const REAL_SOURCE_IS_FIXTURE: Partial<Record<AreaId, boolean>> = {
  constraints: true,
}

// Where action markers come from when a strip area is on its real source (no real action feed exists).
export const STRIP_ACTIONS_SOURCE: Record<StripAreaId, 'mock' | 'none'> = {
  constraints: 'mock',
  reserve:     'mock',
  response:    'none',
}

// Headroom (MW) below which a reserve/response item is 'tight' (real adapters only).
export const STRIP_TIGHT_MW: Record<'reserve' | 'response', number> = {
  reserve:  100,
  response: 50,
}

// Re-derive true UTC SP starts from the store's slots (Elexon SPs are Europe/London-local; the
// store's startTime treats them as UTC). See DATA_MAPPING.md "Time conversion".
export const CORRECT_ELEXON_SP_TO_UTC = true

// ±0–2% jitter on mock line-row `available` values each poll. Off so the default view matches the reference.
export const MOCK_JITTER = false

// ── Time ──────────────────────────────────────────────────────────────────
export const HORIZONS: { id: HorizonId; hours: number }[] = [
  { id: '2h', hours: 2 }, { id: '4h', hours: 4 }, { id: '8h', hours: 8 },
  { id: '12h', hours: 12 }, { id: '24h', hours: 24 },
]
export const DEFAULT_HORIZON: HorizonId = '12h'
export const HORIZON_STORAGE_KEY = 'd2:horizon'

// Tick spacing in minutes per preset; custom picks the smallest candidate keeping labels ≥ MIN_TICK_PX apart.
export const PRESET_TICK_MINUTES: Record<HorizonId, number> = { '2h': 30, '4h': 30, '8h': 60, '12h': 60, '24h': 120 }
export const CUSTOM_TICK_CANDIDATES = [30, 60, 120, 180, 240, 360, 720]
export const MIN_TICK_PX = 80

export const POLL_INTERVAL_MS = 30_000
export const NOW_TICK_MS = 30_000
export const STALE_MULTIPLIER = 2

export const CUSTOM_MIN_MS = 30 * 60 * 1000       // 1 SP
export const CUSTOM_MAX_MS = 48 * 60 * 60 * 1000  // 48h

// ── Strip markers ─────────────────────────────────────────────────────────
export const MARKER_NUMBERS_MIN_PX = 44 // narrower cells drop the MW numbers
export const MARKER_MIN_PX = 14         // narrower cells drop markers entirely
