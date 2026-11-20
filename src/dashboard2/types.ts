// Data contract for Dashboard 2 (cross-area operational awareness). See
// Docs/Design/Dashboard/DASHBOARD_IMPLEMENTATION.md §6.

export type ISO = string // UTC ISO-8601 instant
export type SpState = 'ok' | 'tight' | 'violated'

export type AreaId =
  | 'posMargin' | 'negMargin' | 'constraints' | 'inertia'
  | 'reserve' | 'response' | 'largestLoss' | 'interconnectors'

export type AreaKind = 'line' | 'strip' | 'ic'
export type StripAreaId = 'constraints' | 'reserve' | 'response'

export interface TimeWindow { start: ISO; end: ISO }

export interface LinePeriod { spStart: ISO; requirement: number; available: number }

/**
 * One overlay period: the draft's value where the draft covers the SP, or — when `bridge` is set — the
 * baseline value on an uncovered neighbour, so the dotted line branches off and rejoins the solid one.
 */
export interface DraftOverlayPeriod extends LinePeriod { bridge?: boolean }

/** What a line row would look like with one not-yet-promoted draft applied on top of the baseline. */
export interface DraftOverlay {
  draftId: string
  name: string
  color: string
  periods: DraftOverlayPeriod[] // only covered SPs and their bridges; everything else is absent
}

export interface LineAreaData {
  kind: 'line'
  id: AreaId
  periods: LinePeriod[]
  draftOverlays?: DraftOverlay[] // real adapters only; absent for mock rows
}

export interface StripAction {
  direction: 'down' | 'up' // down = capacity made unusable / output restricted; up = capacity allocated
  mw: number               // always positive
  itemId?: string
  description?: string     // for future tooltips
}

export interface StripPeriod {
  spStart: ISO
  itemStates: Record<string, SpState> // only non-ok items need listing; missing = ok
  actions: StripAction[]
}

export interface StripAreaData {
  kind: 'strip'
  id: AreaId
  items: { id: string; name: string }[]
  periods: StripPeriod[]
}

export interface IcPeriod {
  spStart: ISO
  netPositionMw: number // + = net import to GB
  estimated?: boolean   // true when the value is a proxy (e.g. D-1 PN), not a confirmed forecast
  // Instant the value actually describes, when it differs from spStart (a D-1 proxy describes the same SP
  // on an earlier day). Swings are only computed between periods whose sources are consecutive SPs.
  sourceStart?: ISO
}

export interface IcAreaData {
  kind: 'ic'
  id: 'interconnectors'
  // Includes the SP immediately BEFORE window.start (when available) so the first boundary swing can be computed.
  periods: IcPeriod[]
}

export type AreaData = LineAreaData | StripAreaData | IcAreaData

/** Which parts of the payload came from mock/fixture data rather than a live feed. */
export interface MockSource { areaId: AreaId; part: 'all' | 'actions' }

export interface DashboardData {
  forecastRunAt: ISO
  updatedAt: ISO
  window: TimeWindow
  areas: AreaData[] // order is irrelevant; display order comes from config
  mockSources: MockSource[]
}

export interface DashboardDataProvider {
  fetch(window: TimeWindow): Promise<DashboardData>
}

export type HorizonId = '2h' | '4h' | '8h' | '12h' | '24h'

/** Typed hover payload exposed for a future tooltip layer (spec §9.4). */
export interface HoverPayload {
  areaId: AreaId
  spStart: ISO
  kind: AreaKind
  data: unknown
}

export interface DrillDownEvent {
  areaId: AreaId
  spStart: ISO
  // The dashboard window at the moment of the click — added by OperationalDashboard so a
  // detail view can open on the same horizon.
  window?: { start: ISO; end: ISO }
}
