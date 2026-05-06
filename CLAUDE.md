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
isLoading: boolean
error: string | null
```

`refreshAggregates` is called inside the store on every draft commit/discard/clear. It recomputes EMX/EOL/EMI/Margin for each SP using committed draft actions. It does `{ ...sp, ...computeAggregates(...) }` — the spread preserves `hasConfirmedPn`, `proxyEmx`, `proxyEol` without any special handling.

### Rolling 24-Hour Window

`fetchAllData()` in `src/services/elexon.ts` builds 48 slots starting from the current UTC SP of today, wrapping into tomorrow. `settlementPeriod` in `SettlementPeriodData` is the **slot index 1–48 within the window** (not the real SP within the settlement day). The real SP is stored only in the `slotPlan` during fetch.

### Draft Plans System

Operators create independent draft plans. Each draft is a colour-coded group of `ModellingAction`s. Drafts can be overlaid simultaneously on the margin chart as dotted lines. Committing a draft absorbs it into the solid baseline and triggers `refreshAggregates`. The `DraftPanel` component manages draft lifecycle (create, commit, discard).

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
Fetched across 5×7-day windows (35 days total) to capture units that haven't been active recently. NDZ is returned in seconds by the API — converted to minutes on ingest.

---

## Component Map

| File | Role |
|------|------|
| `src/app/page.tsx` | Top-level: data loading, layout, tab switching, derived data, confirm modals |
| `src/components/DraftSidebar.tsx` | Brand mark, window time + Refresh, draft list with collapsible Archive section |
| `src/components/DraftDetails.tsx` | Draft header: name, state badge, meta row (window/duration/units/cost), From/To SP pickers, action buttons |
| `src/components/AvailableTable.tsx` | Available units table: search/filter/sort, checkbox or click selection, type chips |
| `src/components/SelectedTable.tsx` | Selected units in active draft: Σ PN / Σ MEL / Est. value totals, notes input, remove button |
| `src/components/CommittedTab.tsx` | Committed-tab view: all units across committed drafts, bulk remove |
| `src/components/MarginChart.tsx` | Recharts chart: confirmed baseline + draft overlays + D-1 proxy + gate-closure frontier; dark-mode aware via MutationObserver |
| `src/components/TweaksPanel.tsx` | Floating tweaks panel: theme, layout, sidebar toggle, selection mode |
| `src/components/ConfirmModal.tsx` | Dark-mode-aware confirm dialog (replaces native browser confirm) |
| `src/models/types.ts` | All interfaces |
| `src/services/elexon.ts` | All fetch logic + mock fallback |
| `src/store/useModellingStore.ts` | Zustand store |
| `src/utils/margin.ts` | `computeAggregates`, `applyDraftToBaseline`, `isUnitPnCommitted` |
| `src/utils/settlements.ts` | SP ↔ time helpers (UTC-based, see BST note above) |
| `src/utils/fuelTypes.ts` | `EXCLUDED_FUEL_TYPES` — shared by `elexon.ts` and `AvailableTable.tsx` |

---

## What Not to Change Without Reading First

- **`computeAggregates` iterates `sp.pn` directly** — never change it to iterate `units` instead. That would miss all PN-holding units outside the dispatchable filter (wind, solar, etc.) and break the baseline.
- **`refreshAggregates` in the store** — must be called whenever committed draft actions change. Currently called in `commitDraft`, `discardDraft`, `clearAllDrafts`, and `setSettlementPeriods`.
- **`settlementPeriod` in `SettlementPeriodData`** is the slot index 1–48, not the real SP number. All `ModellingAction.fromPeriod`/`toPeriod` comparisons use this slot index.
- **`src/utils/fuelTypes.ts`** — shared exclusion list. Keep in sync if adding/removing fuel types from the grid.
- **`fetchSinglePN` + 48 parallel calls** — do not collapse into a single date-range call; the Elexon PN endpoint requires per-SP queries. The `/datasets/PN` endpoint with only a date-range returns 404 — `settlementDate` + `settlementPeriod` are both mandatory.

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

## PN / SEL Fallback in `unitPnByBmUnit`

`unitPnByBmUnit` (computed in `page.tsx`) is the per-unit PN used by both tables (AvailableTable, SelectedTable, CommittedTab) and the Cost calculation. Build order:

1. **Real PN** — from confirmed settlement period slots (`sp.pn[bmUnitId]`)
2. **D-1 PN** — for unconfirmed slots, `sp.pn` is backfilled from yesterday's same-SP data in `fetchAllData`; the max over all 48 slots therefore includes any prior-day output
3. **SEL fallback** — if max PN across all 48 slots is still 0, fall back to `unit.sel` (Stable Export Limit). This covers cold units that are not in Elexon's PN data at all (i.e., haven't been dispatched recently and don't appear in any SP's response).

Units with no PN, no D-1 data, and no SEL show `—`. This is the honest answer for mothballed / inactive units.

**Do not remove the SEL fallback** — cold CCGTs like BAGE-1 genuinely don't appear in the Elexon PN dataset and would otherwise show blank PN and a misleading Cost of MEL × £120.

---

## Known Issues / Future Work

- **BST/UTC offset** — window starts ~1 hour early in summer. Low priority for prototype.
- **£120 static price** — real BM offer prices not yet integrated; cost figures are indicative only.
- **No test suite** — margin calculation logic is a good candidate for unit tests.
- **D-1 proxy + tomorrow slots** — tomorrow's SPs always have zero confirmed PN; they use yesterday's same-SP data as proxy. This is a reasonable heuristic but not operationally precise.
- **PN / SEL columns still blank in practice** — The SEL fallback (`unit.sel ?? 0`) and D-1 PN backfill are implemented but field testing shows values are not rendering in the table. Root cause not yet isolated — candidates: (a) SEL data not being fetched/parsed correctly for these units, (b) rate limiting killing the D-1 PN fetch silently, (c) key mismatch between `bmUnitId` and what the dynamic-param endpoints return. Needs a focused debug session with browser dev tools open to inspect the store state.
- **Rate limiting risk** — `fetchAllData` fires ~130 concurrent requests to the Elexon API (48 current PN + 48 D-1 PN + dynamic params). Failures are silently swallowed. If D-1 PN is unexpectedly blank, rate limiting is the likely cause.
- **`Docs/overview.md` is stale** — describes the old single-date, single-action version. Should be rewritten if documentation is needed.
