# Deficit Solver — User Journey

**Feature:** Deficit Solver  
**Audience:** System operators, product stakeholders  
**Last updated:** 2026-05-15

---

## Background

Before this feature, closing a margin deficit required several manual steps: visually identify the deficit window on the chart, note the approximate settlement periods, switch to the Workspace tab, manually enter the From/To times into the active draft, then scroll through the Available table looking for suitable units.

The Deficit Solver collapses these steps. The operator selects a range directly on the chart, the app measures the worst deficit in that window, switches to the Workspace tab automatically, and pre-selects the minimum set of units needed to cover the gap. The operator reviews and confirms.

---

## Actors

**System Operator** — an individual operator logged in as one of the seven operator identities (ANSE, NSE, OSM, OEM, NBE, TSM, TSE). They have an active draft plan open and are looking at the 24-hour rolling margin window.

---

## Core Journey (Drag Mode)

This is the default interaction mode. No configuration needed.

### Step 1 — Spot the deficit on the Chart tab

The operator is on the **Chart** tab. The Margin Analysis chart shows the 48 settlement periods of the rolling 24-hour window. Green shaded areas show periods where EMX is above TR2 (the target reserve threshold). Red shaded areas show periods where committed capacity falls short.

The operator sees a block of red between approximately 16:00 and 20:00 — a 4-hour deficit period with the worst point sitting around −350 MW.

### Step 2 — Drag to select the deficit range

The cursor is a crosshair over the chart area. The operator:

1. Clicks and holds at the start of the deficit zone (around 16:00).
2. Drags right across the chart to the end of the deficit (around 20:00).
3. Releases the mouse.

While dragging, a translucent indigo band covers the selected range, giving immediate visual feedback of the selection.

### Step 3 — The Solve bar appears

As soon as the mouse is released, a **Solve bar** appears directly below the chart:

| Field | Example value |
|-------|---------------|
| From | 16:00 |
| To | 20:00 |
| Duration | 4h |
| Worst Deficit | −347 MW |
| Solve button | **Solve ↗** (enabled, indigo) |

If the selected range contains no deficit (all periods are green), the Worst Deficit field shows "No deficit" in grey and the Solve button is disabled.

### Step 4 — Click Solve ↗

The operator clicks the **Solve ↗** button. Three things happen simultaneously:

1. The app switches to the **Workspace** tab.
2. The active draft's **From** and **To** fields are pre-populated with 16:00 and 20:00.
3. A red **−347 MW deficit** badge appears in the draft header area, below the From/To row.

If there is no active draft, the operator creates one first (New Draft button in the sidebar), then repeats the selection.

### Step 5 — Review the pre-checked units

The Available table is now in **solve mode**. The table has:

- Sorted units by the active scenario's ranking criteria (for the default Margin scenario: largest available MW first).
- Pre-checked (highlighted in indigo) the minimum greedy set of units whose cumulative available capacity (MEL − PN) is enough to cover the 347 MW deficit. The last unit that tips the running total past 347 MW is included.

The operator scans the highlighted rows. Each row shows the unit's BMU ID, fuel type, NDZ (start-up notice), MEL, PN, and the service it has been assigned.

### Step 6 — Adjust the selection if needed

The operator may:

- **Uncheck a unit** they don't want (e.g. a CCGT with a long NDZ that can't start in time) — the indigo highlight clears but the covering set logic does not force it back.
- **Check additional units** they do want (e.g. a pumped-storage unit they prefer for reserve reasons).
- Change the **Scenario** in the DraftDetails time-pickers row to re-rank the table (e.g. switch from Margin to Reserve to see units ranked by NDZ ascending).

### Step 7 — Select

The operator clicks the existing **Select** button in the table header (visible whenever rows are checked). The checked units are added to the draft's Selected tab. No new interaction patterns — this is the same button that has always existed.

### Step 8 — Commit or iterate

The operator can:

- Review the Selected tab to confirm the units and their per-unit From/To windows.
- Switch back to the Chart tab to see the draft overlay (dotted line) showing the projected improvement to EMX.
- Adjust, add more units, or commit the draft to absorb it into the baseline.

---

## Variation: No Active Deficit in the Selected Range

If the operator drags across a fully green section of the chart (margin is positive throughout), the Solve bar shows:

- **Worst Deficit:** No deficit (grey text)
- **Solve button:** disabled (greyed out)

The operator can extend the drag selection to include a red zone, or click elsewhere on the chart to reset the selection and try again.

---

## Variation: Dragging to Adjust the Window

After solving once, the operator may want to widen or narrow the window. They can:

1. Drag a new selection on the chart (the old selection and Solve bar update immediately).
2. Click Solve ↗ again — the draft's From/To fields update to the new range, and the covering set recalculates.

Manually editing the From or To picker in DraftDetails clears the solve target (the red MW badge disappears), signalling that the operator has taken manual control of the window.

---

## Scenario: Reserve Event (Config → Tweaks → Deficit Zone mode)

The operator switches the Chart interaction mode to **Deficit Zone** (Config ⚙ → Tweaks → Chart interaction).

In this mode the cursor changes to a pointer when hovering over a red deficit zone. The operator:

1. Clicks anywhere inside a deficit zone.
2. The app automatically selects the full contiguous deficit range — no dragging needed.
3. The Solve bar appears exactly as in the drag flow.

This is faster when there is a single clearly-defined deficit period and the operator doesn't want to be precise about the exact From/To boundary.

The operator then changes the **Scenario** to **Reserve** in the DraftDetails row. The Available table re-ranks units by NDZ ascending (fastest to start first), then by available MW descending within ties. The covering set updates to use this ranked order.

---

## Scenario: Coordinating a Second Deficit Zone

The 24-hour window has two deficit periods — one in the afternoon and one late at night. The operator solves them separately.

**First deficit:**

1. Drag across the afternoon zone → Solve ↗ → Draft A covers it → Commit Draft A.

**Second deficit:**

1. Create a new draft (Draft B).
2. Drag across the late-night zone → Solve ↗.
3. Draft B's From/To is now set to the overnight window. The Available table shows the covering set for this window.
4. Select and commit Draft B.

Because each committed draft is absorbed into the EMX baseline, Draft B's covering set calculation sees the improved baseline (including Draft A's committed units) and correctly computes only the residual gap.

---

## Scenario: 2-Click Mode

The operator prefers precise SP-level control. They switch to **2-Click** mode (Config ⚙ → Tweaks → Chart interaction).

1. **First click** — sets the start SP. An amber dashed vertical line appears at that point labelled "① start".
2. **Second click** — sets the end SP. The selection band fills in and the Solve bar appears.
3. **Third click** — resets the selection (or start a new one).

This avoids any imprecision from hand-drag timing and works well on touch-sensitive devices or with a trackpad.

---

## Scenario: Shared Draft Solve Flow

Operator NSE has created a draft covering a deficit and shared it with operator OSM for review. OSM cannot edit NSE's draft (read-only view in the "Shared with me" sidebar section), but can duplicate it.

OSM's workflow:

1. Duplicate NSE's draft ("Duplicate to my drafts") — creates a personal copy.
2. Switch to the Chart tab.
3. The chart already shows the duplicated draft's overlay. OSM sees the dotted EMX line from NSE's selections.
4. If there is a residual deficit, OSM drags across the remaining gap → Solve ↗ → adds extra units to the duplicate draft.
5. OSM commits the enhanced draft under their own identity.

---

## Edge Cases

| Situation | Behaviour |
|-----------|-----------|
| No active draft when Solve ↗ is clicked | The From/To update is skipped (no draft to update); the app still switches to Workspace tab |
| Selected range spans only one SP | A single-SP solve target is valid; the Solve bar shows a 30-minute duration |
| Worst deficit is exactly 0 MW | Treated as no deficit; Solve button disabled |
| All units in the covering set are already in the draft | Pre-check shows no new units highlighted; operator adds manually |
| Data is refreshed while a solve target is active | `solveTarget` is cleared; Solve bar disappears; operator must re-select on the chart |

---

## What the Deficit Solver Does Not Do

- **It does not commit units automatically.** The operator always confirms via the Select button and then the Commit action.
- **It does not calculate BM offer prices.** The "Est. value" column uses a static £120/MWh placeholder.
- **It does not account for NDZ or start-up timing.** The covering set is purely a capacity calculation — whether a unit can realistically start within the deficit window is the operator's judgement.
- **It does not handle multiple simultaneous solve targets.** Only one solve target is active at a time. For two separate deficit zones, repeat the flow.
