@AGENTS.md

# Modelling Framework — Claude Context

## Project Summary

A client-side Next.js 16 decision-support tool for GB electricity system operators. Fetches live data from the public Elexon Insights API and allows operators to model (commit) generation units to close deficits across 8 system balance areas (Margin, Recovery Reserve, Freq. Control Reserve, General Reserve, Contingency Reserve, Response, Inertia, Voltage) over a rolling 24-hour window of settlement periods.

> **Note:** `Docs/overview.md` is out of date — it describes an older single-date, single-action version. This file is the authoritative handover reference.

## Running the App

```bash
npm run dev       # http://localhost:3000
npm run build     # production build check
npx tsc --noEmit  # type check
```

---

## Current Architecture

### State — Zustand only (`src/store/useModellingStore.ts`)

No server state, no React Query. All state lives in Zustand. Key state shape:

```ts
units: BMUnit[]
settlementPeriods: SettlementPeriodData[]   // 48 slots, rolling 24h from now
drafts: DraftPlan[]
activeDraftId: string | null
selectedUnits: Set<string>
currentUser: UserId                          // active operator identity
isLoading: boolean
error: string | null
dataOverrides: Record<string, Partial<UnitSnapshot>>  // per-unit data redeclarations (prototype)
unitServices: Record<string, ServiceType>             // per-unit service assignment (SR | QR)
areaRequirements: Record<string, AreaRequirementRow[]> // 48 HH rows per non-Margin area (in Zustand)
```

`updateUnitWindow(draftId, bmUnitId, fromPeriod, toPeriod)` updates a single action's from/to independently of the draft-level window. If the draft is committed, it triggers `refreshAllAggregates`. Note: calling `updateDraftWindow` afterwards overwrites per-unit customisations (it bulk-sets all actions to the draft's from/to).

`refreshAllAggregates` is called inside the store on every draft commit/discard/clear. It runs `refreshAggregates` (recomputes EMX/EOL/EMI/Margin for each SP) followed by `computeAreaAvailabilities` (recomputes effective availability for all 7 non-Margin areas). Both are module-level pure functions composed in `refreshAllAggregates`. The spread `{ ...sp, ...computeAggregates(...) }` preserves `hasConfirmedPn`, `proxyEmx`, `proxyEol` without special handling.

### Rolling 24-Hour Window

Two fetch paths exist — both produce the same `{ units, settlementPeriods }` shape and use the same store:

- **Real-time** — `fetchAllData()` anchors to `now`, builds 48 slots from the current UTC SP of today wrapping into tomorrow, uses D-1 PN proxy for unconfirmed slots.
- **Historical** — `fetchHistoricalData(startDate, startSp)` anchors to a user-chosen past date + SP, builds 48 slots from `startSp` on `startDate` wrapping into `startDate + 1 day`. All slots are confirmed; no D-1 proxy. Dynamic params (NDZ/MZT/MNZT/SEL) are still fetched relative to today.

`settlementPeriod` in `SettlementPeriodData` is the **slot index 1–48 within the window** (not the real SP within the settlement day). The real SP is stored only in the `slotPlan` during fetch. This is true for both fetch paths.

### Historical Data Mode

Accessible via **⚙ Config → data tab**. Three local state vars in `page.tsx` (not in Zustand):

```ts
dataMode: 'real' | 'historical'        // default 'real'
historicalDate: string                  // YYYY-MM-DD, default yesterday
historicalStartSp: number              // 1–48, default current SP at page load
```

The **Data tab** in `ConfigPanel` provides:
- `Real-time | Historical` mode toggle (`SegControl`)
- Date picker (`<input type="date">`, capped at `max=yesterday` — future dates return empty PN)
- Start time select (`<select>` with all 48 SP start times in 30-min steps)
- Live info line showing the exact window: `"48 SPs: 14:00 UTC 03/05/2026 → 14:00 UTC 04/05/2026"`
- **Load historical data** button — calls `loadHistoricalData(date, startSp)` in `page.tsx`

`loadHistoricalData` shows a `ConfirmModal` first if any drafts exist ("Loading new data will delete all current drafts"), then calls `clearAllDrafts()` and `fetchHistoricalData`.

The sidebar **Refresh** button always calls `loadData` (real-time) regardless of mode. To re-fetch a historical window, use the Load button in the Data tab.

**Key differences from `fetchAllData`:**
- `hasConfirmedPn = true` for all 48 slots (all historical SPs have real data)
- `proxyEmx = 0`, `proxyEol = 0` — D-1 proxy is not needed
- No `yesterdayPN` fetch
- Uses `fetchDemandOutturn` (INDO actual metered demand) instead of `fetchDemandForecast` — historical mode shows real demand outturn, not the day-ahead forecast

### Draft Plans System

Operators create independent draft plans. Each draft is a colour-coded group of `ModellingAction`s. Drafts can be overlaid simultaneously on the margin chart as dotted lines. Committing a draft absorbs it into the solid baseline and triggers `refreshAggregates`. The `DraftDetails` component manages draft lifecycle (create, commit, discard, duplicate, share).

`DraftPlan` has a `description: string` field (empty string by default). Edited via a compact input in the `DraftDetails` panel between the name row and the From/To row — truncated with ellipsis when not focused, full text on hover (`title` attribute). `updateDraftDescription(id, description)` in the store handles updates.

Every draft has an `ownerId` (the operator who created it) and a `sharedWith` list. Only the owner can edit, commit, discard, or share a draft. Other operators can view shared drafts read-only and duplicate them into their own workspace.

### Draft Duplication

`duplicateDraft(id)` in the store deep-copies any draft (any status) into a new `'draft'`-status plan owned by `currentUser`, with a fresh ID, colour, and name prefixed `"Copy of …"`. It sets the copy as the active draft. The "Duplicate" button appears in `DraftDetails` for all statuses (draft, committed, discarded) and for shared-with-me drafts ("Duplicate to my drafts").

### User Identity & Sharing (prototype)

Seven fixed operator identities: `ANSE | NSE | OSM | OEM | NBE | TSM | TSE` — defined as `USERS` constant in `src/models/types.ts`. No authentication; the active identity is selected from a dropdown in the sidebar and persisted to `localStorage`.

- **Sidebar sections** (Editing / Committed / Discarded) show only the current user's own drafts.
- **"Shared with me"** section at the bottom of the sidebar lists drafts from other operators that include `currentUser` in their `sharedWith` array.
- **Share controls** in `DraftDetails` (owner only): inline chips per shared user with `×` to unshare, and a `+ Share` dropdown to add recipients.
- Switching identity resets `activeDraftId` to the new user's first draft.

> This is a UI prototype — no backend, no real data transport between machines. Sharing is simulated by switching the identity selector.

### Margin Calculation (`src/utils/margin.ts`)

`computeAggregates(sp, actions, units)` iterates **`sp.pn` directly** (not through the `units` array) for the baseline. This is critical — it means all PN-holding units contribute to EMX/EOL/EMI, including wind/solar/interconnectors that are not in the filtered unit reference list.

For units that appear in `sp.pn` but have no entry in `sp.mel` (e.g., units dropped by the decommissioned filter that are still generating, or interconnectors), the MEL falls back to `pn` — i.e., `sp.mel[bmUnit] ?? pn`. This ensures EMX ≥ EOL always holds. Using `0` as fallback would cause EMX < EOL for any such unit.

`applyDraftToBaseline(sp, baseEmx, baseEol, baseEmi, draftActions, alreadyModelled, units)` computes draft overlay efficiently without recomputing the baseline.

---

## Key Data Facts (Elexon API)

### PN endpoint behaviour — IMPORTANT
`GET /datasets/PN?settlementDate=YYYY-MM-DD&settlementPeriod=N` only returns data **after gate closure** for that SP. Gate closure is ~1 hour before delivery start (in BST/local GB time). At any given moment, only the next 1–2 confirmed SPs have live PN data. Everything beyond the frontier is zero — this is correct API behaviour, not a bug.

**Both `settlementDate` and `settlementPeriod` are required** — there is no single-call alternative. The app makes 48 parallel `fetchSinglePN` calls per data load.

### Settlement period numbering — BST offset (known issue, not fixed)
Elexon SPs are BST-based (local GB time). The app's `dateToSp` and `spToStartTime` utilities use UTC. During BST (late March–late October), SP numbers are off by 2 (e.g. BST SP 27 = UTC SP 25). This causes the 24h window to start ~1 hour earlier than the actual current SP in BST. Does not affect correctness significantly for a prototype — flag if precision matters.

### MELS always returns empty from the public API
`/datasets/MELS` returns no data. The app falls back to `registeredCapacity` for every unit's MEL. This is accounted for in the code — do not add logic expecting MELS data.

### D-1 proxy for unconfirmed SPs
For slots beyond the gate-closure frontier (where real PN = 0), `fetchAllData` fetches yesterday's full-day PN (`fetchPN(yesterdayDate)`) and:
- Backfills `sp.pn` for each unconfirmed slot with yesterday's same-SP values — so `computeAggregates` and `unitPnByBmUnit` see meaningful data for units that were active the prior day.
- Stores `hasConfirmedPn: boolean` — true if real post-gate PN exists (false = D-1 fill).
- Stores `proxyEmx` / `proxyEol` — D-1 aggregate estimates used by `MarginChart` to draw faint dashed reference lines alongside a gate-closure frontier marker.

**Cold unit caveat**: units that were also off yesterday simply don't appear in Elexon's PN data for any SP — they are absent from the response, not present with zero. The D-1 backfill therefore cannot help them.

### Dynamic parameters (SEL/NDZ/MNZT/MZT/SIL)
Fetched across 12×7-day windows (84 days / ~3 months) to capture units with infrequently-updated standing data. NDZ `notice` field is returned in **minutes** by the API (not seconds) — used directly without conversion. MNZT and MZT `periodMin` fields are also in minutes.

These values are also persisted in a **localStorage cache** (see Standing Data Cache section below). On each Refresh, `fetchBmUnits` merges live API results with cached values so units that haven't submitted new standing data recently still carry their last known parameters.

---

## Component Map

| File | Role |
|------|------|
| `src/app/page.tsx` | Top-level: data loading, layout, tab switching, derived data, confirm modals, sharing actions; owns `hiddenDraftIds` state for chart draft visibility; owns `solveTarget` state for the Deficit Solver; owns `activeAreaTab: AreaId` for Chart subtab; tab order: Dashboard \| Workspace \| Chart \| Committed \| Redeclare \| Requirements \| BMU Summary |
| `src/components/DraftSidebar.tsx` | Identity picker ("You are: [NSE ▼]"), window time + Refresh, draft list filtered to current user, "Shared with me" collapsible section; coloured circle visibility toggle per active draft; collapse button (‹/›) at top; New Draft button pinned to bottom footer |
| `src/components/DraftDetails.tsx` | Draft header: share icon (left of name, opens sharing popover), name input, description field (truncated, hover tooltip), From/To SP pickers + Scenario/GSP filter buttons in same row, action buttons; no cost/meta row, no state badge; From/To options display as `DD\|HH:MM`; accepts `solveMw?: number \| null` prop — shows a red "N MW deficit" badge when set |
| `src/components/AvailableTable.tsx` | Available units table: sort, checkbox or click selection, type + service chips; no toolbar — Scenario/GSP filters live in DraftDetails and are passed as props; Select button appears in header only when rows are checked; **Deficit Solver**: `solveMode` + `solveMw` props enable covering-set pre-check (highlighted rows) |
| `src/components/SelectedTable.tsx` | Selected units in active draft: Σ PN / Σ MEL / Est. value totals, notes input, remove button, service chip; **From/To columns** (before Event) with inline selects for per-unit window editing; To can be cleared to undefined (open-ended) |
| `src/components/Dashboard.tsx` | Landing tab: 8-area status tile grid with sparklines, timeframe selector (2h/4h/8h/12h/24h), A/B view toggle; tiles click through to Chart tab at the selected area's subtab |
| `src/components/AreaChart.tsx` | Recharts chart for non-Margin areas: requirement line (dashed), availability line (solid, area-coloured), draft overlays (dotted), deficit zone shading, drag-to-solve — identical interaction modes to MarginChart; fires `onSolveSelect` |
| `src/components/RequirementsTab.tsx` | 48-row editable table per area (Requirement / Contracted / Constrained → Net Available + Gap computed); area chip selector; Fill all SPs shortcut; non-Margin areas only |
| `src/components/CommittedTab.tsx` | Committed-tab view: cost breakdown cards (Total + per-reason, 8 reason codes), click-to-filter table, change-indicator arrows (↑/↓), service chip, bulk remove; **From/To columns** (read-only, before Event) |
| `src/components/RedeclareTab.tsx` | Redeclare-tab view: editable data columns for committed units (simulates redeclarations); amber row highlight on override; Reset per-row and Reset all; Service (SR/QR) assign select |
| `src/components/MarginChart.tsx` | Recharts chart: solid EMX/EOL/EMI baseline for all SPs + solid orange TR2 line (demand × reserve multiplier) + partial draft overlays (dotted only where draft has actions) + gate-closure frontier + midnight marker; draft visibility controlled via `hiddenDraftIds` prop; `reservePct` prop (default 10) controls TR2; dark-mode aware via MutationObserver; **Deficit Solver**: `chartInteractionMode` prop enables drag / 2-click / deficit-zone selection; fires `onSolveSelect(fromSp, toSp, worstDeficitMw)` callback |
| `src/components/ConfigPanel.tsx` | Floating config panel (4 tabs): **tweaks** (theme/layout/sidebar/selection/TR2 reserve %, **chart interaction mode** — drag/2-click/deficit zone), **scenarios** (ranking criteria), **data** (Real-time/Historical mode switch, date picker, start-time select, Load button), **standing data** (backfill + sync controls) |
| `src/components/GraphTab.tsx` | BMU Summary tab: read-only table of all units contributing to the margin chart — units with PN > 1 in any SP (including those outside the reference list) plus committed-draft units; Source badge differentiates "PN" (green) vs "User" (blue) vs "Both"; columns match AvailableTable with PN inserted before SEL; sorted by PN descending |
| `src/components/StandingDataTab.tsx` | Standing data tab UI: shows coverage (NDZ/MZT/MNZT/SEL per unit count), runs one-time backfill, shows per-batch progress, Sync Recent button after backfill completes |
| `src/components/ConfirmModal.tsx` | Dark-mode-aware confirm dialog (replaces native browser confirm) |
| `src/config/areas.ts` | `AreaId` union type (8 values), `AreaConfig` interface, `AREAS` array, `NON_MARGIN_AREAS`, `getArea(id)` |
| `src/utils/areaAggregates.ts` | `unitAreaContribution`, `computeAreaAvailabilities`, `applyDraftToAreaBaseline`, `computeAreaStatus` — per-area contribution formulas and availability computation |
| `src/models/types.ts` | All interfaces; `USERS`, `UserId`, `ServiceType`, `UnitSnapshot`, `AreaRequirementRow`; `SettlementPeriodData.areaAvailability?: Record<string, number>` |
| `src/services/elexon.ts` | All fetch logic + mock fallback; auto-runs incremental standing data sync at start of `fetchBmUnits` when cache is stale; `fetchDemandOutturn` fetches INDO actual demand (used by `fetchHistoricalData` in place of the day-ahead forecast) |
| `src/services/standingDataSync.ts` | localStorage-based standing data cache: backfill, incremental sync, coverage computation; keys `so:standing_data` and `so:sync_metadata` |
| `src/store/useModellingStore.ts` | Zustand store |
| `src/utils/margin.ts` | `computeAggregates`, `applyDraftToBaseline`, `isUnitPnCommitted` |
| `src/utils/settlements.ts` | SP ↔ time helpers (UTC-based, see BST note above) |
| `src/utils/fuelTypes.ts` | `EXCLUDED_FUEL_TYPES` (display filter) and `FETCH_EXCLUDED_FUEL_TYPES` (fetch filter) — shared by `elexon.ts` and `AvailableTable.tsx` |

---

## What Not to Change Without Reading First

- **Two separate fetch paths** — `fetchAllData()` (real-time, D-1 proxy) and `fetchHistoricalData()` (historical, all confirmed). Keep them independent. Do not merge them into a single function with a mode flag — that was an explicitly rejected design option.
- **`computeAggregates` iterates `sp.pn` directly** — never change it to iterate `units` instead. That would miss all PN-holding units outside the dispatchable filter (wind, solar, etc.) and break the baseline.
- **`refreshAllAggregates` in the store** — must be called whenever committed draft actions change. Replaces all former `refreshAggregates(...)` call sites: `commitDraft`, `discardDraft`, `reopenDraft`, `clearAllDrafts`, `setSettlementPeriods`, `removeUnitFromDraft`, `updateDraftWindow`, `updateUnitWindow`. Do not call `refreshAggregates` directly from these actions — it would skip recomputing non-Margin area availabilities.
- **`settlementPeriod` in `SettlementPeriodData`** is the slot index 1–48, not the real SP number. All `ModellingAction.fromPeriod`/`toPeriod` comparisons use this slot index.
- **`ModellingAction.toPeriod` is `number | undefined`** — `undefined` means open-ended (the action covers all SPs from `fromPeriod` to the end of the window). Every check against `toPeriod` must handle the undefined case: `(action.toPeriod === undefined || action.toPeriod >= spNum)`. Do not revert to `number` — the SelectedTable UI exposes a "clear To" option that sets it to undefined.
- **`src/utils/fuelTypes.ts`** — two separate exclusion sets. `FETCH_EXCLUDED_FUEL_TYPES` prevents units from being fetched at all (solar, interconnectors, COAL, COALB). `EXCLUDED_FUEL_TYPES` is the display-only filter applied in `AvailableTable` (adds WIND, NUCLEAR on top). Keep both in sync when adding fuel types. COAL and COALB are in both sets — they are fetched but never displayed, and never committed to the unit list.
- **Standing data cache** — uses `localStorage` (keys `so:standing_data`, `so:sync_metadata`). Do not move back to Firestore without discussion — WebSocket connections to `firestore.googleapis.com` are blocked in some network environments. The cache persists across sessions; a one-time backfill is sufficient for a given browser profile.
- **Auto-sync in `fetchBmUnits`** — silently calls `runIncrementalSync()` before the `Promise.all` if `backfillComplete` is true and `lastSyncedTo` is more than 23 hours ago. It is intentionally silent (no UI feedback, error swallowed). Do not add loading state or toast for this — it runs in the background of a normal Refresh.
- **Decommissioned unit filter in `fetchBmUnits`** — units where all four of `sel`, `ndz`, `mnzt`, `mzt` are `undefined` after merging live API + localStorage cache are skipped entirely (`continue`). This removes units that have never submitted standing data (mothballed / decommissioned). Do not remove this filter — the raw reference API returns ~1000+ units including long-decommissioned plant.
- **`fetchSinglePN` + 48 parallel calls** — do not collapse into a single date-range call; the Elexon PN endpoint requires per-SP queries. The `/datasets/PN` endpoint with only a date-range returns 404 — `settlementDate` + `settlementPeriod` are both mandatory.
- **`ownerId` on every draft** — `createDraft` and `duplicateDraft` both set `ownerId: state.currentUser`. Any new draft-creation path must do the same. Drafts without `ownerId` will be invisible to all users in the sidebar.
- **`dataSnapshot` is set at commit time** — `commitDraft` in the store reads `state.units` and `state.dataOverrides` to build the snapshot. If you add new tracked fields to `UnitSnapshot`, update both `commitDraft` and `ChangeArrow`'s render logic.
- **`dataOverrides` is separate from `unitServices`** — overrides are numeric value redeclarations for change-tracking; services are categorical assignments. Do not merge them.
- **`TweakState.reservePct`** — lives in local state in `page.tsx`, not in Zustand. Passed as a prop to `MarginChart`. Default 10. Clamped to 0–50 in the Config input. Do not lift to the store.
- **`gspFilter` and `scenario` are props in `AvailableTable`** — lifted to `page.tsx` state so `DraftDetails` can also control them (Scenario and GSP buttons live in the DraftDetails time-pickers row). Do not move them back to local state in `AvailableTable`.
- **`hiddenDraftIds` in `page.tsx` is local state** — intentionally not in Zustand. It is purely a chart UI concern. Passed as a prop to `MarginChart` and (with `onToggleChartVisibility`) to `DraftSidebar`. Do not lift to the store.
- **`sidebarOpen` in `page.tsx` is local state** — controls the CSS `sidebar-collapsed` class on the app grid, which transitions `grid-template-columns` from `215px 1fr` to `36px 1fr`. Do not lift to the store.
- **`AvailableTable` has no toolbar** — search, type filter, and the scenario/GSP buttons were removed. The only filtering controls are Scenario and GSP in `DraftDetails`. Do not re-add a toolbar to `AvailableTable`.
- **Draft overlay partial rendering** — `MarginChart` only draws the dotted draft line for SPs where `draft.actions.some(a => a.fromPeriod <= slotIdx && a.toPeriod >= slotIdx)`. Adjacent SPs (one either side of the affected range) are included as bridge points at the baseline value so the line connects cleanly. Do not revert to rendering the full 48-SP dotted line.
- **Margin = EMX − TR2, not EMX − demand** — the chart recomputes margin in `chartData` as `sp.emx − sp.demand × (1 + reservePct/100)`. The store's `sp.margin` field (which is `emx − demand`) is intentionally ignored by the chart. Draft overlay margins in the tooltip also use TR2 as the reference. Do not change the chart to use `sp.margin` or `raw.demand` as the margin baseline.
- **`sp.mel[bmUnit] ?? pn` in `computeAggregates`** — the MEL fallback is `pn`, not `0`. Using `0` causes EMX < EOL for any unit in `sp.pn` that is absent from the `units` array (e.g., units dropped by the decommissioned filter). Do not revert to `?? 0`.
- **Recharts 3.x `activeTooltipIndex` is a STRING** — In Recharts 3.8.x, `CategoricalChartState.activeTooltipIndex` has type `TooltipIndex = string | null`. It is passed as e.g. `"28"`, not `28`. `typeof e?.activeTooltipIndex === 'number'` always returns `false`. Always parse it: `const idx = raw != null ? parseInt(String(raw), 10) : null; if (idx == null || isNaN(idx)) return`. Do not use the number type guard.
- **Drag tracking in `MarginChart` requires `useRef`, not `useState`** — `onMouseDown` calls `setIsDragging(true)` but React batches state updates; by the time `onMouseMove` fires, `isDragging` is still `false`. Use `isDraggingRef = useRef(false)` and `dragStartRef = useRef<number | null>(null)` for synchronous tracking inside event handlers. `useState` values are only safe to read in render.
- **`deficitRanges` useMemo in `MarginChart` must be before the early return** — The early return `if (isLoading || settlementPeriods.length === 0) return` is at line ~256. Any `useMemo`/`useEffect` placed after it is skipped when loading, causing a hooks-order violation on the next render. All hooks must be declared before any conditional return.
- **`solveTarget` in `page.tsx` is local state, not Zustand** — same pattern as `reservePct`, `hiddenDraftIds`, `sidebarOpen`. Do not lift to the store.
- **Clearing `solveTarget`** — must be reset in `loadData` (real-time refresh), inside `doLoad` in `loadHistoricalData`, and whenever the operator manually edits the draft From/To in `DraftDetails`. Missing any of these leaves a stale solve badge after data changes.
- **`areaAvailability` on `SettlementPeriodData` uses `Record<string, number>` (string key, not `AreaId`)** — avoids a circular import between `types.ts` and `areas.ts`. Always access as `sp.areaAvailability?.[area] ?? 0` — the field is optional and may be absent for SPs that haven't been through `refreshAllAggregates` yet.
- **Margin area does NOT write to `areaAvailability`** — the Dashboard Margin tile and Chart Margin subtab read from `sp.emx` and `sp.demand` via the existing path. `areaAvailability['margin']` is never written or read. Do not try to unify them.
- **`computeAreaAvailabilities` iterates `NON_MARGIN_AREA_IDS` only** — margin is excluded from the loop. The list is defined as a `const` in both `areaAggregates.ts` and `useModellingStore.ts` (duplication is intentional to avoid the circular import).
- **`areaRequirements` is in Zustand, not local state** — unlike `reservePct`, `hiddenDraftIds`, `solveTarget`, which are page.tsx local state. `areaRequirements` needs to survive tab switches and feed both RequirementsTab and the Dashboard/AreaChart reads, so it lives in the store.
- **`deficitRanges` useMemo in `AreaChart` must be before the early return** — same rule as `MarginChart`. Placing any hook after `if (isLoading || settlementPeriods.length === 0) return` causes a hooks-order violation.
- **Drag tracking in `AreaChart` uses `useRef`** — same pattern as `MarginChart`. `isDraggingRef = useRef(false)` and `dragStartRef = useRef<number | null>(null)` for synchronous tracking; `useState` batches and is not reliable inside `onMouseMove`.
- **`handleSolveNavigate` auto-selects scenario from active area** — uses `getArea(activeAreaTab).defaultScenario` so the workspace scenario matches whichever area the operator solved from. Do not hardcode `'margin'`.
- **`ModellingAction.reasonCode` no longer has `CONSTRAINT` or `RESERVE`** — replaced by `RECOVERY_RESERVE | FREQ_CONTROL_RESERVE | GENERAL_RESERVE | CONTINGENCY_RESERVE | RESPONSE`. Any switch/case on `reasonCode` in CommittedTab, SelectedTable, RedeclareTab must handle all 8 current codes and must not reference the removed ones.
- **`SCENARIO_REASON` in `page.tsx` maps `pullback → 'MARGIN'`** — pullback has no dedicated reason code; it falls back to MARGIN. `reserve → 'RECOVERY_RESERVE'`, `response → 'RESPONSE'`.

---

## Balancing Areas Dashboard

### 8 Areas

| Area | Unit | Notes |
|------|------|-------|
| Margin | MW | Existing — uses `sp.emx` / `sp.demand` path unchanged |
| Recovery Reserve | MW | New |
| Freq. Control Reserve | MW | New |
| General Reserve | MW | New |
| Contingency Reserve | MW | New |
| Response | MW | New |
| Inertia | GVAs | New |
| Voltage | MVAr | New — simplified national proxy |

### Dashboard Tab (landing page)

8 tiles in a 3-column grid. Timeframe selector controls how many SPs contribute to the worst-case headline (2h = 4 SPs, 4h = 8, 8h = 16, 12h = 24, 24h = 48). Sparkline always shows all 48 SPs regardless of timeframe. A/B toggle: View A = status word + large gap number + area name + req/avail footer; View B = side-by-side req/avail cards + status badge.

Status colours: red = shortfall (avail < req), amber = tight (0 ≤ gap < 10% of req), green = surplus.

Tile click → `handleDashboardTileClick(area)` → sets `activeAreaTab`, switches to Chart tab.

### Chart Tab — Area Subtab Row

A subtab row sits above the chart, visible whenever `activeTab === 'chart'`. Each subtab has a status dot. Active subtab underlined in status colour. Clicking a subtab sets `activeAreaTab`.

- `activeAreaTab === 'margin'` → renders the existing `MarginChart` unchanged
- `activeAreaTab !== 'margin'` → renders `AreaChart` for that area

`activeAreaTab: AreaId` is local state in `page.tsx` (not Zustand).

### Per-Area Availability Computation (`src/utils/areaAggregates.ts`)

```
effectiveAvailability[area][sp] = max(0, contracted − constrained) + Σ contribution(unit, area, sp)
```

Contribution formulas (prototype — each area's formula will be refined independently):

| Area | Contribution per committed unit |
|------|--------------------------------|
| Reserve areas (4) | `max(0, mel − pn)` |
| Response | `max(0, mel − pn)` if fuelType in `{PS, NPSHYD, OCGT, CCGT}`, else 0 |
| Inertia | `registeredCapacity × 0.05` GVAs if synchronous (`{CCGT, NUCLEAR, NPSHYD, OCGT, PS, COAL}`), else 0 |
| Voltage | `registeredCapacity × 0.3` MVAr — simplified, no GSP localisation |

`mel` = `unit.registeredCapacity ?? sp.mel[bmUnitId] ?? 0`. Dedup by `bmUnitId` within each SP (same unit appearing in multiple actions is counted once).

### `computeAreaStatus` for tiles and dots

`computeAreaStatus(area, settlementPeriods, areaRequirements, spCount, reservePct)` returns `{ status, worstGap, worstAvail, worstReq }`. For Margin, reads `sp.emx` and `sp.demand × (1 + reservePct/100)`. For other areas, reads `sp.areaAvailability?.[area] ?? 0` and `areaRequirements[area][sp].requirement`.

### Requirements Tab

One area at a time (non-Margin only). Area chip selector. 48 editable rows: SP | Time (UTC) | Requirement | Contracted | Constrained | Net Available (computed) | Gap (computed, colour-coded). Fill all SPs shortcut in toolbar. Data stored in `areaRequirements` in Zustand.

### Auto-Scenario on Solve

When the operator drags a deficit on an area chart and clicks "Solve ↗", `handleSolveNavigate` calls `setScenario(getArea(activeAreaTab).defaultScenario)`. Scenario mapping: Margin→margin, Reserve areas→reserve, Response→response, Inertia→inertia, Voltage→voltage.

---

## Deficit Solver

Allows operators to identify a deficit period on the chart and auto-populate the active draft's From/To window, then see which units cover the gap.

### Workflow

1. **Chart selection** — operator selects a range using one of three modes (Config → Tweaks → Chart interaction):
   - **Drag** (default) — click-and-drag across SPs; a blue `ReferenceArea` highlights the selection.
   - **2-Click** — first click sets start (amber dashed `ReferenceLine`), second click completes range.
   - **Deficit zone** — click anywhere inside an existing deficit zone; the full contiguous deficit range is auto-selected.

2. **`onSolveSelect` callback fires** — `MarginChart` calls `onSolveSelect(fromSp, toSp, worstDeficitMw)` only if the selected range contains at least one slot where `EMX < TR2`. No-deficit selections are silently ignored.

3. **`solveTarget` state in `page.tsx`** — stores `{ fromSp, toSp, worstDeficitMw }`. When set:
   - App switches to the **Workspace** tab.
   - Active draft's From/To is updated via `updateDraftWindow`.
   - A **Solve bar** appears below the chart (visible on Chart tab) showing From, To, Duration, Worst Deficit, and a "Solve ↗" button that re-switches to Workspace.
   - `DraftDetails` receives `solveMw` and shows a red deficit badge.
   - `AvailableTable` receives `solveMode=true` and `solveMw`.

4. **Covering set pre-check in `AvailableTable`** — when `solveMode` is true, a `coveringSet` useMemo walks `visible` units in scenario-ranked order, accumulating `max(0, mel − pn)` until the running total meets `solveMw`. Those units are highlighted (indigo background) and seeded into `pendingIds` via a `useEffect`.

5. **Clearing** — `solveTarget` is reset to `null` when: data is reloaded, or the operator manually edits the draft's From or To (via `DraftDetails`).

### State ownership

```ts
// page.tsx local state — NOT in Zustand
solveTarget: { fromSp: number; toSp: number; worstDeficitMw: number } | null
```

### Key invariants

- `worstDeficitMw` is always negative (it is `min(emx − tr2)` over the range).
- `AvailableTable` receives `solveMw = Math.abs(worstDeficitMw)` — a positive MW target.
- The Solve bar's "Worst deficit" display shows the raw negative value with `toLocaleString`.
- `deficitRanges` in `MarginChart` is computed **before the early return** (`isLoading || settlementPeriods.length === 0`). Moving it after causes a hooks-order violation when the loading state changes.

### `TweakState` addition

```ts
export interface TweakState {
  // ... existing fields ...
  chartInteractionMode: 'drag' | 'twoClick' | 'deficit'
}
```

Default: `'drag'`. Controlled via a `SegControl` in Config → Tweaks tab. Changing mode resets all drag/click state in `MarginChart` via a `useEffect` on `chartInteractionMode`.

---

## Draft Cost Calculation

The cost formula is used only in `CommittedTab` for the cost breakdown cards (`STATIC_PRICE = 120`):

```
Cost = Σ max(0, MEL − PN) × £120   (per unique unit in the draft)
```

- **MEL** = `unit.registeredCapacity` (MELS API always empty, see above)
- **PN** = `unitPnByBmUnit[bmUnitId]` — see "PN / SEL fallback" below
- **Price** = £120/MWh static placeholder (no real price data available)

The draft header no longer displays cost, window, duration, or unit count — those meta items were removed. `activeDraftCost` and its memo no longer exist in `page.tsx`.

## Committed Tab — Cost Breakdown Cards

A row of summary cards sits above the data table on the Committed tab:

- **Total** (blue) — cost, unit count, and total MEL across all committed units.
- **Margin / Recovery Reserve / Freq. Control / General Reserve / Contingency / Response / Inertia / Voltage** (colour-coded) — per-reason-code breakdown using the same cost formula. (Old CONSTRAINT and RESERVE cards are removed.)

Cards with 0 units render at 40% opacity. Clicking a card sets `selectedReason` and filters the table to matching rows. Clicking the active card (or Total) resets the filter. All state is local to `CommittedTab` — no props needed.

## Column Layout — All Four Tables

`AvailableTable`, `SelectedTable`, `CommittedTab`, and `RedeclareTab` share the same column set (in order):

| Column | Notes |
|--------|-------|
| BMU | `nationalGridBmUnit` + `gspGroup` sub-label (two-line cell via `.bmu-cell-inner` inner div — do **not** apply flex to the `<td>` itself or `vertical-align: middle` breaks) |
| Type | Fuel type chip — **before** Service |
| Service | SR or QR chip (blue/purple); `—` if unassigned. Set on Redeclare tab. |
| NDZ | Notice to Deviate (minutes), `—` if zero — displayed as plain number, no "m" suffix |
| MZT | Minimum Zero Time (minutes) — plain number, no "m" suffix |
| MNZT | Minimum Non-Zero Time (minutes) — plain number, no "m" suffix |
| SEL | Stable Export Limit (MW) |
| MEL | `registeredCapacity` (MW) |
| £ SEL | Price to SEL tier |
| £ MEL | Price to MEL tier |
| PN | Current physical notification (MW) — conditional on pullback scenario in Available/Selected; always shown in Committed |
| From | Per-unit window start — editable select in SelectedTable, read-only in CommittedTab; displayed as `DD\|HH:MM` |
| To | Per-unit window end — editable select with a `—` (clear) option in SelectedTable, read-only in CommittedTab; `undefined` = open-ended; displayed as `DD\|HH:MM` |
| Event | `operationType` (AS / DS / AD etc.) |
| Reason | `reasonCode` — one of: Margin / Recovery Reserve / Freq. Control / General Reserve / Contingency / Response / Inertia / Voltage |

CommittedTab also has: Draft (source draft name badge), Notes, a leading checkbox column for bulk remove, and change-indicator arrows (↑/↓) on data cells where the current value has drifted >10% from the commit-time snapshot.

### AvailableTable-specific columns

`AvailableTable` has two extra leading columns before BMU (only when `selectionPattern === 'buttons'` and not `readOnly`):

| Position | Column | Notes |
|----------|--------|-------|
| 1 | Checkbox | `position: sticky; left: 0` — frozen during horizontal scroll |
| 2 | + (add) | `position: sticky; left: 32px` — frozen during horizontal scroll |
| 3 | BMU | Not sticky (attempts to freeze BMU were abandoned) |
| last | Draft indicator | Narrow column showing `●` (blue, in active draft) and/or `●N` (amber, in N other drafts) with tooltip listing all draft names on hover |

`otherDraftUnitMap` in `page.tsx` is `Map<string, string[]>` — maps each unit to **all** other-draft names it appears in (not just the first). The draft indicator renders a count badge with a tooltip from this array.

The table has `min-width: 100%` (not `width: 100%`) so it can overflow and trigger horizontal scroll in `.table-scroll`.

## PN / SEL Fallback in `unitPnByBmUnit`

`unitPnByBmUnit` (computed in `page.tsx`) is the per-unit PN used by both tables (AvailableTable, SelectedTable, CommittedTab) and the Cost calculation. Build order:

1. **Real PN** — from confirmed settlement period slots (`sp.pn[bmUnitId]`)
2. **D-1 PN** — for unconfirmed slots, `sp.pn` is backfilled from yesterday's same-SP data in `fetchAllData`; the max over all 48 slots therefore includes any prior-day output
3. **SEL fallback** — if max PN across all 48 slots is still 0, fall back to `unit.sel` (Stable Export Limit). This covers cold units that are not in Elexon's PN data at all (i.e., haven't been dispatched recently and don't appear in any SP's response).

Units with no PN, no D-1 data, and no SEL show `—`. This is the honest answer for mothballed / inactive units.

**Do not remove the SEL fallback** — cold CCGTs like BAGE-1 genuinely don't appear in the Elexon PN dataset and would otherwise show blank PN and a misleading Cost of MEL × £120.

## Data-Change Tracking & Redeclare Tab

### How it works

When a draft is committed, `commitDraft` in the store snapshots the effective values of each unit at that moment into `draft.dataSnapshot: Record<string, UnitSnapshot>`. `UnitSnapshot` captures: `mel, sel, ndz, mzt, mnzt, priceToSel, priceToMel`.

The **Redeclare tab** allows a tester to simulate unit redeclarations by editing those fields inline. Changes are stored in `dataOverrides: Record<string, Partial<UnitSnapshot>>` — a global store map, not tied to any draft. The Committed tab reads `dataOverrides` to compute "effective" values at render time, then compares against the draft's snapshot.

### Change indicators in Committed tab

A `ChangeArrow` component renders a coloured superscript arrow (↑ green, ↓ red) next to any cell whose effective value has drifted more than `CHANGE_THRESHOLD` (10%) from the commit-time snapshot. Hovering shows a `title` tooltip: `Was: 500 MW → Now: 400 MW (−20%)`.

- The threshold constant is `CHANGE_THRESHOLD = 10` in `CommittedTab.tsx`.
- Arrows only appear for units that have a snapshot (i.e., were committed after this feature was added).
- `dataOverrides` is global — it persists across tab switches and simulates a live data feed changing underlying unit data.

### Redeclare tab UX

- Editable `<input type="number">` for MEL, SEL, NDZ, MZT, MNZT, £ SEL, £ MEL per row.
- Service (SR/QR/—) `<select>` per row — assignments are stored in `unitServices` (separate from `dataOverrides`).
- Overridden rows are highlighted amber. Per-row **Reset** button and top-level **Reset all** button.
- PN, Event, Reason, Draft columns are read-only on this tab.

## GSP Group Filter & Scenario

Both filters live in **`DraftDetails`** (not `AvailableTable`). Their state is owned by `page.tsx` and passed down as props:

```ts
// page.tsx state
scenario: string                                      // active scenario id ('none' or SCENARIOS[n].id)
gspFilter: Record<string, 'include' | 'exclude'>      // absence = neutral
```

The Scenario and GSP buttons sit in the same row as the From/To SP pickers inside `.time-pickers` in `DraftDetails`. `ScenarioPopover` and `GspFilterPopover` are defined as subcomponents in `DraftDetails.tsx` (not in `AvailableTable.tsx`).

`AvailableTable` receives `scenario` and `gspFilter` as **read-only props** and applies them in its `visible` useMemo — it does not own or mutate them.

### GSP filter logic (in `AvailableTable.visible`)

```ts
if (gspIncluded.length > 0 && !gspIncluded.includes(r.gspGroup)) return false
if (gspExcluded.includes(r.gspGroup)) return false
```

A unit passes if its `gspGroup` is in at least one included zone (when any inclusions are set) **and** not in any excluded zone.

### Data source

Zone list: `GSP_AREAS` in `src/config/scenarios.ts` (14 entries). Zone membership uses `unit.gspGroup`.

### GSP button badge states

| State | Appearance |
|-------|-----------|
| Inactive | `GSP ▾` — default border |
| Includes only | `GSP ▾ +N` — indigo border + badge |
| Excludes only | `GSP ▾ −N` — red border + badge |
| Mixed | `GSP ▾ +N −N` — indigo border, both badges |

---

## Service Column (SR / QR)

`ServiceType = 'SR' | 'QR'` is defined in `src/models/types.ts`. Services are stored in `unitServices: Record<string, ServiceType>` in the Zustand store, separate from `dataOverrides`.

- Assigned via the **Service** select on the Redeclare tab.
- Displayed as a colour chip in the **Service** column (third column, after Type) on Available, Selected, Committed, and Redeclare tabs.
- SR = blue chip; QR = purple chip (light + dark mode variants in `globals.css`).
- `setUnitService(bmUnitId, service | undefined)` — pass `undefined` to clear.

---

## MarginChart — Line Rendering Rules

### Baseline lines (EMX / EOL / EMI)
All three are drawn as **solid** lines for every SP in the 48-slot window, regardless of `hasConfirmedPn`. In real-time mode, unconfirmed SPs carry D-1 proxy values in `sp.emx/eol/emi` (computed by `refreshAggregates` from the backfilled `sp.pn`). In historical mode all SPs are confirmed. The old behaviour of hiding EMX/EOL/EMI for unconfirmed SPs and showing separate dotted `proxyEmx`/`proxyEol` lines has been removed.

### TR2 line and margin definition
A solid orange **TR2** line is drawn at `demand × (1 + reservePct / 100)` for every SP. `reservePct` is configurable in Config → Tweaks (default 10). **Margin is `EMX − TR2`**, not `EMX − demand`. The green/red surplus/deficit shaded areas and all draft overlay margin figures use the same TR2-based definition. The raw `sp.margin` from the store (which is `emx − demand`) is **not used** by the chart — margin is recomputed in `chartData` construction.

### Draft overlay lines
Dotted lines per active draft, but **only drawn for SPs covered by the draft's actions**. Logic in `chartData` construction:
```ts
const spCovered = (slotIdx) => draft.actions.some(a => a.fromPeriod <= slotIdx && a.toPeriod >= slotIdx)
```
- Covered SP → overlay value (dotted, diverges from baseline)
- Adjacent SP (bridge point) → baseline value (so the line branches off/returns to the solid cleanly)
- All other SPs → `null` (Recharts skips, solid baseline visible)

### Draft chart visibility toggle
`hiddenDraftIds: Set<string>` lives in `page.tsx` (local state, not Zustand). Toggled via the small coloured circle button on each `status === 'draft'` item in `DraftSidebar`. Passed as a prop to `MarginChart`, which filters `activeDrafts` with it:
```ts
const activeDrafts = drafts.filter(d => d.status === 'draft' && !hiddenDraftIds.has(d.id))
```

### Deficit Solver selection overlay
A blue `ReferenceArea` (`fill="#6366f1"`, `fillOpacity=0.15`) is drawn between `dragStart` and `dragEnd` indices whenever both are non-null. In 2-click mode, an amber dashed `ReferenceLine` marks the start point while waiting for the second click. All selection state (`dragStart`, `dragEnd`, `clickPhase`, `clickStart`) is local to `MarginChart` — not in Zustand.

### Reference markers
- **Gate closure** — amber `ReferenceLine` + shaded `ReferenceArea` for unconfirmed SPs; only shown in real-time mode (hidden when all SPs have `hasConfirmedPn`).
- **Midnight** — grey `ReferenceLine` where the settlement date rolls over; label `← midnight` rendered `insideTopLeft` to avoid clipping.

---

## Standing Data Cache

NDZ, MZT, MNZT, and SEL are change-only datasets — Elexon only publishes a new entry when the value changes. A unit that last changed its NDZ 6 months ago won't appear in a 3-month rolling fetch. To handle this, the app maintains a localStorage cache built by a one-time backfill.

### Storage
- `so:standing_data` — `Array<[bmUnitId, CachedStandingData]>` (JSON-serialised Map). Each entry holds up to four values plus the ISO date each was effective from.
- `so:sync_metadata` — `{ backfillComplete: boolean, backfillFrom: string, lastSyncedTo: string }`.

### Lifecycle
1. **Backfill** (one-time, manual) — triggered from the **Standing Data** tab in ConfigPanel. Searches up to 6 years back in yearly chunks, batching 20 requests at a time. Stops early if a year yields no new data. Writes to localStorage incrementally. Sets `backfillComplete: true` when done.
2. **Incremental sync** (automatic) — `fetchBmUnits` checks on every Refresh whether `backfillComplete && lastSyncedTo` is more than 23 hours old. If so, `runIncrementalSync()` fetches from `lastSyncedTo` to today and merges new entries. Silent — no UI indicator.
3. **Manual sync** — "Sync Recent" button in the Standing Data tab for on-demand refresh after backfill.

### Merge logic
`mergeEntries` keeps the entry with the **most recent effective date** — if the cached date is already newer than what the API just returned, the cache wins. This prevents older API windows from overwriting fresher cached values.

### `fetchBmUnits` integration
After the auto-sync check, `loadStandingDataCache()` is included in the `Promise.all`. For each unit, live API values take priority; cache fills in any gaps:
```ts
const ndz = ndzEntry?.notice !== undefined ? ndzEntry.notice : cached?.ndz
```
Units where all four of `sel`, `ndz`, `mnzt`, `mzt` are still `undefined` after merging are dropped (decommissioned filter).

---

## Known Issues / Future Work

- **BST/UTC offset** — window starts ~1 hour early in summer. Low priority for prototype.
- **£120 static price** — real BM offer prices not yet integrated; cost figures are indicative only.
- **No test suite** — margin calculation logic is a good candidate for unit tests.
- **D-1 proxy + tomorrow slots** — tomorrow's SPs always have zero confirmed PN; they use yesterday's same-SP data as proxy. This is a reasonable heuristic but not operationally precise.
- **NDZ/MZT/MNZT blank — root cause found and fixed** — Two bugs: (1) `notice` field in the NDZ endpoint is in **minutes** not seconds; the code was dividing by 60 again, collapsing most values to 0. (2) Standing data is change-only — units only submit new entries when parameters change. CNQPS-2 last submitted NDZ 8–9 weeks ago, outside the old 35-day window. Both fixed: division removed, lookback extended to 84 days. The localStorage backfill now covers up to 6 years, so even infrequently-updated units are captured. Key format is confirmed consistent: `bmUnit: "T_CNQPS-2"` in dynamic param endpoints matches `elexonBmUnit: "T_CNQPS-2"` in reference data — key mismatch is **not** an issue.
- **Units with partial standing data still show `—` for missing params** — A unit that has SEL but no NDZ/MZT/MNZT (e.g. a unit that never submitted dynamic params) will pass the decommissioned filter but still show dashes in those columns. This is a data reality; no fix planned.
- **Standing data backfill is per-browser** — The localStorage cache is not shared between machines or browser profiles. Each new browser session needs its own backfill.
- **`sp.margin` in the store is stale relative to the chart** — `sp.margin` stored in Zustand is `emx − demand` (no reserve). The chart uses `emx − TR2` instead. If any future feature reads `sp.margin` for a reserve-aware deficit check it must recompute locally.
- **Rate limiting risk** — `fetchAllData` fires ~108 concurrent requests (48 current PN + 48 D-1 PN + 12 dynamic param windows). `fetchHistoricalData` fires ~108 (48 PN + 60 dynamic param windows). Failures are silently swallowed. If PN or dynamic params are unexpectedly blank, rate limiting is the likely cause.
- **Sharing is UI-only** — no backend; switching identity is how you simulate another user seeing a shared draft. Shared state does not persist between browser sessions or machines.
- **`Docs/overview.md` is stale** — describes the old single-date, single-action version. Should be rewritten if documentation is needed.
- **Per-area contribution formulas are prototypes** — each area uses a simplified formula (e.g. flat 0.05 GVAs/MW for inertia, flat 0.3 MVAr/MW for voltage, no GSP localisation). Real rules are to be developed per area independently by the operator.
- **Requirements data is manually entered** — the Requirements tab is a prototype for operator input. Real sources (BOA, STOR notices, system forecasts) are not yet integrated.
- **Constraints area excluded** — requires a circuit-level design pattern rather than the system-level area model. To be designed separately.
- **Inertia H constant is a flat proxy** — using 0.05 GVAs/MW for all synchronous units. Real per-unit H constants are available from Elexon dynamic parameters.
- **Voltage proxy is national, not GSP-local** — the real voltage support model requires GSP-level filtering already present in the Voltage scenario. Out of scope for current prototype.
- **Response sub-classification** — Dynamic Containment, Moderation, Regulation treated uniformly. No sub-type distinction yet.
