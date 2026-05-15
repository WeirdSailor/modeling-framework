# Deficit Solver — Design Spec

**Date:** 2026-05-15
**Status:** Approved for planning

---

## Overview

Operators currently have to manually identify deficit periods on the chart and enter From/To times into the Workspace by hand. This feature closes that loop: the operator selects a time range directly on the chart, the system analyses the worst deficit in that range, and the Available table pre-ranks and pre-checks the minimum set of units needed to cover it. The operator reviews, adjusts, and hits the existing Select button — no new interaction patterns needed at that final step.

---

## User Journey

1. **Chart tab** — operator drags across the chart to select a time range (or uses 2-click / deficit-zone mode via Config tweak).
2. A **Solve bar** appears below the chart showing: From, To, Duration, Worst Deficit (MW). The Solve button lights up when there is a real deficit in the range.
3. Operator clicks **Solve ↗**. The app:
   - Switches to the Workspace tab
   - Pre-populates the active draft's **From** and **To** fields with the selected range
   - Populates a new **MW to solve** field with the worst deficit value
4. **Available table** enters **solve mode**: units are sorted by the active scenario's ranking criteria, and the minimum set that cumulatively covers the deficit MW is pre-checked.
5. Operator reviews — unticks unwanted units, ticks extras — then clicks the **existing Select button** (no change to that button or its behaviour).

---

## What Changes

### `MarginChart.tsx`

- Accept two new props:
  - `chartInteractionMode: 'drag' | 'twoClick' | 'deficit'` (default `'drag'`)
  - `onSolveSelect: (fromSp: number, toSp: number, worstDeficitMw: number) => void`
- Add interaction layer on top of the Recharts chart (transparent overlay div with mouse event listeners — Recharts does not natively support dragging).
- **Drag mode**: mousedown sets anchor, mousemove draws selection rectangle (indigo ReferenceArea), mouseup fires `onSolveSelect`.
- **2-click mode**: first click sets start pin (ReferenceLine), second click sets end pin and fires `onSolveSelect`, third click resets.
- **Deficit-zone mode**: on click, find which contiguous deficit range the clicked SP falls in; select the full range and fire `onSolveSelect`. Cursor changes to `pointer` over deficit areas.
- Selection is reset when the user changes tabs or loads new data.
- The **Solve bar** is rendered as a sibling element below the chart in `page.tsx`'s Chart tab layout, not inside `MarginChart`. This keeps `MarginChart` focused on rendering and makes the bar easy to access without threading extra state into the chart component.

### `DraftDetails.tsx`

- Add a new **MW to solve** field (read-only display, not editable) between the From/To row and the action buttons. Only visible when a solve target is active (i.e. `solveMw` prop is non-null).
- The field displays the worst deficit value (e.g. `−312 MW`) with a red deficit badge.
- From and To are pre-populated via the existing `onChangeFrom` / `onChangeTo` props called from `page.tsx` — no change to `DraftDetails` internal logic.

### `AvailableTable.tsx`

- Accept two new props:
  - `solveMode: boolean`
  - `solveMw: number | null` — the MW deficit magnitude to cover (positive number, e.g. `312`)
- When `solveMode` is true:
  - Apply scenario ranking sort (see Ranking Logic below) regardless of the user's current sort column.
  - Walk down the sorted list, accumulating `max(0, unit.registeredCapacity − pn)` until the running total ≥ `solveMw`. Pre-check all units up to and including the one that tips over the threshold.
  - Rows in the covering set: bright indigo highlight (`.top` style, already defined in the mockup).
  - Rows just beyond the covering set (next 2–3): dim indigo highlight (`.recommended`).
  - All other rows: normal appearance.
- When `solveMode` is false: table behaves exactly as today.
- The existing checkbox column, Select button, and `+` button are **unchanged**.

### `page.tsx`

- Add state:
  ```ts
  solveTarget: { fromSp: number; toSp: number; worstDeficitMw: number } | null
  ```
- `onSolveSelect` callback: sets `solveTarget`, switches active tab to `'workspace'`, calls `updateDraftWindow` on the active draft with the new from/to.
- Pass `solveTarget` down to `DraftDetails` (as `solveMw`) and `AvailableTable` (as `solveMode` / `solveMw`).
- Clear `solveTarget` when: data is refreshed, or user manually edits From/To in `DraftDetails` (signalling they have taken control). Switching drafts does not clear it — the new draft gets the same From/To pre-filled, which is useful when creating multiple drafts for the same event.

### `ConfigPanel.tsx` / `TweakState`

- Add `chartInteractionMode: 'drag' | 'twoClick' | 'deficit'` to `TweakState` (default `'drag'`).
- Add a segmented control in Config → Tweaks under the existing TR2 reserve % control.
- Pass `chartInteractionMode` down to `MarginChart`.

---

## Ranking Logic (Solve Mode Sort)

The existing `SCENARIOS` config in `src/config/scenarios.ts` already describes each scenario's ranking basis in prose. The sort functions need to be wired up. For the Margin scenario (primary use case for this feature):

```
Available MW = max(0, unit.registeredCapacity − pn)   descending
```

Other scenarios:
- **Inertia**: synchronous fuel types first (CCGT, OCGT, NPSHYD, PS), then `registeredCapacity` descending.
- **Reserve**: NDZ ascending, then Available MW descending.
- **Response**: PS/NPSHYD/OCGT first, then NDZ ascending, then Available MW descending.
- **Voltage**: units in `gspFilter` included zones first, then `registeredCapacity` descending within zone, then all others.
- **Pullback**: `max(0, pn − sel)` descending (headroom above SEL).
- **None**: existing table sort (no change).

The sort is computed once in a `useMemo` inside `AvailableTable` when `solveMode` is true. It does not replace the existing sort state — when `solveMode` is cleared the table returns to its previous sort.

---

## Solve Bar (below chart)

Displayed below the `MarginChart` on the Chart tab. Always visible (collapsed when no selection, expanded when range is selected).

| Field | Value |
|-------|-------|
| From | `HH:MM` of selected start SP |
| To | `HH:MM` of selected end SP |
| Duration | `N min` or `N.Nh` |
| Worst Deficit | `−NNN MW` (red) or `No deficit` (grey) |
| Solve button | Disabled (greyed) when no deficit; enabled (indigo) when deficit exists |

---

## What Does NOT Change

- `+` button per row in `AvailableTable` — unchanged.
- `Select` button in `AvailableTable` header — unchanged in appearance and behaviour.
- `DraftDetails` From/To selectors — populated by the same existing store actions, just called programmatically.
- All column layout, chip styles, tab structure, sidebar — unchanged.
- Committed, Redeclare, Graph tabs — unchanged.
- `refreshAggregates`, `computeAggregates`, fetch paths — unchanged.

---

## New Git Branch

All work on this feature is done on `feature/deficit-solver`, branched from `main`.

---

## Decisions

- **Solve bar placement**: sibling element in `page.tsx` Chart tab layout, not inside `MarginChart`.
- **MW to solve field**: read-only display. Operator cannot edit the MW value directly — they adjust the chart range to change it.
- **Pre-check logic**: greedy minimum covering set (top-ranked first). The last unit that tips the cumulative total over the threshold is included. No partial units.
- **Multiple deficit zones**: one solve target at a time. Operator repeats the flow for a second deficit if needed.
- **Interaction modes**: Drag is the default. 2-Click and Deficit-Zone are available as Config → Tweaks options to show different workflows.
- **Existing UI unchanged**: `+` button, Select button, column layout, all tab content outside Chart — no changes.
