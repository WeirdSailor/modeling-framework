@AGENTS.md

# Modelling Framework — Claude Context

## Project Summary

A client-side Next.js 16 decision-support tool for GB electricity system operators. Fetches live data from the public Elexon Insights API and allows operators to model (commit) generation units to close margin deficits across a rolling 24-hour window of settlement periods.

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
```

`refreshAggregates` is called inside the store on every draft commit/discard/clear. It recomputes EMX/EOL/EMI/Margin for each SP using committed draft actions. It does `{ ...sp, ...computeAggregates(...) }` — the spread preserves `hasConfirmedPn`, `proxyEmx`, `proxyEol` without any special handling.

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

### Draft Plans System

Operators create independent draft plans. Each draft is a colour-coded group of `ModellingAction`s. Drafts can be overlaid simultaneously on the margin chart as dotted lines. Committing a draft absorbs it into the solid baseline and triggers `refreshAggregates`. The `DraftDetails` component manages draft lifecycle (create, commit, discard, duplicate, share).

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

---

## Component Map

| File | Role |
|------|------|
| `src/app/page.tsx` | Top-level: data loading, layout, tab switching, derived data, confirm modals, sharing actions; owns `hiddenDraftIds` state for chart draft visibility |
| `src/components/DraftSidebar.tsx` | Identity picker ("You are: [NSE ▼]"), window time + Refresh, draft list filtered to current user, "Shared with me" collapsible section; coloured circle visibility toggle per active draft |
| `src/components/DraftDetails.tsx` | Draft header: name, state badge, meta row (window/duration/units/cost), share controls (owner) or "Shared by X" badge (recipient), From/To SP pickers, action buttons |
| `src/components/AvailableTable.tsx` | Available units table: search/filter/sort, GSP group filter popover, checkbox or click selection, type + service chips |
| `src/components/SelectedTable.tsx` | Selected units in active draft: Σ PN / Σ MEL / Est. value totals, notes input, remove button, service chip |
| `src/components/CommittedTab.tsx` | Committed-tab view: cost breakdown cards (Total + per-reason), click-to-filter table, change-indicator arrows (↑/↓), service chip, bulk remove |
| `src/components/RedeclareTab.tsx` | Redeclare-tab view: editable data columns for committed units (simulates redeclarations); amber row highlight on override; Reset per-row and Reset all; Service (SR/QR) assign select |
| `src/components/MarginChart.tsx` | Recharts chart: solid EMX/EOL/EMI baseline for all SPs + partial draft overlays (dotted only where draft has actions) + gate-closure frontier + midnight marker; draft visibility controlled via `hiddenDraftIds` prop; dark-mode aware via MutationObserver |
| `src/components/ConfigPanel.tsx` | Floating config panel (3 tabs): **tweaks** (theme/layout/sidebar/selection), **scenarios** (ranking criteria), **data** (Real-time/Historical mode switch, date picker, start-time select, Load button) |
| `src/components/ConfirmModal.tsx` | Dark-mode-aware confirm dialog (replaces native browser confirm) |
| `src/models/types.ts` | All interfaces; `USERS`, `UserId`, `ServiceType`, `UnitSnapshot` |
| `src/services/elexon.ts` | All fetch logic + mock fallback |
| `src/store/useModellingStore.ts` | Zustand store |
| `src/utils/margin.ts` | `computeAggregates`, `applyDraftToBaseline`, `isUnitPnCommitted` |
| `src/utils/settlements.ts` | SP ↔ time helpers (UTC-based, see BST note above) |
| `src/utils/fuelTypes.ts` | `EXCLUDED_FUEL_TYPES` — shared by `elexon.ts` and `AvailableTable.tsx` |

---

## What Not to Change Without Reading First

- **Two separate fetch paths** — `fetchAllData()` (real-time, D-1 proxy) and `fetchHistoricalData()` (historical, all confirmed). Keep them independent. Do not merge them into a single function with a mode flag — that was an explicitly rejected design option.
- **`computeAggregates` iterates `sp.pn` directly** — never change it to iterate `units` instead. That would miss all PN-holding units outside the dispatchable filter (wind, solar, etc.) and break the baseline.
- **`refreshAggregates` in the store** — must be called whenever committed draft actions change. Currently called in `commitDraft`, `discardDraft`, `clearAllDrafts`, and `setSettlementPeriods`.
- **`settlementPeriod` in `SettlementPeriodData`** is the slot index 1–48, not the real SP number. All `ModellingAction.fromPeriod`/`toPeriod` comparisons use this slot index.
- **`src/utils/fuelTypes.ts`** — shared exclusion list. Keep in sync if adding/removing fuel types from the grid.
- **`fetchSinglePN` + 48 parallel calls** — do not collapse into a single date-range call; the Elexon PN endpoint requires per-SP queries. The `/datasets/PN` endpoint with only a date-range returns 404 — `settlementDate` + `settlementPeriod` are both mandatory.
- **`ownerId` on every draft** — `createDraft` and `duplicateDraft` both set `ownerId: state.currentUser`. Any new draft-creation path must do the same. Drafts without `ownerId` will be invisible to all users in the sidebar.
- **`dataSnapshot` is set at commit time** — `commitDraft` in the store reads `state.units` and `state.dataOverrides` to build the snapshot. If you add new tracked fields to `UnitSnapshot`, update both `commitDraft` and `ChangeArrow`'s render logic.
- **`dataOverrides` is separate from `unitServices`** — overrides are numeric value redeclarations for change-tracking; services are categorical assignments. Do not merge them.
- **`gspFilter` in `AvailableTable` is local component state** — intentionally not in Zustand. Do not lift it to the store or pass it as a prop. The `visible` memo depends on it; `gspFilter` must remain in its dependency array.
- **`hiddenDraftIds` in `page.tsx` is local state** — intentionally not in Zustand. It is purely a chart UI concern. Passed as a prop to `MarginChart` and (with `onToggleChartVisibility`) to `DraftSidebar`. Do not lift to the store.
- **Draft overlay partial rendering** — `MarginChart` only draws the dotted draft line for SPs where `draft.actions.some(a => a.fromPeriod <= slotIdx && a.toPeriod >= slotIdx)`. Adjacent SPs (one either side of the affected range) are included as bridge points at the baseline value so the line connects cleanly. Do not revert to rendering the full 48-SP dotted line.

---

## Draft Cost Calculation

Displayed in the draft header alongside Window / Duration / Units.

```
Cost = Σ max(0, MEL − PN) × £120   (per unique unit in the draft)
```

- **MEL** = `unit.registeredCapacity` (MELS API always empty, see above)
- **PN** = `unitPnByBmUnit[bmUnitId]` — see "PN / SEL fallback" below
- **Price** = £120/MWh static placeholder (no real price data available)

Formatted as `£1,234` (rounded, GB locale). Shows `—` when no units are in the draft. Computed in `page.tsx` as `activeDraftCost` and passed to `DraftDetails` as a prop.

The same formula is used in `CommittedTab` for the cost breakdown cards (`STATIC_PRICE = 120`).

## Committed Tab — Cost Breakdown Cards

A row of summary cards sits above the data table on the Committed tab:

- **Total** (blue) — cost, unit count, and total MEL across all committed units.
- **Margin / Inertia / Voltage / Reserve / Constraint** (colour-coded) — per-reason-code breakdown using the same cost formula.

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
| Event | `operationType` (AS / DS / AD etc.) |
| Reason | `reasonCode` (Margin / Inertia / Voltage / Reserve / Constraint) |

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

## GSP Group Filter (AvailableTable)

A "GSP ▾" button in the `AvailableTable` toolbar opens a floating popover listing all 14 GSP groups. Each zone has a 3-state segmented toggle: **+** (include), **·** (neutral), **−** (exclude). Multiple zones can be mixed — e.g. include `_F` + `_G`, exclude `_P`.

### Filter state

All state is **local to `AvailableTable`** — not in Zustand, not passed as props:

```ts
gspFilter: Record<string, 'include' | 'exclude'>  // absence = neutral
gspPopoverOpen: boolean
```

### Filter logic

Applied as an extra step in the `visible` useMemo, after the type-filter and search checks. `gspIncluded` and `gspExcluded` are hoisted outside the `.filter()` callback:

```ts
if (gspIncluded.length > 0 && !gspIncluded.includes(r.gspGroup)) return false
if (gspExcluded.includes(r.gspGroup)) return false
```

A unit passes if its `gspGroup` is in at least one included zone (when any inclusions are set) **and** not in any excluded zone. Both conditions apply simultaneously.

### GspFilterPopover subcomponent

Defined inline above `export default function AvailableTable`. Accepts `gspFilter`, `onChange`, `onClose`, and `wrapperRef` (a ref to the wrapper div containing both the button and the popover — used for click-outside detection to prevent the toggle button's `mousedown` from conflicting with the popover's `click`). Dismiss via click-outside (`document.mousedown`) or Escape.

### Data source

Zone list comes from `GSP_AREAS` in `src/config/scenarios.ts` (14 entries, same data used by the Voltage scenario area picker). Zone membership uses `unit.gspGroup`. Mock data in `src/services/elexon.ts` (`MOCK_GSP_GROUPS`) covers all 14 zones.

### Button badge states

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

### Reference markers
- **Gate closure** — amber `ReferenceLine` + shaded `ReferenceArea` for unconfirmed SPs; only shown in real-time mode (hidden when all SPs have `hasConfirmedPn`).
- **Midnight** — grey `ReferenceLine` where the settlement date rolls over; label `← midnight` rendered `insideTopLeft` to avoid clipping.

---

## Known Issues / Future Work

- **BST/UTC offset** — window starts ~1 hour early in summer. Low priority for prototype.
- **£120 static price** — real BM offer prices not yet integrated; cost figures are indicative only.
- **No test suite** — margin calculation logic is a good candidate for unit tests.
- **D-1 proxy + tomorrow slots** — tomorrow's SPs always have zero confirmed PN; they use yesterday's same-SP data as proxy. This is a reasonable heuristic but not operationally precise.
- **NDZ/MZT/MNZT blank — root cause found and fixed** — Two bugs: (1) `notice` field in the NDZ endpoint is in **minutes** not seconds; the code was dividing by 60 again, collapsing most values to 0. (2) Standing data is change-only — units only submit new entries when parameters change. CNQPS-2 last submitted NDZ 8–9 weeks ago, outside the old 35-day window. Both fixed: division removed, lookback extended to 84 days. Key format is confirmed consistent: `bmUnit: "T_CNQPS-2"` in dynamic param endpoints matches `elexonBmUnit: "T_CNQPS-2"` in reference data — key mismatch is **not** an issue.
- **Units silent >84 days still show `—`** — Units that haven't submitted standing data in over 3 months (e.g. mothballed plant) will still have no NDZ/MZT/MNZT. This is a data reality, not a code bug. No fix planned for prototype.
- **Rate limiting risk** — `fetchAllData` fires ~108 concurrent requests (48 current PN + 48 D-1 PN + 12 dynamic param windows). `fetchHistoricalData` fires ~108 (48 PN + 60 dynamic param windows). Failures are silently swallowed. If PN or dynamic params are unexpectedly blank, rate limiting is the likely cause.
- **Sharing is UI-only** — no backend; switching identity is how you simulate another user seeing a shared draft. Shared state does not persist between browser sessions or machines.
- **`Docs/overview.md` is stale** — describes the old single-date, single-action version. Should be rewritten if documentation is needed.
