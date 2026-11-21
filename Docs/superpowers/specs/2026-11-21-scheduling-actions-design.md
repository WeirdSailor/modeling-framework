# Scheduling Actions — Design

**Date:** 2026-11-21
**Status:** Approved in brainstorming, awaiting spec review
**Scope:** Balancing section. Prototype: journey and UI matter more than accurate data.

## 1. Summary

Today the only thing an operator can do is pick units that are not running, put them in a draft and promote the draft. That covers a single scheduling action: **start a unit**.

This design adds **action types**. An operator picks a window, finds candidate units (list → filter → sort → select), chooses what to do with them, adjusts each unit's start and end time in a summary, and commits. The four action types are:

| Type | In words |
|---|---|
| **Start** | Synchronise a unit that is off (today's behaviour) |
| **Deload to SEL** | Reduce a running unit's output to its SEL |
| **Desync** | Reduce a running unit to zero |
| **Model capacity** | Raise a running unit's MEL from its declared level to its registered capacity |

The new journey lives in a new **Schedule** tab. Workspace and drafts are not changed. A committed working plan is saved as a promoted draft, so everything downstream (baseline, Promoted, Redeclare, dashboards) keeps working.

Three versions of the candidate picker are built (A, B, C). **Config → Tweaks** chooses which one is shown. Only one is active at a time, so testers can compare them.

## 2. Decisions

| # | Decision | Choice |
|---|---|---|
| D1 | Action types in v1 | Start, Deload to SEL, Desync, Model capacity |
| D2 | Order of choosing type vs units | Build all three pickers (A type first, B units first, C type tabs + basket). One active at a time, set in Config → Tweaks, default **C** |
| D3 | Where actions go | One **working plan** per operator (dotted lines), then **Commit** |
| D4 | Baseline MEL | Real declared MEL via the MELS `/stream` endpoint, registered capacity as fallback. Minimal effort, no data cleaning beyond "latest notification wins" |
| D5 | Ranking | Reuse the existing scenario ranking (`scenarioScore` in `AvailableTable`) for every type, plus column-header sort |
| D6 | Solve ↗ destination | Config switch: Workspace or Schedule. Default **Schedule** |
| D7 | Where the journey lives | New **Schedule** tab in Balancing. Workspace and drafts untouched |

## 3. Out of scope

- Amending or withdrawing commitments
- Several named working plans (drafts) — see §10 for how they plug in later
- More than one action per unit in a working plan
- Any change to the Workspace tab, the draft sidebar or the draft lifecycle
- Better ranking per action type
- BST/UTC settlement period offset
- Battery units (still excluded from Balancing candidate lists)
- Dashboard (tab 1) tiles: they do not draw drafts today and will not draw the working plan

## 4. Data model

### 4.1 Action type

In `src/models/types.ts`:

```ts
export type ActionType = 'start' | 'deload' | 'desync' | 'capacity'

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  start: 'Start', deload: 'Deload to SEL', desync: 'Desync', capacity: 'Model capacity',
}

export interface ModellingAction {
  // …existing fields unchanged…
  actionType?: ActionType   // undefined = 'start' (all existing drafts)
}
```

`outputLevel` stays required. It is only meaningful for Start. Other types store `0` and the calculation ignores it.

Add `const actionTypeOf = (a: ModellingAction) => a.actionType ?? 'start'` in `src/utils/actionEffects.ts` and use it everywhere instead of reading the field directly.

### 4.2 Working plan

In the Zustand store:

```ts
type WorkingPlanAction = ModellingAction & { note?: string }
workingPlans: Partial<Record<UserId, WorkingPlanAction[]>>
workingPlanWindow: { fromPeriod: number; toPeriod: number }   // Schedule tab window, shared
```

- One plan per operator, keyed by `currentUser`. Switching identity shows that operator's plan.
- In memory only (lost on reload), like drafts.
- A unit appears **at most once** per plan. Adding a unit that is already in the plan does nothing.

Store actions:

| Action | Behaviour |
|---|---|
| `addToWorkingPlan(units: {bmUnitId, actionType}[])` | Adds one action per unit not already in the plan. Window = `workingPlanWindow`. Start output = declared MEL for the window's first slot (`sp.mel[u]`), else `registeredCapacity`. Reason = the reason for the current scenario (`SCENARIO_REASON`, as today) |
| `updateWorkingPlanAction(bmUnitId, patch)` | Edits from, to, output, reason, event type or note |
| `setWorkingPlanWindowForAll(from, to)` | "Set all From/To…" |
| `removeFromWorkingPlan(bmUnitId)` / `clearWorkingPlan()` | — |
| `setWorkingPlanWindow(from, to)` | Changes the Schedule tab window. Does not touch existing actions |
| `commitWorkingPlan(name, description)` | Creates a `DraftPlan` (owner = current user, next colour, actions = the plan) and runs the existing `promoteDraft` on it, which snapshots unit data and calls `refreshAllAggregates`. Then clears the plan |

Notes: drafts keep notes in `DraftPlan.unitNotes`, not on the action. The working plan keeps the note on its own row type (`WorkingPlanAction.note`). Commit copies each note into the new draft's `unitNotes` and strips `note` from the actions.

## 5. Which units each type applies to

`src/utils/actionEffects.ts` exports `isCandidate(type, unit, sp)`. `sp` is the window's first slot.

| Type | Unit qualifies when |
|---|---|
| Start | `pn ≤ 1` (off) |
| Deload to SEL | `pn > 1` and `sel` known and `pn > sel` |
| Desync | `pn > 1` |
| Model capacity | `pn > 1` and `registeredCapacity > (sp.mel[u] ?? registeredCapacity)` |

Every candidate list also excludes:
- units already in any promoted draft (one commitment per unit),
- units in `EXCLUDED_FUEL_TYPES` (as `AvailableTable` today, including BATTERY),
- units failing the GSP filter.

The calculation (§6) checks the same conditions again per slot and does nothing where a unit no longer qualifies. A unit can therefore never give a negative or doubled effect.

## 6. Calculation

All effects are computed **per covered slot** as a change from the baseline. A slot is covered when `fromPeriod ≤ slot` and (`toPeriod` undefined or `toPeriod ≥ slot`).

Per-slot values for unit `u`:
- `pn = sp.pn[u] ?? 0`
- `mel = sp.mel[u] ?? pn` (same fallback as `computeAggregates`)
- `sel = unit.sel ?? sp.mil[u] ?? 0` (same as today's EMI)
- `reg = unit.registeredCapacity`

### 6.1 Margin aggregates (EMX / EOL / EMI)

| Type | Applies in slot when | ΔEMX | ΔEOL | ΔEMI |
|---|---|---|---|---|
| Start | `pn ≤ 1` | `+(sp.mel[u] ?? 0)` | `+outputLevel` | `+sel` |
| Deload | `pn > sel` | 0 | `−(pn − sel)` | 0 |
| Desync | `pn > 1` | `−mel` | `−pn` | `−sel` |
| Capacity | `reg > mel` | `+(reg − mel)` | 0 | 0 |

Start is exactly today's rule. The change: the "skip if already PN-committed" rule in `computeAggregates` and the `alreadyModelled` skip in `applyDraftToBaseline` now apply **to Start actions only**. Other types act on running units by definition.

### 6.2 Non-margin areas

Today area availability = `max(0, contracted − constrained) + Σ unitAreaContribution(promoted units)`. Running units in the baseline are not counted. Keep that, and add per-type changes:

| Type | Reserve areas (4) and Response¹ | Inertia² | Voltage |
|---|---|---|---|
| Start | `unitAreaContribution` (unchanged) | unchanged | unchanged |
| Deload | `+(pn − sel)` | 0 | 0 |
| Desync | `−max(0, mel − pn)` | `−reg × 0.05` | `−reg × 0.3` |
| Capacity | `+(reg − mel)` | 0 | 0 |

¹ Response only for `RESPONSE_FUEL_TYPES`, as today. ² Inertia only for `SYNCHRONOUS_FUEL_TYPES`, as today.

Clamp each area's availability to `≥ 0` after summing. This is a prototype approximation: a desync subtracts from an availability figure that never included the unit. Acceptable because data accuracy is not a goal (see §2).

### 6.3 Where the code changes

One new module, `src/utils/actionEffects.ts`, with:
- `actionTypeOf(action)`
- `isCandidate(type, unit, sp)`
- `marginDelta(action, sp, unit)` → `{ emx, eol, emi }` (returns zeros where the action doesn't apply in this slot)
- `areaDelta(action, area, sp, unit)` → number, for Deload, Desync and Capacity. Start keeps using `unitAreaContribution` in `areaAggregates.ts`, which calls `areaDelta` for the other types.

`actionEffects.ts` must have **no value imports** (type-only imports are fine), so the `node --test` runner can load it (§11). It therefore defines its own copies of the response and synchronous fuel-type sets, with a comment pointing at the originals in `areaAggregates.ts`. Same precedent as `NON_MARGIN_AREA_IDS`.

`computeAggregates`, `applyDraftToBaseline` (`margin.ts`) and `computeAreaAvailabilities`, `applyDraftToAreaBaseline` (`areaAggregates.ts`) call these instead of their inline Start-only logic. Their signatures do not change, so callers (charts, store, Dashboard 2 adapters) are untouched. With only Start actions, results must equal today's results exactly (see §11).

## 7. Data fix: declared MEL

`fetchMELS` in `src/services/elexon.ts` currently calls `/datasets/MELS?from=<day>&to=<day>`. That endpoint rejects ranges over 1 hour (HTTP 400), so the app has always used mock MELS = registered capacity.

Change: call `/datasets/MELS/stream?from=<dayStartISO>&to=<dayEndISO>` (returns a bare array). For each `(settlementPeriod, bmUnit)` keep the entry with the highest `notificationSequence`. Value = `(levelFrom + levelTo) / 2`, as today. Units with no entry keep the registered-capacity fallback. Do not attempt any further cleaning.

Side effect: baseline EMX and margin across the app move to declared MELs (probably lower). Update `CLAUDE.md` to remove "MELS always returns empty" and describe the stream endpoint.

The same fix applies to `fetchHistoricalData` (it uses `fetchMELS`). `MILS` has the same bug but is out of scope.

## 8. UI

### 8.1 Schedule tab

New tab **Schedule** in the Balancing tab bar, after Workspace. Component: `src/components/schedule/ScheduleTab.tsx`. Layout, top to bottom:

1. **Window and filter bar:** From / To slot selects (`DD|HH:MM`, as in `DraftDetails`), Scenario and GSP buttons (reuse `ScenarioPopover` and `GspFilterPopover`; scenario and GSP filter state stay the existing `page.tsx` state), and a **Show on charts** toggle.
2. **Candidate picker** — A, B or C (§8.2).
3. **Working plan summary** (§8.3).

### 8.2 Pickers

All three use one hook, `useScheduleCandidates(type | 'all')`, which returns rows for the window's first slot. Each row has the unit, `pn`, `mel`, `sel`, `reg`, the "change" figure for each type, and the set of types the unit qualifies for. Rows are ranked by the existing `scenarioScore`, then column-header sort. `scenarioScore` moves out of `AvailableTable.tsx` into `src/utils/scenarioRanking.ts` (exported, behaviour unchanged) so both use it.

Columns shared by all pickers: checkbox, BMU (+ GSP sub-label), Type chip, NDZ, SEL, PN, MEL, Reg. cap, £ SEL, £ MEL. Type-specific "change" column:

| Type | Column | Value |
|---|---|---|
| Start | +MW | `mel` |
| Deload | −MW | `pn − sel` |
| Desync | −MW | `pn` |
| Capacity | +MW | `reg − mel` |

**Picker A — type first** (`PickerTypeFirst.tsx`)
- An "Action ▾" select (default Start) above the list.
- The list shows only candidates for that type, with that type's change column.
- **Add N as \<type\>** adds the ticked units. Changing type clears ticks.

**Picker B — units first** (`PickerUnitsFirst.tsx`)
- The list shows every unit that qualifies for at least one type, with a State column (Running / Off) and no change column.
- **Action ▾** menu lists the four types. Each shows how many ticked units it applies to, e.g. "Deload to SEL (2 of 3)". A type that applies to none is disabled.
- Choosing a type adds the qualifying ticked units. An inline notice names the skipped ones ("DRAXX-1 is off — skipped").

**Picker C — type tabs and basket** (`PickerTabs.tsx`)
- Tabs: Start (n) · Deload to SEL (n) · Desync (n) · Model capacity (n), with candidate counts.
- Each tab lists that type's candidates with its change column.
- Ticks are kept per tab in a basket until added. A unit ticked on one tab, or already in the plan, is greyed out on the other tabs with "in basket as …" / "in plan as …".
- **Add basket to plan (N)** adds everything and empties the basket.

In every picker, units already in the working plan are greyed out and cannot be ticked.

### 8.3 Working plan summary

Component: `WorkingPlanSummary.tsx`.

- **Header:** action count, a total MW chip per type (Start +x, Deload −y, Desync −z, Capacity +w, from the change figures), and "worst margin in window: before → after". After = the minimum over the window of `EMX − TR2` with the plan applied via `applyDraftToBaseline`.
- **Buttons:** Set all From/To…, Clear, **Commit…** (disabled when empty).
- **Table, one row per action:** BMU | Action chip | Change ("off → 600 MW", "420 → SEL 180 MW", "380 → 0 MW", "MEL 431 → 501 MW") | From | To (with "—" = open-ended) | Output (editable for Start only, otherwise shown dimmed as "SEL", "0" or "—") | Reason | Event (`OPERATION_TYPE_LABELS`) | Note | ✕.
- **Commit…** opens a modal (same style as `ConfirmModal`) with Name (required) and Description. Confirm calls `commitWorkingPlan`.

Chips: Start green, Deload amber, Desync red, Capacity blue. Light and dark variants go in `globals.css` next to the SR/QR chips.

### 8.4 Charts and Dashboard 2

The working plan is drawn as a dotted overlay, the same way as a not-yet-promoted draft:

- `workingPlanAsDraft(actions, user)` returns a `DraftPlan`-shaped object (`id: 'wp:<user>'`, `name: 'Working plan'`, `status: 'draft'`, fixed colour `#22c55e`, the plan's actions). It is never stored in `drafts`.
- `page.tsx` passes `[...drafts, wpDraft]` to `MarginChart` and `AreaChart`.
- Dashboard 2 reads drafts from the store inside its real adapters. Additive change: the adapter context also takes the current user's working plan and appends `workingPlanAsDraft(...)` to its overlay list. The Dashboard 2 legend then lists "Working plan" like any draft.
- **Show on charts** adds or removes `wp:<user>` in the existing `hiddenDraftIds` set (page state), which all three consumers already honour.

### 8.5 Config

`TweakState` gains:

```ts
schedulePicker: 'typeFirst' | 'unitsFirst' | 'tabs'   // default 'tabs' (C)
solveDestination: 'workspace' | 'schedule'            // default 'schedule'
```

Config → Tweaks gets two `SegControl`s: "Scheduling picker: A · B · C" and "Solve ↗ goes to: Workspace · Schedule".

### 8.6 Solve ↗

`handleSolveNavigate` in `page.tsx` keeps setting the scenario from the area. Then:
- `workspace`: today's behaviour (update the active draft window, go to Workspace).
- `schedule`: `setWorkingPlanWindow(fromSp, toSp)`, go to the Schedule tab. The deficit badge (`solveMw`) shows next to the window bar. `solveTarget` clearing rules stay as they are, plus clearing when the Schedule window is edited by hand.

`AvailableTable`'s covering-set highlight is not reproduced in the new pickers (out of scope).

## 9. Errors and edge cases

| Case | Behaviour |
|---|---|
| No settlement periods loaded | Schedule tab shows "Loading system data…" |
| No candidates for a type | Empty list text "No units qualify for \<type\> at \<time\>" |
| Window changed after actions were added | Existing actions keep their own windows. Candidate lists recompute for the new first slot |
| Action no longer qualifies in some slots (e.g. PN changed on refresh) | Calculation skips those slots (§5). The summary row still shows. No warning in v1 |
| Unit committed elsewhere while in the plan | Commit still succeeds (prototype, no clash check) |
| Data reload (Refresh or historical load) | Working plans are kept. Actions whose units have disappeared are skipped by the calculation |
| `loadHistoricalData` "delete all drafts" confirm | Also clears working plans |

## 10. How drafts plug in later

A draft is already a named list of `ModellingAction`s with an owner and a colour. Once actions carry `actionType`, a named draft is simply a saved working plan. Later options, not designed here:
- "Save working plan as draft" / "Load draft into working plan"
- Retire the Workspace tab in favour of Schedule + a drafts list

Nothing in this design blocks either.

## 11. Testing

The repo has only `node --test` tests for Dashboard 2 (`npm run test:dashboard2`, Node type stripping, no `@/` alias, no value imports from extensionless paths).

- `src/utils/actionEffects.ts` has no value imports (§6.3), so it can be tested the same way. Add `src/utils/__tests__/actionEffects.test.mjs` and a `test:actions` script. Cover:
  - `isCandidate` for each type: on/off, `pn` vs `sel`, `reg` vs `mel`.
  - `marginDelta` for each type, including the "doesn't apply in this slot" zero cases and open-ended `toPeriod`.
  - `areaDelta` for each type, including the fuel-type gates.
- **Regression check:** for a slot with only Start actions, the refactored `computeAggregates` / `applyDraftToBaseline` / area functions return the same numbers as before. Write this as a unit test with a small hand-built `SettlementPeriodData`, or compare old and new by hand during implementation.
- **Manual pass in the browser:** each picker (switch in Config), add one of each type, edit times, see dotted lines move on Margin chart, an area chart and Dashboard 2, commit, see it in Promoted and the solid line move. Solve ↗ with both destinations.
- `npx tsc --noEmit` and `npm run build` pass.

## 12. Documentation

Update `CLAUDE.md`:
- Component map: Schedule tab components, `actionEffects.ts`, `scenarioRanking.ts`.
- Store state: `workingPlans`, `workingPlanWindow`.
- New "Scheduling Actions" section: types, candidate rules, deltas, working plan → commit.
- MELS facts (§7) replacing "MELS always returns empty".
- "What not to change": the Start-only skip rule, `actionTypeOf` default, `wp:<user>` overlay id.
