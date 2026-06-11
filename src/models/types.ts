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
  // Price tiers (£/MWh) — fake placeholder until offer data is available
  priceToSel?: number; // highest offer tier price on the way to SEL output
  priceToMel?: number; // highest offer tier price on the way to MEL output
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
  areaAvailability?: Record<string, number>  // effective availability per non-Margin AreaId, after committed actions
}

export type ServiceType = 'SR' | 'QR'

export type OperationType = 'AS' | 'DS' | 'AD' | 'DD' | 'ADS' | 'TS' | 'RT'

export const OPERATION_TYPE_LABELS: Record<OperationType, string> = {
  AS:  'Advanced Synch',
  DS:  'Delayed Synch',
  AD:  'Advanced De-synch',
  DD:  'Delayed De-synch',
  ADS: 'Additional Synch',
  TS:  'Two Shift',
  RT:  'Run Through',
}

export interface ModellingAction {
  bmUnitId: string;
  fromPeriod: number;              // Settlement period start (1-48)
  toPeriod: number | undefined;    // Settlement period end (1-48); undefined = open-ended (covers all remaining SPs)
  outputLevel: number;             // MW
  reasonCode: 'MARGIN' | 'RECOVERY_RESERVE' | 'FREQ_CONTROL_RESERVE' | 'GENERAL_RESERVE' | 'CONTINGENCY_RESERVE' | 'RESPONSE' | 'INERTIA' | 'VOLTAGE';
  operationType?: OperationType;
  timestamp: Date;
}

export const USERS = ['ANSE', 'NSE', 'OSM', 'OEM', 'NBE', 'TSM', 'TSE'] as const
export type UserId = typeof USERS[number]

export type AppSection = 'balancing' | 'battery'
export const APP_SECTIONS: { id: AppSection; label: string }[] = [
  { id: 'balancing', label: 'Balancing' },
  { id: 'battery',   label: 'Battery' },
]

export interface UnitSnapshot {
  mel: number;
  sel: number;
  ndz: number;
  mzt: number;
  mnzt: number;
  priceToSel: number;
  priceToMel: number;
}

export interface AreaRequirementRow {
  sp: number           // 1–48 slot index within the rolling window
  requirement: number  // MW / GVAs / MVAr
  contracted: number   // base contracted availability before modelling actions
  constrained: number  // portion unusable (e.g. constrained off)
}

export interface DraftPlan {
  id: string;
  name: string;
  description: string;
  actions: ModellingAction[];
  status: 'draft' | 'committed' | 'discarded';
  color: string;
  fromPeriod: number;
  toPeriod: number;
  unitNotes: Record<string, string>;
  createdAt: number;
  committedAt?: number;
  discardedAt?: number;
  ownerId: UserId;
  sharedWith: UserId[];
  dataSnapshot?: Record<string, UnitSnapshot>;
}
