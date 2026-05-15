# Balancing Areas Dashboard — Design Spec

**Date:** 2026-05-15  
**Branch:** to be created from `main`  
**Status:** Approved for implementation

---

## 1. Overview

Extend the existing GB electricity modelling tool with system-wide balancing awareness across 8 service areas. Operators currently model generation units to close margin deficits; this extension adds parallel visibility and solve capability for Reserve, Response, Inertia, and Voltage areas using the same workflow they already know.

The design is additive — no existing components are modified except to extend the Chart tab with a subtab row. All new views are designed to be self-contained so operators can open each on a dedicated monitor.

### Areas in scope

| Area | Unit | Notes |
|------|------|-------|
| Margin | MW | Existing — unchanged |
| Recovery Reserve | MW | New |
| Freq. Control Reserve | MW | New |
| General Reserve | MW | New |
| Contingency Reserve | MW | New |
| Response | MW | New |
| Inertia | GVAs | New |
| Voltage | MVAr | New — simplified reactive proxy |

**Out of scope for this phase:** Constraints (excluded — not consistent with the area model; to be designed separately).

---

## 2. Multi-Monitor Operating Context

Operators work across multiple monitors. Each view (Dashboard, individual area chart) is designed to run independently in its own browser window. The tab navigation in the prototype approximates this — in production, each area could be a separate URL. No view should require switching to another tab to complete a workflow.

---

## 3. New Tab: Dashboard

### 3.1 Placement

First tab in the app tab row, before Workspace:

```
Dashboard | Workspace | Chart | Committed | Redeclare | Requirements | BMU Summary
```

### 3.2 Toolbar

```
SYSTEM BALANCE DASHBOARD    [Next 2h] [Next 4h] [Next 8h] [Next 12h] [Next 24h]    [A | B]
```

- **Timeframe selector** — controls which settlement periods are evaluated (measured from current SP forward). Tile values show the worst position within the selected window. Default: Next 4h.
- **A/B view toggle** — switches tile information density. Default: A. Persisted in local state (not Zustand).

### 3.3 Tile Grid

8 tiles in a 3-column grid (3 + 3 + 2). Each tile represents one area.

**View A (default) — Status-first:**
```
[status word]          ← "Shortfall" / "Tight" / "OK"
[−400 MW]              ← largest element, colour-coded
[Area Name]
[Req: 1800  Avail: 1400]   ← small sub-row
[sparkline]
```

**View B — Numbers-first:**
```
[Area Name]
[Required | Available]     ← side-by-side boxes with value + unit
[SHORTFALL 400 MW]         ← summary badge, colour-coded
[sparkline]
```

**Colour coding:**
- Red border + red text: shortfall — availability < requirement
- Amber border + amber text: tight — availability ≥ requirement but surplus is < 10% of requirement (i.e. `(available − requirement) / requirement < 0.10`)
- Green border + green text: surplus — availability ≥ requirement + 10%

**Sparkline** (bottom of every tile, both views):
- Always shows the **full 48 SP window** regardless of the timeframe selector — the timeframe selector only affects the tile's headline metric (worst value), not the sparkline extent
- Dashed line = requirement across all 48 SPs
- Solid line = effective availability across all 48 SPs
- Shaded area = region where they diverge (red fill for deficit, green for surplus)
- Purpose: shows whether an issue is a brief dip or persistent across the window
- Height: ~28px SVG, no axes, no labels

**Tile click behaviour:** navigates to Chart tab and activates that area's subtab.

### 3.4 State ownership

```ts
// page.tsx local state
dashboardTimeframe: 2 | 4 | 8 | 12 | 24   // hours, default 4
dashboardView: 'A' | 'B'                   // default 'A'
```

---

## 4. Chart Tab — Area Subtabs

### 4.1 Subtab row

A second row of tabs beneath the app tab bar, visible only when on the Chart tab:

```
Margin · Recovery Reserve · Freq. Control Reserve · General Reserve ·
Contingency Reserve · Response · Inertia · Voltage
```

Each subtab carries a **status dot** (red / amber / green) derived from the same worst-position computation as the Dashboard tile. Active subtab underlined in its status colour.

### 4.2 Chart behaviour per area

Every area subtab renders identically to the existing Margin chart, using the same `MarginChart` component or a shared `AreaChart` abstraction:

| Element | Margin | All other areas |
|---------|--------|-----------------|
| Dashed reference line | TR2 (demand × 1+reservePct) | Requirement (from Requirements tab) |
| Solid primary line | EMX | Net Available (base + committed contributions) |
| Secondary lines | EOL, EMI | None for prototype |
| Shaded zones | Green surplus / red deficit vs TR2 | Green surplus / red deficit vs requirement |
| Y-axis label | MW | MW / GVAs / MVAr per area |
| Gate-closure frontier | Yes (real-time mode only) | No |
| Midnight marker | Yes | Yes |
| Draft overlay (dotted) | Yes — per active draft | Yes — shows projected availability change |

### 4.3 Drag-to-solve interaction

Identical to Margin: drag / 2-click / deficit-zone modes (controlled by existing `chartInteractionMode` tweak). Fires `onSolveSelect(fromSp, toSp, worstDeficitMw)` only if the selected range contains at least one SP where availability < requirement.

**On Solve:**
1. `solveTarget` is set (existing state in `page.tsx`)
2. App switches to Workspace tab
3. Active draft From/To is updated via `updateDraftWindow`
4. **Auto-scenario selection** — the scenario in DraftDetails auto-switches to the area's corresponding scenario:

| Area | Auto-scenario |
|------|--------------|
| Margin | margin |
| Recovery Reserve | reserve |
| Freq. Control Reserve | reserve |
| General Reserve | reserve |
| Contingency Reserve | reserve |
| Response | response |
| Inertia | inertia |
| Voltage | voltage |

5. `DraftDetails` receives `solveMw` and shows the red deficit badge (existing behaviour)
6. `AvailableTable` receives `solveMode=true` and `solveMw` (existing behaviour)

### 4.4 State ownership

```ts
// page.tsx local state — extended
activeAreaTab: AreaId   // which Chart subtab is active, default 'margin'
```

`solveTarget` is unchanged. No new Zustand state for chart interaction.

---

## 5. New Tab: Requirements

### 5.1 Placement

After Redeclare in the tab row:
```
Dashboard | Workspace | Chart | Committed | Redeclare | Requirements | BMU Summary
```

### 5.2 Layout

Same visual pattern as Redeclare tab.

**Toolbar:**
```
[Area chip selector: Margin | Recovery Reserve | Freq. Control | ... ]
                                    Fill all SPs: [Req ___] [Avail ___] [Apply]
```

**Table — 48 editable rows:**

| SP | Time | Requirement | Contracted | Constrained | Net Available | Gap |
|----|------|-------------|-----------|-------------|---------------|-----|
| 1 | 00:00 | `<input>` | `<input>` | `<input>` | computed | computed, colour-coded |
| 2 | 00:30 | … | … | … | … | … |

- **Net Available** = Contracted − Constrained (read-only, computed)
- **Gap** = Net Available − Requirement (read-only, colour-coded red/amber/green)
- All input fields are `<input type="number">`
- **Fill all SPs** shortcut: two inputs in the toolbar — one for Requirement, one for Contracted. Pressing Apply writes the entered values across all 48 rows for those columns. Constrained defaults to 0 on fill. Either field can be left blank to leave that column unchanged.

### 5.3 Data model

```ts
// Zustand store — new fields
areaRequirements: Record<AreaId, AreaRequirementRow[]>

interface AreaRequirementRow {
  sp: number           // 1–48 slot index
  requirement: number  // MW / GVAs / MVAr
  contracted: number   // base contracted availability
  constrained: number  // unusable portion (constrained off)
}
// netAvailable = contracted - constrained (derived)
// gap = netAvailable - requirement (derived)
```

Store actions: `setAreaRequirement(area, sp, field, value)`, `fillAreaRequirements(area, requirement?, contracted?)`.

### 5.4 Units per area

| Area | Unit label |
|------|-----------|
| Margin | MW |
| Recovery Reserve | MW |
| Freq. Control Reserve | MW |
| General Reserve | MW |
| Contingency Reserve | MW |
| Response | MW |
| Inertia | GVAs |
| Voltage | MVAr |

---

## 6. Cross-Area Availability Computation

### 6.1 Trigger

`refreshAreaAggregates()` is called after every draft commit, discard, and clear — same trigger points as existing `refreshAggregates`. It recomputes effective availability for all 8 areas across all 48 SPs.

### 6.2 Formula per area per SP

```
effectiveAvailability[area][sp] = netAvailable[area][sp] + Σ contribution(unit, area, sp)
```

Where `netAvailable` comes from the Requirements tab (contracted − constrained) and the sum is over all committed draft actions active in that SP.

**Contribution formulas (prototype — to be refined per area):**

| Area | Contribution per committed unit |
|------|--------------------------------|
| Margin | Uses existing `computeAggregates` — no change |
| Recovery Reserve | `max(0, mel − pn)` — available MW headroom |
| Freq. Control Reserve | `max(0, mel − pn)` |
| General Reserve | `max(0, mel − pn)` |
| Contingency Reserve | `max(0, mel − pn)` |
| Response | `max(0, mel − pn)` if fuelType in `{PS, NPSHYD, OCGT, CCGT}`, else 0 |
| Inertia | `registeredCapacity × 0.05` GVAs if synchronous (`{CCGT, NUCLEAR, NPSHYD, OCGT, PS}`), else 0 |
| Voltage | `registeredCapacity × 0.3` MVAr — simplified, no GSP localisation for prototype |

Each formula is isolated in its own function in `src/utils/areaAggregates.ts` so individual area models can be replaced independently.

### 6.3 Result storage

```ts
// SettlementPeriodData extended — new field
areaAvailability: Record<AreaId, number>   // effective availability per area after committed actions
```

The dashboard tiles and chart subtabs for the 7 non-Margin areas read from this field. `refreshAreaAggregates` writes to it via the existing `setSettlementPeriods` pattern.

**Margin is a special case:** the Dashboard Margin tile and Margin chart subtab continue to read from the existing `sp.emx`, `sp.eol`, `sp.emi`, and `sp.demand` fields computed by the existing `refreshAggregates`. The `areaAvailability['margin']` key is not written or read — Margin's data path is unchanged.

---

## 7. reasonCode Extension

`ModellingAction.reasonCode` extended to cover all 8 areas:

```ts
// Before
'MARGIN' | 'INERTIA' | 'VOLTAGE' | 'CONSTRAINT' | 'RESERVE'

// After
'MARGIN' | 'RECOVERY_RESERVE' | 'FREQ_CONTROL_RESERVE' | 'GENERAL_RESERVE' |
'CONTINGENCY_RESERVE' | 'RESPONSE' | 'INERTIA' | 'VOLTAGE'
```

- `'CONSTRAINT'` removed
- `'RESERVE'` replaced by the four specific reserve codes
- Committed tab cost breakdown cards updated to reflect new reason codes
- `OPERATION_TYPE_LABELS` and any other `reasonCode` switch statements updated

---

## 8. Files Affected / Created

**New files:**
- `src/components/Dashboard.tsx` — dashboard tab component
- `src/components/AreaChart.tsx` — shared chart component for non-Margin areas (wraps Recharts, same pattern as MarginChart)
- `src/components/RequirementsTab.tsx` — requirements editing tab
- `src/utils/areaAggregates.ts` — per-area contribution formulas + `refreshAreaAggregates`
- `src/config/areas.ts` — `AREAS` constant, `AreaId` type, area metadata (name, unit, default scenario, colour)

**Modified files:**
- `src/app/page.tsx` — new tabs, new local state (`dashboardTimeframe`, `dashboardView`, `activeAreaTab`), wire `refreshAreaAggregates`, pass `activeAreaTab` → auto-scenario on solve
- `src/models/types.ts` — extend `SettlementPeriodData` with `areaAvailability`, extend `ModellingAction.reasonCode`, add `AreaRequirementRow`
- `src/store/useModellingStore.ts` — add `areaRequirements`, `setAreaRequirement`, `fillAreaRequirements`; call `refreshAreaAggregates` at same trigger points as `refreshAggregates`
- `src/components/MarginChart.tsx` — extract subtab row (or accept `activeArea` prop); add area subtab status dots

**Unchanged:**
- `DraftSidebar`, `DraftDetails`, `AvailableTable`, `SelectedTable`, `CommittedTab`, `RedeclareTab`, `GraphTab`, `ConfigPanel`, `elexon.ts`, `standingDataSync.ts`, `settlements.ts`, `fuelTypes.ts`, `margin.ts`

---

## 9. What Not to Change

- `computeAggregates` and `refreshAggregates` — untouched; Margin area uses existing path
- `settlementPeriod` slot-index semantics — identical for all new areas
- `ModellingAction.toPeriod` open-ended (`undefined`) semantics — all area contribution loops must handle it
- `sp.mel[bmUnit] ?? pn` MEL fallback — used in contribution formulas where MEL is needed
- Two separate fetch paths (`fetchAllData` / `fetchHistoricalData`) — no changes
- `solveTarget` ownership in `page.tsx` local state — not lifted to Zustand

---

## 10. Out of Scope / Future Work

- **Real requirement data** — Requirements tab values are manually entered for prototyping. Real sources (BOA, STOR notices, system forecasts) to be integrated later.
- **Per-area contribution model refinement** — each area's contribution formula is a placeholder. Operator will develop accurate rules for each area independently.
- **Constraints area** — excluded from this phase; requires a different design pattern (circuit-level, not system-level).
- **GSP localisation for Voltage** — the prototype uses a national MVAr proxy. Real voltage support is area-specific and requires GSP-level filtering already present in the Voltage scenario.
- **Inertia H constant per unit** — using a flat 0.05 GVAs/MW proxy. Real values are unit-specific and available from Elexon dynamic parameters.
- **Response sub-classification** — Dynamic Containment, Dynamic Moderation, Dynamic Regulation treated uniformly for now.
- **Multi-window URL routing** — prototype uses tabs; production could use separate routes per area.
