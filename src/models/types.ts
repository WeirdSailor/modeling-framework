export interface BMUnit {
  bmUnitId: string;           // Elexon bmUnit field (e.g. "T_DRAXX-1")
  nationalGridBmUnit: string; // nationalGridBmUnit field (e.g. "DRAXX-1")
  fuelType: string;
  registeredCapacity: number; // MW — parsed from generationCapacity string
  gspGroup: string;           // gspGroupId from API (e.g. "_K")
  // Dynamic params — optional, won't exist for all units
  ndz?: number;  // Notice to Deviate from Zero (minutes) — API returns seconds in `notice` field, convert to minutes
  mnzt?: number; // Minimum Non-Zero Time (minutes) — API field: `periodMin`
  mzt?: number;  // Minimum Zero Time (minutes) — API field: `periodMin`
  sel?: number;  // Stable Export Limit (MW) — API field: `level`
  sil?: number;  // Stable Import Limit (MW) — API field: `level`
}

export interface SettlementPeriodData {
  settlementDate: string;   // YYYY-MM-DD for this slot (may differ across the 24h window)
  settlementPeriod: number; // slot index 1-48 within the rolling 24h window (not the real SP within the day)
  startTime: string;        // ISO datetime of the actual start of this slot
  // Per-unit data (keyed by bmUnitId = Elexon bmUnit string)
  pn: Record<string, number>;  // BMU ID -> PN level (MW) — use average of levelFrom+levelTo
  mel: Record<string, number>; // BMU ID -> MEL (MW)
  mil: Record<string, number>; // BMU ID -> MIL (MW)
  // National aggregates (calculated)
  demand: number; // National demand forecast (MW)
  emx: number;    // Sum of MELs for committed units
  eol: number;    // Sum of PNs (expected operating level)
  emi: number;    // Sum of minimums for committed units
  margin: number; // emx - demand
  hasConfirmedPn: boolean; // true if this slot has post-gate-closure PN data from Elexon
  proxyEmx: number;        // D-1 EMX estimate for unconfirmed slots (0 if confirmed or unavailable)
  proxyEol: number;        // D-1 EOL estimate for unconfirmed slots (0 if confirmed or unavailable)
}

export interface ModellingAction {
  bmUnitId: string;
  fromPeriod: number;    // Settlement period start (1-48)
  toPeriod: number;      // Settlement period end (1-48)
  outputLevel: number;   // MW
  reasonCode: 'MARGIN' | 'INERTIA' | 'VOLTAGE' | 'CONSTRAINT' | 'RESERVE';
  timestamp: Date;
}

export interface DraftPlan {
  id: string;
  name: string;
  actions: ModellingAction[];
  status: 'draft' | 'committed' | 'discarded';
  color: string;
  fromPeriod: number;
  toPeriod: number;
  unitNotes: Record<string, string>;
  createdAt: number;
  committedAt?: number;
  discardedAt?: number;
}
