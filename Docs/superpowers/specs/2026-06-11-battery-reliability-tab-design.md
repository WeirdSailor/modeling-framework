# Battery Reliability Tab — Design Spec

**Date:** 2026-06-11
**Status:** Approved for planning

---

## Overview

A new third tab in the Battery section, **"Reliability"** (`Summary | Redeclare | Reliability`), answers a different question from the Summary tab. Summary answers "what's available per unit right now." Reliability answers: **"Given a capacity requirement across the selected window, how much reliable battery capacity can the fleet contribute after stripping out constrained and contracted units and applying an operator confidence de-rate — and is any settlement period in the window short?"**

This version is **MW-based only** — no energy/state-of-charge modelling. The data layer is structured with a single seam (`computeBatteryAvailability`) so that future MDO/MDB-based "sustained MW = min(MEL, E÷W)" logic can be dropped in without touching the chart, table, or aggregation logic.

The hero element is a **per-settlement-period stacked bar chart** (not a single waterfall) — usable capacity changes across the window as units fall behind constraints/contracts, and the operator needs to see *which* SP is tight, not just an aggregate window verdict.

---

## State Changes

### Lifted to `page.tsx` (shared between Summary and Reliability)

To keep "constrained"/"contracted" classification and the selected window consistent across both tabs, three pieces of state move from `BatterySummaryTab`'s local `useState` to `page.tsx`:

```ts
gspFilter: Record<string, 'include' | 'exclude'>   // default {}
asFilter: { sr: boolean; qr: boolean }              // default { sr: false, qr: false }
batteryTfIndex: number                              // default 0 (Next 30 min)
```

`BatterySummaryTab` becomes a controlled component for these three — same defaults, same UI, **no behavioural change**. It receives them as props (value + setter) instead of owning `useState`.

### New, local to `BatteryReliabilityTab`

```ts
requirementMW: number   // default 0
deRatePct: number       // default 0 (0–100)
```

These are not meaningful on Summary, so they stay local. The "stay mounted" (`display: none` toggle) pattern already used for Summary/Redeclare extends to Reliability, so this local state survives tab switches.

---

## New Shared File: `src/components/BatteryFilters.tsx`

Extracts the `AsServicesPopover` component (currently private to `BatterySummaryTab.tsx`) and its filter type so both Summary and Reliability can render the AS Services filter button/popover from shared state:

```ts
export interface AsServicesFilter { sr: boolean; qr: boolean }
export function AsServicesPopover(props: {
  filter: AsServicesFilter
  onChange: (f: AsServicesFilter) => void
  onClose: () => void
  wrapperRef: React.RefObject<HTMLDivElement | null>
}): JSX.Element
```

Moved verbatim (no logic change) — mirrors the existing `GspFilterPopover` extraction precedent. `BatterySummaryTab.tsx` updates its import accordingly (one-line change + deletion of the now-duplicate inline definition).

---

## New Util: `src/utils/batteryAvailability.ts`

The single seam for future energy-aware logic:

```ts
export interface BatteryAvailabilityRow {
  bmUnitId: string
  nationalGridBmUnit: string
  gspGroup: string
  mel: number
  pn: number | undefined
  avail: number        // today: max(0, mel - worstPn) over the given window
  priceToMel: number
}

export function computeBatteryAvailability(
  units: BMUnit[],
  settlementPeriods: SettlementPeriodData[],
  spCount: number
): BatteryAvailabilityRow[]
```

Implementation is the existing `BatterySummaryTab.rows` useMemo body (lines 110-128), moved here unchanged: sort `settlementPeriods` by `settlementPeriod`, slice to `spCount`, compute `worstPn` via the existing `maxBatteryPn`, `mel = registeredCapacity ?? 0`, `avail = max(0, mel - (worstPn ?? 0))`.

`BatterySummaryTab` is refactored to call `computeBatteryAvailability(units, settlementPeriods, spCount)` instead of inlining the formula — identical output. This is the only behavioural-equivalence refactor to that file beyond the prop-lift above.

**Per-SP usage**: calling `computeBatteryAvailability(units, [singleSp], 1)` naturally yields that SP's `avail = max(0, mel - pn_sp)` — no special-casing needed. This is how the Reliability chart gets per-SP availability.

---

## New Util: `src/utils/batteryReliability.ts`

```ts
export interface ReliabilityRow extends BatteryAvailabilityRow {
  service: ServiceType | undefined
  constrained: boolean   // fails GSP filter (same logic as BatterySummaryTab.isConstrained)
  contracted: boolean    // !constrained && service matches a ticked AS filter
  included: boolean      // !constrained && !contracted
}

export interface ReliabilityTotals {
  total: number
  constrained: number
  contracted: number
  usable: number          // total - constrained - contracted (sum over included rows)
  reliable: number         // usable * (1 - deRatePct/100)
  margin: number           // reliable - requirementMW
}

export function computeBatteryReliability(
  rows: BatteryAvailabilityRow[],
  gspFilter: Record<string, 'include' | 'exclude'>,
  asFilter: { sr: boolean; qr: boolean },
  unitServices: Record<string, ServiceType>,
  deRatePct: number,
  requirementMW: number
): { rows: ReliabilityRow[]; totals: ReliabilityTotals }
```

Classification logic mirrors `BatterySummaryTab.classified` exactly (constrained → contracted → usable, mutually exclusive). `usable` is computed directly as the sum of `avail` over `included` rows (not by subtracting overlapping sums).

**Two call sites in the component:**
1. **Table**: `computeBatteryReliability(computeBatteryAvailability(units, windowSps, spCount), ...).rows` — one row per unit, window-level `avail`, exactly as originally scoped.
2. **Chart**: for each SP in the window, `computeBatteryReliability(computeBatteryAvailability(units, [sp], 1), ...).totals`. The component maps this into the chart's per-bar data shape:

```ts
interface ChartBar extends ReliabilityTotals {
  sp: number          // sp.settlementPeriod
  startTime: string   // sp.startTime — formatted HH:MM for the X axis
  deratedOff: number  // usable - reliable, precomputed for the stacked Bar's dataKey
}
```

`ChartBar[]` (one entry per SP in the window) is the chart's data prop. `ReliabilityTotals` itself stays SP-agnostic — the tagging happens in the component, not the util.

The function's signature/logic does not change between the two uses — only what `rows` it's fed and how many times it's called.

---

## New Component: `src/components/BatteryReliabilityTab.tsx`

Props:
```ts
interface Props {
  units: BMUnit[]
  settlementPeriods: SettlementPeriodData[]
  unitServices: Record<string, ServiceType>
  gspFilter: Record<string, 'include' | 'exclude'>
  onGspFilterChange: (f: Record<string, 'include' | 'exclude'>) => void
  asFilter: AsServicesFilter
  onAsFilterChange: (f: AsServicesFilter) => void
  tfIndex: number
  onTfIndexChange: (i: number) => void
}
```

### 1. Filter row

Visually identical to `BatterySummaryTab`'s filter row: GSP filter button + `GspFilterPopover`, AS Services button + (shared) `AsServicesPopover`, timeframe selector (`TIMEFRAME_OPTIONS`, same 4 options) — all driven by the props above (shared with Summary).

### 2. Inputs row

Two plain numeric inputs, below the filter row:
- **Requirement (MW)** — `<input type="number">`, default `0`, no upper bound.
- **De-rate (%)** — `<input type="number">`, range 0–100, default `0`.

### 3. Hero chart — per-SP stacked bar

Recharts `BarChart`, `ResponsiveContainer`, height ~280px. One bar per SP in the selected window (1–4 bars depending on `tfIndex`: 30min=1, 1h=2, 1.5h=3, 2h=4).

Stack order, bottom → top (each `<Bar dataKey=... stackId="a">`):

| Segment | dataKey | Value | Color |
|---|---|---|---|
| Reliable | `reliable` | `reliable` | `#22c55e` (solid) |
| De-rated off | `deratedOff` | `usable - reliable` | `#22c55e` @ 35% opacity |
| Contracted | `contracted` | `contracted` | `#8b5cf6` |
| Constrained | `constrained` | `constrained` | `#ef4444` |

Solid + faint green = `usable`. All four segments sum to `total`.

- X-axis: SP `startTime` formatted `HH:MM` (same `slice(11,16)` pattern used elsewhere).
- `ReferenceLine` at `y=requirementMW`, dashed amber (`#f59e0b`), full width, label "Requirement".
- Any bar whose `reliable` segment < `requirementMW` gets a 2px red (`#ef4444`) outline via `<Cell stroke=... strokeWidth={2}>` on its `reliable` segment.
- **Single-SP case** (Next 30 min, 1 bar): set `maxBarSize` (e.g. 80px) and appropriate `barCategoryGap`/chart padding so a lone bar renders centred and proportionate, not stretched full-width.

### 4. Headline (above or below chart)

Compute `worst = totals reduce by minimum reliable`. Display:

> `Worst SP (HH:MM): Reliable {worst.reliable} MW vs Requirement {requirementMW} MW → Surplus +N MW` (green) or `Shortfall −N MW` (red/amber)

Secondary line: window-average `reliable` across all SPs in the window.

### 5. Supporting table

Below the chart, demoted (smaller, not the visual focus). Same `.data-table` / `.table-scroll` / `.bmu-cell-inner` styling as other Battery tables. Columns:

| Column | Source |
|---|---|
| BMU | `nationalGridBmUnit` |
| Type | `<TypeChip />` (battery chip, same as Summary) |
| Service | `<ServiceChip service={row.service} />` |
| MEL | `row.mel` |
| Avail. | `row.avail` (window-level) |
| Constrained | `✓` / `—` |
| Contracted | `✓` / `—` |
| Included | `✓` / `✗` |

Sortable via clickable headers — small local `SortTh`-equivalent (self-contained in this file, not extracted/shared, mirroring but not reusing `AvailableTable`'s private `SortTh`).

Empty state (`units.length === 0`): same `.workspace-empty` "No battery units found" as Summary/Redeclare.

---

## `page.tsx` Wiring

- `BatteryTab` type: `'summary' | 'redeclare' | 'reliability'`.
- New tab button "Reliability" appended after "Redeclare" in the tab bar.
- New mounted-but-hidden panel (`display: activeBatteryTab === 'reliability' ? 'flex' : 'none'`), same pattern as the other two.
- New `page.tsx` state: `gspFilter`, `asFilter`, `batteryTfIndex` (lifted, defaults as above) — passed to both `BatterySummaryTab` (now controlled) and `BatteryReliabilityTab`.
- `BatteryReliabilityTab` receives `units={batteryUnits}`, `settlementPeriods`, `unitServices`, plus the lifted filter/window state + setters.

---

## What Does NOT Change

- `BatteryRedeclareTab.tsx` — untouched.
- `BatterySummaryTab.tsx` — only (a) its three filter/window `useState`s become props, (b) its inline `rows` calc calls `computeBatteryAvailability`, (c) its inline `AsServicesPopover` becomes an import from `BatteryFilters.tsx`. Visual output and behaviour identical.
- `GspFilterPopover.tsx` — untouched (imported as-is by the new tab too).
- Balancing section, Zustand store, margin/area calculations — untouched. No new Zustand state.
- No waterfall chart is built. (Possible future per-SP drill-down, out of scope now.)

---

## Decisions

- **Tab name**: "Reliability" (not "Margin") — avoids collision with the existing Balancing "Margin" area concept.
- **State location for requirement/de-rate**: local to the new tab, not Zustand — matches existing Battery-tab local-state pattern; survives tab switches via the existing stay-mounted mechanism.
- **Filter sharing**: GSP filter, AS Services filter, and the timeframe/window selector are lifted to `page.tsx` and shared between Summary and Reliability, so a unit's constrained/contracted status and the active window agree across both tabs. This is the one approved change to `BatterySummaryTab.tsx`'s state ownership (props instead of local `useState`, behaviour-preserving).
- **Hero chart**: per-SP stacked bar (Reliable / De-rated-off / Contracted / Constrained), not a single waterfall — restores the time dimension so the operator can see which SP is tight.
- **De-rate visualisation**: shown as a faint (35% opacity) green segment directly above the solid Reliable segment within each bar — no separate chart element needed.
- **Requirement line**: single horizontal `ReferenceLine`, full chart width (Recharts limitation/simplification — reads correctly regardless).
- **Calculation seam**: `computeBatteryAvailability(units, settlementPeriods, spCount)` is the one place future MDO/MDB energy logic (`min(MEL, E÷W)`) will be added; both the table and the per-SP chart consume its output (the latter via single-SP calls).
