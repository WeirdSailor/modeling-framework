# Scheduling Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four scheduling action types (Start, Deload to SEL, Desync, Model capacity), a per-operator working plan with Commit, and a new Schedule tab with three switchable candidate pickers.

**Architecture:** One pure module (`src/utils/actionEffects.ts`) owns the candidate rules and the per-slot effect of each action type. The existing margin and area calculations call it, so every chart, dashboard and the store pick up the new types without signature changes. The working plan lives in Zustand, is drawn as a draft-shaped overlay (`src/utils/workingPlan.ts`), and is committed as a promoted draft. The UI is a new `src/components/schedule/` folder: shared frame and summary, plus three picker components chosen by a Config tweak.

**Tech Stack:** Next.js 16 (client components), React 19, Zustand 5, TypeScript, `node --test` with Node's built-in type stripping (Node ≥ 23.6).

**Spec:** `Docs/superpowers/specs/2026-11-21-scheduling-actions-design.md`. Read it first. Section numbers (§) below refer to it.

**Project rules that apply here** (from `CLAUDE.md`, read it before starting):
- `computeAggregates` iterates `sp.pn` directly. Keep that.
- `ModellingAction.toPeriod` may be `undefined` (open-ended). Every coverage check must handle it. Use `covers()` from `actionEffects.ts`.
- `refreshAllAggregates` must run whenever promoted actions change. `commitWorkingPlan` gets this by calling the existing `promoteDraft`.
- Files loaded by `node --test` must have **no value imports** (type-only imports are fine). They can't resolve `@/` or extensionless relative paths.
- This version of Next.js differs from older ones. Nothing here touches routing or Next APIs, but check `node_modules/next/dist/docs/` if you need to.

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `src/models/types.ts` | modify | `ActionType`, labels, `actionType` on `ModellingAction`, `WorkingPlanAction`, `WorkingPlanPatch` |
| `src/utils/actionEffects.ts` | create | Pure: `actionTypeOf`, `covers`, `slotValues`, `isCandidate`, `marginDelta`, `areaDelta`, `changeMw` |
| `src/utils/workingPlan.ts` | create | Pure: working plan → draft-shaped overlay, notes split |
| `src/utils/__tests__/actionEffects.test.mjs` | create | Unit tests |
| `src/utils/__tests__/workingPlan.test.mjs` | create | Unit tests |
| `package.json` | modify | `test:actions` script |
| `src/utils/margin.ts` | modify | Use `marginDelta`; Start-only skip rule |
| `src/utils/areaAggregates.ts` | modify | Use `areaDelta` for non-Start; clamp ≥ 0 |
| `src/store/useModellingStore.ts` | modify | Working plan state and actions |
| `src/utils/scenarioRanking.ts` | create | `scenarioScore` moved out of `AvailableTable.tsx` |
| `src/components/AvailableTable.tsx` | modify | Import `scenarioScore`; export `TypeChip` |
| `src/components/DraftDetails.tsx` | modify | Export `ScenarioPopover` |
| `src/app/globals.css` | modify | Action chips, Schedule layout classes |
| `src/components/schedule/scheduleUi.tsx` | create | `fmtMw`, `slotLabel`, `REASON_LABEL`, `ActionChip`, `describeChange` |
| `src/components/schedule/candidates.ts` | create | `CandidateRow`, `buildCandidateRows` |
| `src/components/schedule/pickerTypes.ts` | create | `PickerProps`, set helpers |
| `src/components/schedule/CandidateTable.tsx` | create | Shared candidate table |
| `src/components/schedule/PickerTypeFirst.tsx` | create | Picker A |
| `src/components/schedule/PickerUnitsFirst.tsx` | create | Picker B |
| `src/components/schedule/PickerTabs.tsx` | create | Picker C |
| `src/components/schedule/WorkingPlanSummary.tsx` | create | Working plan table and header |
| `src/components/schedule/CommitPlanModal.tsx` | create | Name + description modal |
| `src/components/schedule/ScheduleTab.tsx` | create | Tab frame |
| `src/components/ConfigPanel.tsx` | modify | `schedulePicker`, `solveDestination` tweaks |
| `src/app/page.tsx` | modify | Schedule tab, Solve routing, overlay for `AreaChart`, tweak defaults |
| `src/components/MarginChart.tsx` | modify | Include working plan overlay |
| `src/dashboard2/data/realAdapters.ts` | modify | Include working plan overlay |
| `src/dashboard2/components/OperationalDashboard.tsx` | modify | Refetch on working plan change |
| `CLAUDE.md` | modify | Document the feature and the MELS facts |

---

### Task 0: Branch

- [ ] **Step 1: Create a feature branch**

```bash
cd /Users/nazar/Developer/modeling-framework
git checkout main && git pull --ff-only
git checkout -b feat/scheduling-actions
```

Expected: `Switched to a new branch 'feat/scheduling-actions'`.

---

### Task 1: Types

**Files:**
- Modify: `src/models/types.ts`

- [ ] **Step 1: Add the action type definitions**

In `src/models/types.ts`, directly after the `OPERATION_TYPE_LABELS` constant, add:

```ts
// Scheduling action types (Docs/superpowers/specs/2026-11-21-scheduling-actions-design.md).
export type ActionType = 'start' | 'deload' | 'desync' | 'capacity'

export const ACTION_TYPES: ActionType[] = ['start', 'deload', 'desync', 'capacity']

export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  start:    'Start',
  deload:   'Deload to SEL',
  desync:   'Desync',
  capacity: 'Model capacity',
}
```

- [ ] **Step 2: Add `actionType` to `ModellingAction`**

In the `ModellingAction` interface, after `operationType?: OperationType;`, add:

```ts
  actionType?: ActionType;         // undefined = 'start' (every draft created before Scheduling Actions)
```

- [ ] **Step 3: Add the working plan row types**

Directly after the closing `}` of `ModellingAction`, add:

```ts
// A working-plan row: an action plus its note (drafts keep notes in DraftPlan.unitNotes instead).
export type WorkingPlanAction = ModellingAction & { note?: string }

export type WorkingPlanPatch = Partial<Pick<
  WorkingPlanAction, 'fromPeriod' | 'toPeriod' | 'outputLevel' | 'reasonCode' | 'operationType' | 'note'
>>
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add src/models/types.ts
git commit -m "feat(actions): add ActionType and working plan types"
```

---

### Task 2: `actionEffects.ts` (TDD)

**Files:**
- Create: `src/utils/__tests__/actionEffects.test.mjs`
- Create: `src/utils/actionEffects.ts`
- Modify: `package.json`

- [ ] **Step 1: Add the test script**

In `package.json` `"scripts"`, after `"test:dashboard2"`, add:

```json
    "test:actions": "node --test \"src/utils/__tests__/*.test.mjs\""
```

(Add a comma after the `test:dashboard2` line.)

- [ ] **Step 2: Write the failing tests**

Create `src/utils/__tests__/actionEffects.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  actionTypeOf, covers, slotValues, isCandidate, marginDelta, areaDelta, changeMw,
} from '../actionEffects.ts'

// One slot: ON is running at 400 (MEL 600), OFF is off (declared MEL 0, MIL 7),
// LOW is running at 150, below its SEL of 200.
const sp = {
  settlementPeriod: 5,
  pn:  { ON: 400, OFF: 0, LOW: 150 },
  mel: { ON: 600, OFF: 0, LOW: 150 },
  mil: { OFF: 7 },
}
const ccgt = { fuelType: 'CCGT', registeredCapacity: 700, sel: 200 }
const wind = { fuelType: 'WIND', registeredCapacity: 300, sel: undefined }
const act = (bmUnitId, actionType, extra = {}) =>
  ({ bmUnitId, actionType, fromPeriod: 1, toPeriod: 10, outputLevel: 0, ...extra })
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} ≈ ${expected}`)

test('actionTypeOf defaults to start', () => {
  assert.equal(actionTypeOf({}), 'start')
  assert.equal(actionTypeOf({ actionType: 'desync' }), 'desync')
})

test('covers handles edges and open-ended windows', () => {
  assert.equal(covers({ fromPeriod: 3, toPeriod: 5 }, 3), true)
  assert.equal(covers({ fromPeriod: 3, toPeriod: 5 }, 5), true)
  assert.equal(covers({ fromPeriod: 3, toPeriod: 5 }, 6), false)
  assert.equal(covers({ fromPeriod: 3, toPeriod: 5 }, 2), false)
  assert.equal(covers({ fromPeriod: 3, toPeriod: undefined }, 48), true)
})

test('slotValues: startMel falls back to registered capacity when declared MEL is 0', () => {
  assert.equal(slotValues('OFF', sp, ccgt).startMel, 700)
  assert.equal(slotValues('ON', sp, ccgt).startMel, 600)
})

test('slotValues: SEL falls back to MIL when the unit has no SEL', () => {
  assert.equal(slotValues('OFF', sp, { fuelType: 'OCGT', registeredCapacity: 50 }).sel, 7)
})

test('isCandidate per type', () => {
  assert.equal(isCandidate('start', 'OFF', sp, ccgt), true)
  assert.equal(isCandidate('start', 'ON', sp, ccgt), false)
  assert.equal(isCandidate('deload', 'ON', sp, ccgt), true)
  assert.equal(isCandidate('deload', 'LOW', sp, ccgt), false)            // PN below SEL
  assert.equal(isCandidate('deload', 'ON', sp, { ...ccgt, sel: undefined }), false) // no SEL
  assert.equal(isCandidate('desync', 'ON', sp, ccgt), true)
  assert.equal(isCandidate('desync', 'OFF', sp, ccgt), false)
  assert.equal(isCandidate('capacity', 'ON', sp, ccgt), true)            // 700 > PN 400
  assert.equal(isCandidate('capacity', 'ON', sp, { ...ccgt, registeredCapacity: 400 }), false)
  assert.equal(isCandidate('capacity', 'OFF', sp, ccgt), false)
})

test('marginDelta: start', () => {
  assert.deepEqual(marginDelta(act('OFF', 'start', { outputLevel: 500 }), sp, ccgt), { emx: 700, eol: 500, emi: 200 })
  assert.deepEqual(marginDelta(act('ON', 'start', { outputLevel: 500 }), sp, ccgt), { emx: 0, eol: 0, emi: 0 })
})

test('marginDelta: start equals the pre-Scheduling-Actions formula when declared MEL > 0', () => {
  // Old rule for an off unit: emx += sp.mel[u] ?? 0, eol += outputLevel, emi += unit.sel ?? sp.mil[u] ?? 0
  const slot = { settlementPeriod: 1, pn: { X: 0 }, mel: { X: 450 }, mil: {} }
  const unit = { fuelType: 'CCGT', registeredCapacity: 500, sel: 120 }
  assert.deepEqual(marginDelta(act('X', undefined, { outputLevel: 300 }), slot, unit), { emx: 450, eol: 300, emi: 120 })
})

test('marginDelta: deload, desync, capacity', () => {
  assert.deepEqual(marginDelta(act('ON', 'deload'), sp, ccgt), { emx: 0, eol: -200, emi: 0 })
  assert.deepEqual(marginDelta(act('LOW', 'deload'), sp, ccgt), { emx: 0, eol: 0, emi: 0 })
  assert.deepEqual(marginDelta(act('ON', 'desync'), sp, ccgt), { emx: -600, eol: -400, emi: -200 })
  assert.deepEqual(marginDelta(act('OFF', 'desync'), sp, ccgt), { emx: 0, eol: 0, emi: 0 })
  assert.deepEqual(marginDelta(act('ON', 'capacity'), sp, ccgt), { emx: 300, eol: 0, emi: 0 })
  assert.deepEqual(marginDelta(act('OFF', 'capacity'), sp, ccgt), { emx: 0, eol: 0, emi: 0 })
})

test('areaDelta: start and margin are always 0 here', () => {
  assert.equal(areaDelta(act('OFF', 'start'), 'general_reserve', sp, ccgt), 0)
  assert.equal(areaDelta(act('ON', 'desync'), 'margin', sp, ccgt), 0)
})

test('areaDelta: deload and capacity free headroom in reserve and response', () => {
  assert.equal(areaDelta(act('ON', 'deload'), 'general_reserve', sp, ccgt), 200)
  assert.equal(areaDelta(act('ON', 'deload'), 'response', sp, ccgt), 200)
  assert.equal(areaDelta(act('ON', 'deload'), 'inertia', sp, ccgt), 0)
  assert.equal(areaDelta(act('ON', 'capacity'), 'recovery_reserve', sp, ccgt), 300)
  assert.equal(areaDelta(act('ON', 'capacity'), 'response', sp, wind), 0)   // WIND gives no response
})

test('areaDelta: desync removes headroom, inertia and voltage', () => {
  assert.equal(areaDelta(act('ON', 'desync'), 'contingency_reserve', sp, ccgt), -200)
  near(areaDelta(act('ON', 'desync'), 'inertia', sp, ccgt), -35)
  near(areaDelta(act('ON', 'desync'), 'voltage', sp, ccgt), -210)
  assert.equal(areaDelta(act('ON', 'desync'), 'inertia', sp, wind), 0)      // non-synchronous
  assert.equal(areaDelta(act('OFF', 'desync'), 'voltage', sp, ccgt), 0)     // not running
})

test('changeMw per type', () => {
  assert.equal(changeMw('start', 'OFF', sp, ccgt), 700)
  assert.equal(changeMw('deload', 'ON', sp, ccgt), -200)
  assert.equal(changeMw('deload', 'LOW', sp, ccgt), 0)
  assert.equal(changeMw('desync', 'ON', sp, ccgt), -400)
  assert.equal(changeMw('capacity', 'ON', sp, ccgt), 300)
})
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npm run test:actions`
Expected: FAIL. The error mentions it cannot find module `../actionEffects.ts`.

- [ ] **Step 4: Implement `actionEffects.ts`**

Create `src/utils/actionEffects.ts`:

```ts
// Scheduling Actions: which units each action type applies to, and each type's effect in one
// settlement period. Spec: Docs/superpowers/specs/2026-11-21-scheduling-actions-design.md §5–§6.
//
// No value imports (type-only imports are fine): `node --test` loads this file directly with
// type stripping and cannot resolve `@/` or extensionless relative imports.

import type { ActionType, BMUnit, ModellingAction, SettlementPeriodData } from '@/models/types'

// Copies of the sets in areaAggregates.ts, kept local because of the no-value-imports rule.
const SYNCHRONOUS_FUEL_TYPES = new Set(['CCGT', 'NUCLEAR', 'NPSHYD', 'OCGT', 'PS', 'COAL'])
const RESPONSE_FUEL_TYPES = new Set(['PS', 'NPSHYD', 'OCGT', 'CCGT'])
const RESERVE_AREAS = new Set(['recovery_reserve', 'freq_control_reserve', 'general_reserve', 'contingency_reserve'])

// PN above this counts as running (same threshold as isUnitPnCommitted in margin.ts).
const RUNNING_MW = 1

export type UnitInfo = Pick<BMUnit, 'fuelType' | 'registeredCapacity' | 'sel'>
type SlotData = Pick<SettlementPeriodData, 'pn' | 'mel' | 'mil'>

export interface SlotValues {
  pn: number        // physical notification this slot
  mel: number       // sp.mel, falling back to PN (as computeAggregates does)
  sel: number       // unit SEL, falling back to MIL (as today's EMI does)
  reg: number       // registered capacity
  startMel: number  // MEL a started unit adds: declared MEL if above 0, else registered capacity
}

export interface MarginDelta { emx: number; eol: number; emi: number }

const ZERO: MarginDelta = { emx: 0, eol: 0, emi: 0 }

export function actionTypeOf(action: Pick<ModellingAction, 'actionType'>): ActionType {
  return action.actionType ?? 'start'
}

/** True when the action's window includes this slot. `toPeriod` undefined = open-ended. */
export function covers(action: Pick<ModellingAction, 'fromPeriod' | 'toPeriod'>, slot: number): boolean {
  return action.fromPeriod <= slot && (action.toPeriod === undefined || action.toPeriod >= slot)
}

export function slotValues(bmUnitId: string, sp: SlotData, unit: UnitInfo | undefined): SlotValues {
  const pn = sp.pn[bmUnitId] ?? 0
  const declared = sp.mel[bmUnitId]
  const mel = declared ?? pn
  const sel = unit?.sel ?? sp.mil[bmUnitId] ?? 0
  const reg = unit?.registeredCapacity ?? mel
  const startMel = declared !== undefined && declared > 0 ? declared : (unit?.registeredCapacity ?? 0)
  return { pn, mel, sel, reg, startMel }
}

/** Spec §5. Model capacity assumes a running unit's MEL has been cut to its PN (spec D4). */
export function isCandidate(type: ActionType, bmUnitId: string, sp: SlotData, unit: UnitInfo | undefined): boolean {
  const v = slotValues(bmUnitId, sp, unit)
  const running = v.pn > RUNNING_MW
  switch (type) {
    case 'start':    return !running
    case 'deload':   return running && unit?.sel !== undefined && v.pn > unit.sel
    case 'desync':   return running
    case 'capacity': return running && v.reg > v.pn
  }
}

/** Spec §6.1. Change to EMX/EOL/EMI in one covered slot; zero where the action doesn't apply. */
export function marginDelta(
  action: Pick<ModellingAction, 'bmUnitId' | 'actionType' | 'outputLevel'>,
  sp: SlotData,
  unit: UnitInfo | undefined,
): MarginDelta {
  const v = slotValues(action.bmUnitId, sp, unit)
  const running = v.pn > RUNNING_MW
  switch (actionTypeOf(action)) {
    case 'start':    return running ? ZERO : { emx: v.startMel, eol: action.outputLevel, emi: v.sel }
    case 'deload':   return running && v.pn > v.sel ? { emx: 0, eol: -(v.pn - v.sel), emi: 0 } : ZERO
    case 'desync':   return running ? { emx: -v.mel, eol: -v.pn, emi: -v.sel } : ZERO
    case 'capacity': return running && v.reg > v.pn ? { emx: v.reg - v.pn, eol: 0, emi: 0 } : ZERO
  }
}

/**
 * Spec §6.2. Change to a non-margin area in one covered slot for Deload, Desync and Model capacity.
 * Returns 0 for Start (areaAggregates keeps unitAreaContribution for Start) and for 'margin'.
 */
export function areaDelta(
  action: Pick<ModellingAction, 'bmUnitId' | 'actionType'>,
  area: string,
  sp: SlotData,
  unit: UnitInfo | undefined,
): number {
  const type = actionTypeOf(action)
  if (type === 'start' || area === 'margin') return 0
  const v = slotValues(action.bmUnitId, sp, unit)
  if (v.pn <= RUNNING_MW) return 0
  const headroomArea = RESERVE_AREAS.has(area)
    || (area === 'response' && unit !== undefined && RESPONSE_FUEL_TYPES.has(unit.fuelType))
  switch (type) {
    case 'deload':   return headroomArea && v.pn > v.sel ? v.pn - v.sel : 0
    case 'capacity': return headroomArea && v.reg > v.pn ? v.reg - v.pn : 0
    case 'desync':
      if (headroomArea) return -Math.max(0, v.mel - v.pn)
      if (area === 'inertia') return unit !== undefined && SYNCHRONOUS_FUEL_TYPES.has(unit.fuelType) ? -v.reg * 0.05 : 0
      if (area === 'voltage') return -v.reg * 0.3
      return 0
  }
}

/** Signed MW figure shown in pickers and the summary: + for Start / Model capacity, − for reductions. */
export function changeMw(type: ActionType, bmUnitId: string, sp: SlotData, unit: UnitInfo | undefined): number {
  const v = slotValues(bmUnitId, sp, unit)
  switch (type) {
    case 'start':    return v.startMel
    case 'deload':   return -Math.max(0, v.pn - v.sel)
    case 'desync':   return -v.pn
    case 'capacity': return Math.max(0, v.reg - v.pn)
  }
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npm run test:actions`
Expected: every test passes (`ℹ fail 0`).

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add package.json src/utils/actionEffects.ts src/utils/__tests__/actionEffects.test.mjs
git commit -m "feat(actions): pure candidate rules and per-slot effects per action type"
```

---

### Task 3: `workingPlan.ts` (TDD)

**Files:**
- Create: `src/utils/__tests__/workingPlan.test.mjs`
- Create: `src/utils/workingPlan.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/utils/__tests__/workingPlan.test.mjs`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  workingPlanAsDraft, workingPlanDraftId, toModellingActions, WORKING_PLAN_COLOR, WORKING_PLAN_NAME,
} from '../workingPlan.ts'

const row = (bmUnitId, extra = {}) => ({
  bmUnitId, actionType: 'start', fromPeriod: 4, toPeriod: 8, outputLevel: 100,
  reasonCode: 'MARGIN', timestamp: new Date(0), ...extra,
})

test('workingPlanDraftId is namespaced per user', () => {
  assert.equal(workingPlanDraftId('NSE'), 'wp:NSE')
})

test('workingPlanAsDraft returns null for an empty or missing plan', () => {
  assert.equal(workingPlanAsDraft(undefined, 'NSE'), null)
  assert.equal(workingPlanAsDraft([], 'NSE'), null)
})

test('workingPlanAsDraft builds a draft-status overlay without notes', () => {
  const d = workingPlanAsDraft([row('A', { note: 'hi' }), row('B', { fromPeriod: 2 })], 'OSM')
  assert.equal(d.id, 'wp:OSM')
  assert.equal(d.name, WORKING_PLAN_NAME)
  assert.equal(d.color, WORKING_PLAN_COLOR)
  assert.equal(d.status, 'draft')
  assert.equal(d.ownerId, 'OSM')
  assert.equal(d.fromPeriod, 2)
  assert.equal(d.actions.length, 2)
  assert.equal('note' in d.actions[0], false)
})

test('toModellingActions strips notes into unitNotes', () => {
  const { actions, unitNotes } = toModellingActions([row('A', { note: 'keep' }), row('B', { note: '' })])
  assert.deepEqual(unitNotes, { A: 'keep' })
  assert.equal(actions.every(a => !('note' in a)), true)
})
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm run test:actions`
Expected: FAIL. The error mentions it cannot find `../workingPlan.ts`.

- [ ] **Step 3: Implement `workingPlan.ts`**

Create `src/utils/workingPlan.ts`:

```ts
// The operator's working plan as a draft-shaped overlay for MarginChart, AreaChart and
// Dashboard 2. It is never stored in `drafts`. Spec §8.4.
//
// No value imports (type-only imports are fine): loaded directly by `node --test`.

import type { DraftPlan, ModellingAction, UserId, WorkingPlanAction } from '@/models/types'

export const WORKING_PLAN_COLOR = '#22c55e'
export const WORKING_PLAN_NAME = 'Working plan'

export function workingPlanDraftId(user: UserId): string {
  return `wp:${user}`
}

/** Splits working-plan rows into plain actions plus the notes map drafts use. */
export function toModellingActions(plan: WorkingPlanAction[]): {
  actions: ModellingAction[]
  unitNotes: Record<string, string>
} {
  const unitNotes: Record<string, string> = {}
  const actions = plan.map(({ note, ...action }) => {
    if (note) unitNotes[action.bmUnitId] = note
    return action
  })
  return { actions, unitNotes }
}

export function workingPlanAsDraft(plan: WorkingPlanAction[] | undefined, user: UserId): DraftPlan | null {
  if (!plan || plan.length === 0) return null
  const { actions } = toModellingActions(plan)
  return {
    id: workingPlanDraftId(user),
    name: WORKING_PLAN_NAME,
    description: '',
    actions,
    status: 'draft',
    color: WORKING_PLAN_COLOR,
    fromPeriod: Math.min(...actions.map(a => a.fromPeriod)),
    toPeriod: 48,
    unitNotes: {},
    createdAt: 0,
    ownerId: user,
    sharedWith: [],
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm run test:actions`
Expected: all pass, `ℹ fail 0`.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` (expected: no output), then:

```bash
git add src/utils/workingPlan.ts src/utils/__tests__/workingPlan.test.mjs
git commit -m "feat(actions): working plan overlay helpers"
```

---

### Task 4: Margin calculation uses `marginDelta`

**Files:**
- Modify: `src/utils/margin.ts`

- [ ] **Step 1: Replace `margin.ts` below `isUnitPnCommitted`**

Keep the `isUnitPnCommitted` function and its comment exactly as they are. Replace the import line and everything else in the file with:

```ts
import type { BMUnit, SettlementPeriodData, ModellingAction } from '@/models/types'
import { actionTypeOf, covers, marginDelta } from '@/utils/actionEffects'
```

(at the top, replacing the old single import), and after `isUnitPnCommitted`:

```ts
function buildUnitMap(units: BMUnit[]): Map<string, BMUnit> {
  return new Map(units.map(u => [u.bmUnitId, u]))
}

// Compute EMX, EOL, EMI, and margin for a SP.
//
// Baseline: all units with PN > 1 MW (iterates sp.pn directly — not filtered
// through the reference units array, so committed units outside the dispatchable
// reference list are still counted).
//
// Actions: one action per unit per SP, each applying its type's change
// (actionEffects.marginDelta). Start does nothing for a unit that is already running,
// which is the old "skip if PN-committed" rule.
export function computeAggregates(
  sp: SettlementPeriodData,
  actions: ModellingAction[],
  units: BMUnit[]
): { emx: number; eol: number; emi: number; margin: number } {
  const unitMap = buildUnitMap(units)
  const spNum = sp.settlementPeriod

  let emx = 0, eol = 0, emi = 0

  // Baseline — all PN-committed units (regardless of whether they appear in
  // the reference units list)
  for (const [bmUnit, pn] of Object.entries(sp.pn)) {
    if (pn > 1) {
      emx += sp.mel[bmUnit] ?? pn
      eol += pn
      const sel = unitMap.get(bmUnit)?.sel
      emi += sel !== undefined ? sel : (sp.mil[bmUnit] ?? 0)
    }
  }

  const seen = new Set<string>()
  for (const action of actions) {
    if (!covers(action, spNum) || seen.has(action.bmUnitId)) continue
    seen.add(action.bmUnitId)
    const d = marginDelta(action, sp, unitMap.get(action.bmUnitId))
    emx += d.emx
    eol += d.eol
    emi += d.emi
  }

  return { emx, eol, emi, margin: emx - sp.demand }
}

// Apply a draft's actions on top of an already-computed baseline (sp.emx/eol/emi
// from the store, which already includes PN-committed units + any committed plan
// actions). Used by the charts to render per-draft dotted overlays without
// recomputing the full baseline from scratch each render.
//
// alreadyModelled: bmUnitIds already counted in the baseline for this SP
// (PN-committed + committed plan units). It only blocks Start actions: the other
// action types act on running units by definition.
export function applyDraftToBaseline(
  sp: SettlementPeriodData,
  baseEmx: number,
  baseEol: number,
  baseEmi: number,
  draftActions: ModellingAction[],
  alreadyModelled: Set<string>,
  units: BMUnit[]
): { emx: number; eol: number; emi: number; margin: number } {
  const unitMap = buildUnitMap(units)
  const spNum = sp.settlementPeriod

  let addEmx = 0, addEol = 0, addEmi = 0
  const seen = new Set<string>()

  for (const action of draftActions) {
    if (!covers(action, spNum) || seen.has(action.bmUnitId)) continue
    if (actionTypeOf(action) === 'start' && alreadyModelled.has(action.bmUnitId)) continue
    seen.add(action.bmUnitId)
    const d = marginDelta(action, sp, unitMap.get(action.bmUnitId))
    addEmx += d.emx
    addEol += d.eol
    addEmi += d.emi
  }

  const emx = baseEmx + addEmx
  const eol = baseEol + addEol
  const emi = baseEmi + addEmi
  return { emx, eol, emi, margin: emx - sp.demand }
}
```

Note: the only behaviour change for existing (Start-only) drafts is when a unit's `sp.mel` is 0 or missing: Start now adds registered capacity instead of 0. Today `sp.mel` is always filled with registered capacity (MELS falls back to mock data), so results are unchanged.

- [ ] **Step 2: Type-check, test, build**

Run: `npx tsc --noEmit && npm run test:actions && npm run test:dashboard2`
Expected: no type errors; both test runs `ℹ fail 0`.

- [ ] **Step 3: Commit**

```bash
git add src/utils/margin.ts
git commit -m "feat(actions): margin aggregates apply each action type's change"
```

---

### Task 5: Area availability uses `areaDelta`

**Files:**
- Modify: `src/utils/areaAggregates.ts`

- [ ] **Step 1: Add the import**

Below the existing `import type { ... } from '@/models/types'` line, add:

```ts
import { actionTypeOf, areaDelta, covers } from '@/utils/actionEffects'
```

- [ ] **Step 2: Add `actionAreaContribution` after `unitAreaContribution`**

Directly after the closing `}` of `unitAreaContribution`, add:

```ts
// One action's contribution to an area in one SP. Start keeps the original promote-a-unit
// formula; the other action types use actionEffects.areaDelta (which can be negative).
function actionAreaContribution(
  action: ModellingAction,
  area: string,
  sp: SettlementPeriodData,
  units: BMUnit[]
): number {
  if (actionTypeOf(action) === 'start') return unitAreaContribution(action.bmUnitId, area, sp, units)
  return areaDelta(action, area, sp, units.find(u => u.bmUnitId === action.bmUnitId))
}
```

- [ ] **Step 3: Replace `computeAreaAvailabilities` entirely**

Replace the whole `computeAreaAvailabilities` function (keep its leading comment if there is one) with:

```ts
export function computeAreaAvailabilities(
  settlementPeriods: SettlementPeriodData[],
  promotedActions: ModellingAction[],
  units: BMUnit[],
  areaRequirements: Record<string, AreaRequirementRow[]>
): SettlementPeriodData[] {
  return settlementPeriods.map(sp => {
    const spIdx = sp.settlementPeriod
    const areaAvailability: Record<string, number> = {}

    for (const area of NON_MARGIN_AREA_IDS) {
      const rows = areaRequirements[area] ?? []
      const row = rows.find(r => r.sp === spIdx)
      const base = row ? Math.max(0, row.contracted - row.constrained) : 0

      const seen = new Set<string>()
      let contribution = 0
      for (const action of promotedActions) {
        if (!covers(action, spIdx) || seen.has(action.bmUnitId)) continue
        seen.add(action.bmUnitId)
        contribution += actionAreaContribution(action, area, sp, units)
      }
      // Desync can push the sum below zero (prototype approximation, spec §6.2).
      areaAvailability[area] = Math.max(0, base + contribution)
    }

    return { ...sp, areaAvailability }
  })
}
```

- [ ] **Step 4: Replace `applyDraftToAreaBaseline` entirely**

Keep its leading comment, and update the last line of the comment to say `alreadyModelled` only blocks Start actions. Replace the function with:

```ts
export function applyDraftToAreaBaseline(
  sp: SettlementPeriodData,
  baseAvailability: number,
  draftActions: ModellingAction[],
  alreadyModelled: Set<string>,
  units: BMUnit[],
  area: string
): number {
  if (area === 'margin') return baseAvailability
  const spIdx = sp.settlementPeriod
  const seen = new Set<string>()
  let addition = 0

  for (const action of draftActions) {
    if (!covers(action, spIdx) || seen.has(action.bmUnitId)) continue
    if (actionTypeOf(action) === 'start' && alreadyModelled.has(action.bmUnitId)) continue
    seen.add(action.bmUnitId)
    addition += actionAreaContribution(action, area, sp, units)
  }
  return Math.max(0, baseAvailability + addition)
}
```

- [ ] **Step 5: Type-check and test**

Run: `npx tsc --noEmit && npm run test:actions && npm run test:dashboard2`
Expected: no type errors; `ℹ fail 0` twice.

- [ ] **Step 6: Commit**

```bash
git add src/utils/areaAggregates.ts
git commit -m "feat(actions): area availability applies non-start action effects"
```

---

### Task 6: Store — working plan state

**Files:**
- Modify: `src/store/useModellingStore.ts`

- [ ] **Step 1: Extend the imports**

Replace the first `import type { ... } from '@/models/types'` line with:

```ts
import type {
  ActionType, AreaRequirementRow, BMUnit, DraftPlan, ModellingAction, OperationType, ServiceType,
  SettlementPeriodData, UnitSnapshot, UserId, WorkingPlanAction, WorkingPlanPatch,
} from '@/models/types'
```

and below `import { computeAreaAvailabilities } from '@/utils/areaAggregates'` add:

```ts
import { slotValues } from '@/utils/actionEffects'
import { toModellingActions } from '@/utils/workingPlan'
```

- [ ] **Step 2: Add the state and action signatures**

In `interface ModellingState`, directly after `areaThresholds: Record<string, number>` add:

```ts
  // Scheduling Actions (spec §4.2): one working plan per operator, in memory only.
  workingPlans: Partial<Record<UserId, WorkingPlanAction[]>>
  workingPlanWindow: { fromPeriod: number; toPeriod: number }
  setWorkingPlanWindow: (fromPeriod: number, toPeriod: number) => void
  addToWorkingPlan: (items: { bmUnitId: string; actionType: ActionType }[], reasonCode?: ModellingAction['reasonCode']) => number
  updateWorkingPlanAction: (bmUnitId: string, patch: WorkingPlanPatch) => void
  removeFromWorkingPlan: (bmUnitId: string) => void
  clearWorkingPlan: () => void
  applyWindowToAll: () => void
  commitWorkingPlan: (name: string, description: string) => string | null
```

- [ ] **Step 3: Add a helper above the store**

Directly above `export const useModellingStore = create<ModellingState>(...)`, add:

```ts
// Returns a state patch that replaces the current operator's working plan.
function withPlan(
  state: ModellingState,
  fn: (plan: WorkingPlanAction[]) => WorkingPlanAction[],
): Pick<ModellingState, 'workingPlans'> {
  const user = state.currentUser
  return { workingPlans: { ...state.workingPlans, [user]: fn(state.workingPlans[user] ?? []) } }
}
```

- [ ] **Step 4: Add initial state and actions**

In the `create(...)` object, after `areaThresholds: Object.fromEntries(...)`, add:

```ts
  workingPlans: {},
  workingPlanWindow: { fromPeriod: 1, toPeriod: 48 },

  setWorkingPlanWindow: (fromPeriod, toPeriod) => set({ workingPlanWindow: { fromPeriod, toPeriod } }),

  addToWorkingPlan: (items, reasonCode = 'MARGIN') => {
    const state = get()
    const user = state.currentUser
    const existing = new Set((state.workingPlans[user] ?? []).map(a => a.bmUnitId))
    const { fromPeriod, toPeriod } = state.workingPlanWindow
    const sp = state.settlementPeriods.find(s => s.settlementPeriod === fromPeriod)
    const added: WorkingPlanAction[] = []
    for (const { bmUnitId, actionType } of items) {
      if (existing.has(bmUnitId)) continue
      existing.add(bmUnitId)
      const unit = state.units.find(u => u.bmUnitId === bmUnitId)
      const outputLevel = actionType !== 'start'
        ? 0
        : sp ? slotValues(bmUnitId, sp, unit).startMel : (unit?.registeredCapacity ?? 0)
      added.push({ bmUnitId, actionType, fromPeriod, toPeriod, outputLevel, reasonCode, timestamp: new Date() })
    }
    if (added.length > 0) set(s => withPlan(s, plan => [...plan, ...added]))
    return added.length
  },

  updateWorkingPlanAction: (bmUnitId, patch) =>
    set(s => withPlan(s, plan => plan.map(a => (a.bmUnitId === bmUnitId ? { ...a, ...patch } : a)))),

  removeFromWorkingPlan: (bmUnitId) =>
    set(s => withPlan(s, plan => plan.filter(a => a.bmUnitId !== bmUnitId))),

  clearWorkingPlan: () => set(s => withPlan(s, () => [])),

  applyWindowToAll: () =>
    set(s => withPlan(s, plan => plan.map(a => ({
      ...a, fromPeriod: s.workingPlanWindow.fromPeriod, toPeriod: s.workingPlanWindow.toPeriod,
    })))),

  // Saves the plan as a new draft and promotes it with the existing promoteDraft, which
  // snapshots unit data and runs refreshAllAggregates. Spec §4.2.
  commitWorkingPlan: (name, description) => {
    const state = get()
    const user = state.currentUser
    const plan = state.workingPlans[user] ?? []
    if (plan.length === 0) return null
    const { actions, unitNotes } = toModellingActions(plan)
    const id = crypto.randomUUID()
    const draft: DraftPlan = {
      id, name, description, actions, status: 'draft',
      color: DRAFT_COLORS[state.drafts.length % DRAFT_COLORS.length],
      fromPeriod: Math.min(...actions.map(a => a.fromPeriod)),
      toPeriod: Math.max(...actions.map(a => a.toPeriod ?? 48)),
      unitNotes, createdAt: Date.now(), ownerId: user, sharedWith: [],
    }
    set(s => ({ drafts: [...s.drafts, draft], ...withPlan(s, () => []) }))
    get().promoteDraft(id)
    return id
  },
```

- [ ] **Step 5: Clear working plans with drafts**

In `clearAllDrafts`, add `workingPlans: {},` to the returned object, after `selectedUnits: new Set<string>(),`. (`loadData` and `loadHistoricalData` both call `clearAllDrafts`, spec §9.)

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: no output. If `OperationType` is now reported unused, leave it: it was already imported for other actions in this file.

- [ ] **Step 7: Commit**

```bash
git add src/store/useModellingStore.ts
git commit -m "feat(actions): per-operator working plan in the store with commit"
```

---

### Task 7: Shared pieces from existing components

**Files:**
- Create: `src/utils/scenarioRanking.ts`
- Modify: `src/components/AvailableTable.tsx`
- Modify: `src/components/DraftDetails.tsx`

- [ ] **Step 1: Create `scenarioRanking.ts`**

```ts
// Scenario ranking used by AvailableTable and the Schedule tab's candidate pickers.
// Moved unchanged from AvailableTable.tsx.

export interface RankableUnit {
  fuelType: string
  gspGroup: string
  pn: number
  mel: number   // registered capacity
  ndz: number
}

const SYNCHRONOUS_TYPES = new Set(['CCGT', 'COAL', 'NUCLEAR', 'OCGT', 'NPSHYD', 'PS', 'BIOMASS', 'OIL', 'GAS'])
const RESPONSE_PREF: Record<string, number> = { PS: 3000, NPSHYD: 2000, OCGT: 1000 }

export function scenarioScore(row: RankableUnit, scenarioId: string, voltageArea: string): number {
  const available = Math.max(0, row.mel - row.pn)
  switch (scenarioId) {
    case 'margin':
      return available
    case 'inertia':
      return (SYNCHRONOUS_TYPES.has(row.fuelType) ? 100000 : 0) + row.mel
    case 'voltage':
      return (voltageArea && row.gspGroup === voltageArea ? 100000 : 0) + row.mel
    case 'reserve':
      return (row.ndz > 0 ? -row.ndz * 10 : -99999) + available / 1000
    case 'response':
      return (RESPONSE_PREF[row.fuelType] ?? 0) + (row.ndz > 0 ? -row.ndz : -9999)
    case 'pullback':
      return row.pn  // units generating most have the most to give back
    default:
      return 0
  }
}
```

- [ ] **Step 2: Use it in `AvailableTable.tsx`**

Delete the `SYNCHRONOUS_TYPES` constant, the `RESPONSE_PREF` constant and the whole `scenarioScore` function from `AvailableTable.tsx`. First confirm nothing else in the file uses the two constants:

Run: `grep -n "SYNCHRONOUS_TYPES\|RESPONSE_PREF" src/components/AvailableTable.tsx`
Expected: only the definitions and the lines inside `scenarioScore`.

Then add after the existing imports:

```ts
import { scenarioScore } from '@/utils/scenarioRanking'
```

`UnitRow` has every field `RankableUnit` needs, so the existing `scenarioScore(b, scenario, voltageArea)` calls compile unchanged.

- [ ] **Step 3: Export `TypeChip` from `AvailableTable.tsx`**

Change `function TypeChip({ fuelType }: { fuelType: string }) {` to:

```ts
export function TypeChip({ fuelType }: { fuelType: string }) {
```

- [ ] **Step 4: Export `ScenarioPopover` from `DraftDetails.tsx`**

Change `function ScenarioPopover({ scenario, onChange, onClose, wrapperRef }: {` to:

```ts
export function ScenarioPopover({ scenario, onChange, onClose, wrapperRef }: {
```

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` (expected: no output), then:

```bash
git add src/utils/scenarioRanking.ts src/components/AvailableTable.tsx src/components/DraftDetails.tsx
git commit -m "refactor: share scenario ranking, TypeChip and ScenarioPopover"
```

---

### Task 8: Styles and UI helpers

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/components/schedule/scheduleUi.tsx`

- [ ] **Step 1: Add the chip and layout CSS**

In `src/app/globals.css`, directly after the line `:root[data-theme="dark"] .chip-qr { ... }` (around line 90), add:

```css
:root[data-theme="dark"] .chip-act-start    { background: rgba(34,197,94,.16);  color: #86efac; }
:root[data-theme="dark"] .chip-act-deload   { background: rgba(245,158,11,.16); color: #fcd34d; }
:root[data-theme="dark"] .chip-act-desync   { background: rgba(239,68,68,.16);  color: #fca5a5; }
:root[data-theme="dark"] .chip-act-capacity { background: rgba(59,130,246,.16); color: #93c5fd; }
```

Directly after the line `.chip-qr { ... }` (around line 589), add:

```css
.chip-act-start    { background: #dcfce7; color: #15803d; }
.chip-act-deload   { background: #fef3c7; color: #b45309; }
.chip-act-desync   { background: #fee2e2; color: #b91c1c; }
.chip-act-capacity { background: #dbeafe; color: #1d4ed8; }

/* ── Schedule tab (Scheduling Actions) ── */
.schedule-tab { display: flex; flex-direction: column; gap: 10px; flex: 1; min-height: 0; overflow: auto; padding: 10px 14px; }
.schedule-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.schedule-section { border: 1px solid var(--border); border-radius: 8px; background: var(--bg-panel); display: flex; flex-direction: column; }
.schedule-section-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; padding: 8px 12px; border-bottom: 1px solid var(--border); font-size: 12px; }
.schedule-section .table-scroll { max-height: 340px; overflow: auto; }
.schedule-hint { font-size: 11px; color: var(--text-faint); }
.schedule-spacer { flex: 1; }
.schedule-notice { font-size: 11px; color: #d97706; padding: 6px 12px; }
.schedule-shortfall { font-size: 11px; font-weight: 700; color: #ef4444; border: 1px solid rgba(239,68,68,.4); background: rgba(239,68,68,.08); border-radius: 4px; padding: 2px 8px; }
.schedule-menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 50; min-width: 220px; background: var(--bg-panel); border: 1px solid var(--border-strong); border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.35); overflow: hidden; }
.schedule-menu button { display: block; width: 100%; text-align: left; padding: 7px 12px; font-size: 12px; border: none; background: var(--bg-panel); color: var(--text); cursor: pointer; }
.schedule-menu button:hover:not(:disabled) { background: var(--bg-hover); }
.schedule-menu button:disabled { color: var(--text-faint); cursor: default; }
```

- [ ] **Step 2: Create `scheduleUi.tsx`**

Create `src/components/schedule/scheduleUi.tsx`:

```tsx
// Small shared helpers for the Schedule tab.

import type { ActionType, BMUnit, ModellingAction, SettlementPeriodData } from '@/models/types'
import { ACTION_TYPE_LABELS } from '@/models/types'
import { actionTypeOf, slotValues } from '@/utils/actionEffects'

export const REASON_LABEL: Record<ModellingAction['reasonCode'], string> = {
  MARGIN:               'Margin',
  RECOVERY_RESERVE:     'Recovery Reserve',
  FREQ_CONTROL_RESERVE: 'Freq. Control',
  GENERAL_RESERVE:      'General Reserve',
  CONTINGENCY_RESERVE:  'Contingency',
  RESPONSE:             'Response',
  INERTIA:              'Inertia',
  VOLTAGE:              'Voltage',
}

export function fmtMw(n: number): string {
  return Math.round(n).toLocaleString()
}

/** "DD|HH:MM" for a window slot index, same format as DraftDetails. */
export function slotLabel(slot: number, periods: SettlementPeriodData[]): string {
  const sp = periods.find(s => s.settlementPeriod === slot)
  return sp ? `${sp.startTime.slice(8, 10)}|${sp.startTime.slice(11, 16)}` : `SP ${slot}`
}

export function ActionChip({ type }: { type: ActionType }) {
  return <span className={`chip chip-act-${type}`}>{ACTION_TYPE_LABELS[type]}</span>
}

/** "off → 600 MW", "420 → SEL 180 MW", "380 → 0 MW", "MEL 431 → 501 MW" (spec §8.3). */
export function describeChange(
  action: ModellingAction,
  sp: SettlementPeriodData | undefined,
  unit: BMUnit | undefined,
): string {
  if (!sp) return '—'
  const v = slotValues(action.bmUnitId, sp, unit)
  switch (actionTypeOf(action)) {
    case 'start':    return `off → ${fmtMw(action.outputLevel)} MW`
    case 'deload':   return `${fmtMw(v.pn)} → SEL ${fmtMw(v.sel)} MW`
    case 'desync':   return `${fmtMw(v.pn)} → 0 MW`
    case 'capacity': return `MEL ${fmtMw(v.pn)} → ${fmtMw(v.reg)} MW`
  }
}
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit` (expected: no output), then:

```bash
git add src/app/globals.css src/components/schedule/scheduleUi.tsx
git commit -m "feat(schedule): action chips, layout styles and UI helpers"
```

---

### Task 9: Candidate rows and the shared table

**Files:**
- Create: `src/components/schedule/candidates.ts`
- Create: `src/components/schedule/pickerTypes.ts`
- Create: `src/components/schedule/CandidateTable.tsx`

- [ ] **Step 1: Create `candidates.ts`**

```ts
// Candidate rows for the Schedule tab pickers (spec §8.2).

import type { ActionType, BMUnit, SettlementPeriodData } from '@/models/types'
import { ACTION_TYPES } from '@/models/types'
import { changeMw, isCandidate, slotValues } from '@/utils/actionEffects'
import { scenarioScore } from '@/utils/scenarioRanking'
import { EXCLUDED_FUEL_TYPES } from '@/utils/fuelTypes'

export interface CandidateRow {
  bmUnitId: string
  nationalGridBmUnit: string
  gspGroup: string
  fuelType: string
  pn: number
  mel: number
  reg: number
  sel: number
  ndz: number
  priceToSel: number
  priceToMel: number
  running: boolean
  qualifies: ActionType[]                // action types this unit is a candidate for
  change: Record<ActionType, number>     // signed MW per type (actionEffects.changeMw)
}

/**
 * Every unit that qualifies for at least one action type in `sp` (the window's first slot),
 * after the display exclusions, promoted units and the GSP filter. Ranked by the scenario
 * (existing scenarioScore), else by BMU name.
 */
export function buildCandidateRows({ units, sp, promotedUnitIds, gspFilter, scenario, voltageArea }: {
  units: BMUnit[]
  sp: SettlementPeriodData | undefined
  promotedUnitIds: Set<string>
  gspFilter: Record<string, 'include' | 'exclude'>
  scenario: string
  voltageArea: string
}): CandidateRow[] {
  if (!sp) return []
  const included = Object.entries(gspFilter).filter(([, v]) => v === 'include').map(([k]) => k)
  const excluded = new Set(Object.entries(gspFilter).filter(([, v]) => v === 'exclude').map(([k]) => k))

  const rows: CandidateRow[] = []
  for (const u of units) {
    if (EXCLUDED_FUEL_TYPES.has(u.fuelType) || u.registeredCapacity <= 0) continue
    if (promotedUnitIds.has(u.bmUnitId)) continue
    if (included.length > 0 && !included.includes(u.gspGroup)) continue
    if (excluded.has(u.gspGroup)) continue
    const qualifies = ACTION_TYPES.filter(t => isCandidate(t, u.bmUnitId, sp, u))
    if (qualifies.length === 0) continue
    const v = slotValues(u.bmUnitId, sp, u)
    rows.push({
      bmUnitId: u.bmUnitId,
      nationalGridBmUnit: u.nationalGridBmUnit,
      gspGroup: u.gspGroup,
      fuelType: u.fuelType,
      pn: v.pn,
      mel: v.mel,
      reg: v.reg,
      sel: u.sel ?? 0,
      ndz: u.ndz ?? 0,
      priceToSel: u.priceToSel ?? 0,
      priceToMel: u.priceToMel ?? 0,
      running: v.pn > 1,
      qualifies,
      change: {
        start:    changeMw('start', u.bmUnitId, sp, u),
        deload:   changeMw('deload', u.bmUnitId, sp, u),
        desync:   changeMw('desync', u.bmUnitId, sp, u),
        capacity: changeMw('capacity', u.bmUnitId, sp, u),
      },
    })
  }

  if (scenario !== 'none') {
    const score = (r: CandidateRow) =>
      scenarioScore({ fuelType: r.fuelType, gspGroup: r.gspGroup, pn: r.pn, mel: r.reg, ndz: r.ndz }, scenario, voltageArea)
    rows.sort((a, b) => score(b) - score(a))
  } else {
    rows.sort((a, b) => a.nationalGridBmUnit.localeCompare(b.nationalGridBmUnit))
  }
  return rows
}
```

- [ ] **Step 2: Create `pickerTypes.ts`**

```ts
import type { ActionType } from '@/models/types'
import type { CandidateRow } from './candidates'

/** Props shared by the three pickers (A, B, C). */
export interface PickerProps {
  rows: CandidateRow[]
  inPlan: Map<string, ActionType>   // units already in the working plan → their action type
  onAdd: (items: { bmUnitId: string; actionType: ActionType }[]) => void
  timeLabel: string                 // "DD|HH:MM" of the window's first slot
}

export function toggleIn(set: Set<string>, id: string): Set<string> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export function setManyIn(set: Set<string>, ids: string[], on: boolean): Set<string> {
  const next = new Set(set)
  for (const id of ids) {
    if (on) next.add(id)
    else next.delete(id)
  }
  return next
}
```

- [ ] **Step 3: Create `CandidateTable.tsx`**

```tsx
'use client'

// Candidate list shared by the three pickers: checkbox, unit columns, optional State or
// type-specific change column, click-to-sort headers (no sort = ranked order).

import { useMemo, useState } from 'react'
import type { ActionType } from '@/models/types'
import { TypeChip } from '@/components/AvailableTable'
import type { CandidateRow } from './candidates'
import { fmtMw } from './scheduleUi'

type SortKey = 'nationalGridBmUnit' | 'fuelType' | 'ndz' | 'sel' | 'pn' | 'mel' | 'reg' | 'priceToSel' | 'priceToMel' | 'change'

interface Props {
  rows: CandidateRow[]
  changeType?: ActionType                          // shows that type's +MW / −MW column
  showState?: boolean                              // shows Running / Off
  ticked: Set<string>
  onToggle: (bmUnitId: string) => void
  onSetTicked: (bmUnitIds: string[], on: boolean) => void
  blockedReason: (row: CandidateRow) => string | null  // non-null = greyed out, can't tick
  emptyText: string
}

export default function CandidateTable({
  rows, changeType, showState = false, ticked, onToggle, onSetTicked, blockedReason, emptyText,
}: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null)

  const sorted = useMemo(() => {
    if (!sort) return rows
    const { key, dir } = sort
    const value = (r: CandidateRow): number | string =>
      key === 'change' ? (changeType ? Math.abs(r.change[changeType]) : 0) : r[key]
    return [...rows].sort((a, b) => {
      const av = value(a), bv = value(b)
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
      return dir === 'asc' ? cmp : -cmp
    })
  }, [rows, sort, changeType])

  if (rows.length === 0) {
    return <div className="workspace-empty" style={{ padding: 24 }}><p>{emptyText}</p></div>
  }

  const selectable = sorted.filter(r => blockedReason(r) === null).map(r => r.bmUnitId)
  const allTicked = selectable.length > 0 && selectable.every(id => ticked.has(id))

  function cycleSort(key: SortKey) {
    setSort(s => (!s || s.key !== key ? { key, dir: 'desc' } : s.dir === 'desc' ? { key, dir: 'asc' } : null))
  }

  function Th({ k, label, numeric = true }: { k: SortKey; label: string; numeric?: boolean }) {
    const active = sort !== null && sort.key === k
    const caret = sort !== null && sort.key === k ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'
    return (
      <th
        className={['sortable', numeric ? 'num' : '', active ? 'col-active' : ''].filter(Boolean).join(' ')}
        onClick={() => cycleSort(k)}
      >
        <span className="th-inner">{label}<span className="sort-caret">{caret}</span></span>
      </th>
    )
  }

  const changeLabel = changeType === 'start' || changeType === 'capacity' ? '+MW' : '−MW'

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: 32 }}>
              <input
                type="checkbox"
                aria-label="Select all"
                checked={allTicked}
                disabled={selectable.length === 0}
                onChange={e => onSetTicked(selectable, e.target.checked)}
              />
            </th>
            <Th k="nationalGridBmUnit" label="BMU" numeric={false} />
            <Th k="fuelType" label="Type" numeric={false} />
            {showState && <th>State</th>}
            {changeType && <Th k="change" label={changeLabel} />}
            <Th k="ndz" label="NDZ" />
            <Th k="sel" label="SEL" />
            <Th k="pn" label="PN" />
            <Th k="mel" label="MEL" />
            <Th k="reg" label="Reg. cap" />
            <Th k="priceToSel" label="£ SEL" />
            <Th k="priceToMel" label="£ MEL" />
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.map(r => {
            const blocked = blockedReason(r)
            return (
              <tr
                key={r.bmUnitId}
                style={{ cursor: blocked ? 'default' : 'pointer', opacity: blocked ? 0.45 : 1 }}
                onClick={() => { if (!blocked) onToggle(r.bmUnitId) }}
              >
                <td>
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.nationalGridBmUnit}`}
                    checked={ticked.has(r.bmUnitId)}
                    disabled={blocked !== null}
                    onClick={e => e.stopPropagation()}
                    onChange={() => onToggle(r.bmUnitId)}
                  />
                </td>
                <td>
                  <div className="bmu-cell-inner">
                    <span>{r.nationalGridBmUnit}</span>
                    <span className="site-sub">{r.gspGroup}</span>
                  </div>
                </td>
                <td><TypeChip fuelType={r.fuelType} /></td>
                {showState && <td>{r.running ? 'Running' : 'Off'}</td>}
                {changeType && <td className="num">{fmtMw(Math.abs(r.change[changeType]))}</td>}
                <td className="num">{r.ndz || '—'}</td>
                <td className="num">{r.sel ? fmtMw(r.sel) : '—'}</td>
                <td className="num">{fmtMw(r.pn)}</td>
                <td className="num">{fmtMw(r.mel)}</td>
                <td className="num">{fmtMw(r.reg)}</td>
                <td className="num">{r.priceToSel || '—'}</td>
                <td className="num">{r.priceToMel || '—'}</td>
                <td className="schedule-hint">{blocked ?? ''}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc --noEmit` (expected: no output), then:

```bash
git add src/components/schedule/candidates.ts src/components/schedule/pickerTypes.ts src/components/schedule/CandidateTable.tsx
git commit -m "feat(schedule): candidate rows and shared candidate table"
```

---

### Task 10: The three pickers

**Files:**
- Create: `src/components/schedule/PickerTypeFirst.tsx`
- Create: `src/components/schedule/PickerUnitsFirst.tsx`
- Create: `src/components/schedule/PickerTabs.tsx`

- [ ] **Step 1: Picker A — type first**

Create `src/components/schedule/PickerTypeFirst.tsx`:

```tsx
'use client'

// Picker A (spec §8.2): choose the action type first; the list shows only its candidates.

import { useState } from 'react'
import { ACTION_TYPES, ACTION_TYPE_LABELS, type ActionType } from '@/models/types'
import CandidateTable from './CandidateTable'
import type { CandidateRow } from './candidates'
import { setManyIn, toggleIn, type PickerProps } from './pickerTypes'

export default function PickerTypeFirst({ rows, inPlan, onAdd, timeLabel }: PickerProps) {
  const [type, setType] = useState<ActionType>('start')
  const [ticked, setTicked] = useState<Set<string>>(new Set())

  const list = rows.filter(r => r.qualifies.includes(type))
  const blockedReason = (r: CandidateRow) => {
    const planned = inPlan.get(r.bmUnitId)
    return planned ? `in plan as ${ACTION_TYPE_LABELS[planned]}` : null
  }

  function add() {
    onAdd([...ticked].map(bmUnitId => ({ bmUnitId, actionType: type })))
    setTicked(new Set())
  }

  return (
    <>
      <div className="schedule-section-head">
        <label className="settle-select">
          <span className="settle-label">Action</span>
          <select value={type} onChange={e => { setType(e.target.value as ActionType); setTicked(new Set()) }}>
            {ACTION_TYPES.map(t => <option key={t} value={t}>{ACTION_TYPE_LABELS[t]}</option>)}
          </select>
        </label>
        <span className="schedule-hint">{list.length} units qualify at {timeLabel}</span>
        <span className="schedule-spacer" />
        <button className="btn btn-primary" disabled={ticked.size === 0} onClick={add}>
          Add {ticked.size} as {ACTION_TYPE_LABELS[type]} ↓
        </button>
      </div>
      <CandidateTable
        rows={list}
        changeType={type}
        ticked={ticked}
        onToggle={id => setTicked(t => toggleIn(t, id))}
        onSetTicked={(ids, on) => setTicked(t => setManyIn(t, ids, on))}
        blockedReason={blockedReason}
        emptyText={`No units qualify for ${ACTION_TYPE_LABELS[type]} at ${timeLabel}`}
      />
    </>
  )
}
```

- [ ] **Step 2: Picker B — units first**

Create `src/components/schedule/PickerUnitsFirst.tsx`:

```tsx
'use client'

// Picker B (spec §8.2): pick from every unit, then choose the action; units the action
// doesn't apply to are skipped with a notice.

import { useRef, useState } from 'react'
import { ACTION_TYPES, ACTION_TYPE_LABELS, type ActionType } from '@/models/types'
import { usePopoverDismiss } from '@/components/GspFilterPopover'
import CandidateTable from './CandidateTable'
import type { CandidateRow } from './candidates'
import { setManyIn, toggleIn, type PickerProps } from './pickerTypes'

function ActionMenu({ tickedRows, onChoose, onClose, wrapperRef }: {
  tickedRows: CandidateRow[]
  onChoose: (type: ActionType) => void
  onClose: () => void
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, wrapperRef, onClose)
  return (
    <div ref={ref} className="schedule-menu" role="menu">
      {ACTION_TYPES.map(t => {
        const n = tickedRows.filter(r => r.qualifies.includes(t)).length
        return (
          <button key={t} role="menuitem" disabled={n === 0} onClick={() => onChoose(t)}>
            {ACTION_TYPE_LABELS[t]} ({n} of {tickedRows.length})
          </button>
        )
      })}
    </div>
  )
}

export default function PickerUnitsFirst({ rows, inPlan, onAdd, timeLabel }: PickerProps) {
  const [ticked, setTicked] = useState<Set<string>>(new Set())
  const [menuOpen, setMenuOpen] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  const tickedRows = rows.filter(r => ticked.has(r.bmUnitId))
  const blockedReason = (r: CandidateRow) => {
    const planned = inPlan.get(r.bmUnitId)
    return planned ? `in plan as ${ACTION_TYPE_LABELS[planned]}` : null
  }

  function choose(type: ActionType) {
    const applies = tickedRows.filter(r => r.qualifies.includes(type))
    const skipped = tickedRows.filter(r => !r.qualifies.includes(type))
    onAdd(applies.map(r => ({ bmUnitId: r.bmUnitId, actionType: type })))
    setNotice(skipped.length > 0
      ? `${ACTION_TYPE_LABELS[type]}: skipped ${skipped.map(r => r.nationalGridBmUnit).join(', ')} (doesn't apply)`
      : null)
    setTicked(new Set())
    setMenuOpen(false)
  }

  return (
    <>
      <div className="schedule-section-head">
        <span className="schedule-hint">{rows.length} units at {timeLabel} · {ticked.size} selected</span>
        <span className="schedule-spacer" />
        <div ref={wrapperRef} style={{ position: 'relative' }}>
          <button className="btn btn-primary" disabled={ticked.size === 0} onClick={() => setMenuOpen(o => !o)}>
            Action ▾
          </button>
          {menuOpen && (
            <ActionMenu tickedRows={tickedRows} onChoose={choose} onClose={() => setMenuOpen(false)} wrapperRef={wrapperRef} />
          )}
        </div>
      </div>
      {notice && <div className="schedule-notice">⚠ {notice}</div>}
      <CandidateTable
        rows={rows}
        showState
        ticked={ticked}
        onToggle={id => setTicked(t => toggleIn(t, id))}
        onSetTicked={(ids, on) => setTicked(t => setManyIn(t, ids, on))}
        blockedReason={blockedReason}
        emptyText={`No units qualify for any action at ${timeLabel}`}
      />
    </>
  )
}
```

- [ ] **Step 3: Picker C — type tabs and basket**

Create `src/components/schedule/PickerTabs.tsx`:

```tsx
'use client'

// Picker C (spec §8.2): one tab per action type; ticks from every tab collect in one basket.

import { useState } from 'react'
import { ACTION_TYPES, ACTION_TYPE_LABELS, type ActionType } from '@/models/types'
import CandidateTable from './CandidateTable'
import type { CandidateRow } from './candidates'
import type { PickerProps } from './pickerTypes'

export default function PickerTabs({ rows, inPlan, onAdd, timeLabel }: PickerProps) {
  const [tab, setTab] = useState<ActionType>('start')
  const [basket, setBasket] = useState<Map<string, ActionType>>(new Map())

  const list = rows.filter(r => r.qualifies.includes(tab))
  const ticked = new Set([...basket].filter(([, t]) => t === tab).map(([id]) => id))

  const blockedReason = (r: CandidateRow) => {
    const planned = inPlan.get(r.bmUnitId)
    if (planned) return `in plan as ${ACTION_TYPE_LABELS[planned]}`
    const inBasket = basket.get(r.bmUnitId)
    if (inBasket && inBasket !== tab) return `in basket as ${ACTION_TYPE_LABELS[inBasket]}`
    return null
  }

  function toggle(id: string) {
    setBasket(prev => {
      const next = new Map(prev)
      if (next.get(id) === tab) next.delete(id)
      else next.set(id, tab)
      return next
    })
  }

  function setMany(ids: string[], on: boolean) {
    setBasket(prev => {
      const next = new Map(prev)
      for (const id of ids) {
        if (on) next.set(id, tab)
        else if (next.get(id) === tab) next.delete(id)
      }
      return next
    })
  }

  function addBasket() {
    onAdd([...basket].map(([bmUnitId, actionType]) => ({ bmUnitId, actionType })))
    setBasket(new Map())
  }

  const basketCounts = ACTION_TYPES
    .map(t => ({ t, n: [...basket.values()].filter(v => v === t).length }))
    .filter(x => x.n > 0)

  return (
    <>
      <div className="schedule-section-head">
        <div className="tab-bar" style={{ border: 'none', padding: 0 }}>
          {ACTION_TYPES.map(t => (
            <button key={t} className={`tab-btn${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {ACTION_TYPE_LABELS[t]} ({rows.filter(r => r.qualifies.includes(t)).length})
            </button>
          ))}
        </div>
        <span className="schedule-spacer" />
        <span className="schedule-hint">
          Basket: {basketCounts.length === 0 ? 'empty' : basketCounts.map(x => `${x.n} ${ACTION_TYPE_LABELS[x.t]}`).join(' · ')}
        </span>
        <button className="btn btn-primary" disabled={basket.size === 0} onClick={addBasket}>
          Add basket to plan ({basket.size}) ↓
        </button>
      </div>
      <CandidateTable
        rows={list}
        changeType={tab}
        ticked={ticked}
        onToggle={toggle}
        onSetTicked={setMany}
        blockedReason={blockedReason}
        emptyText={`No units qualify for ${ACTION_TYPE_LABELS[tab]} at ${timeLabel}`}
      />
    </>
  )
}
```

- [ ] **Step 4: Type-check and commit**

Run: `npx tsc --noEmit` (expected: no output), then:

```bash
git add src/components/schedule/PickerTypeFirst.tsx src/components/schedule/PickerUnitsFirst.tsx src/components/schedule/PickerTabs.tsx
git commit -m "feat(schedule): pickers A (type first), B (units first), C (tabs + basket)"
```

---

### Task 11: Working plan summary and commit modal

**Files:**
- Create: `src/components/schedule/WorkingPlanSummary.tsx`
- Create: `src/components/schedule/CommitPlanModal.tsx`

- [ ] **Step 1: Create `WorkingPlanSummary.tsx`**

```tsx
'use client'

// Working plan summary (spec §8.3): per-type MW totals, worst margin before → after, and one
// editable row per action.

import { useMemo } from 'react'
import type {
  ActionType, AreaRequirementRow, BMUnit, ModellingAction, OperationType, SettlementPeriodData,
  WorkingPlanAction, WorkingPlanPatch,
} from '@/models/types'
import { ACTION_TYPES, OPERATION_TYPE_LABELS } from '@/models/types'
import { actionTypeOf, changeMw, covers } from '@/utils/actionEffects'
import { applyDraftToBaseline } from '@/utils/margin'
import { ActionChip, REASON_LABEL, describeChange, fmtMw, slotLabel } from './scheduleUi'

const OPERATION_TYPES = Object.keys(OPERATION_TYPE_LABELS) as OperationType[]
const REASON_CODES = Object.keys(REASON_LABEL) as ModellingAction['reasonCode'][]
const DIMMED_OUTPUT: Record<ActionType, string> = { start: '', deload: 'SEL', desync: '0', capacity: '—' }

interface Props {
  plan: WorkingPlanAction[]
  settlementPeriods: SettlementPeriodData[]
  units: BMUnit[]
  promotedActions: ModellingAction[]
  planWindow: { fromPeriod: number; toPeriod: number }
  reservePct: number
  generalReserveRequirements: AreaRequirementRow[]
  onUpdate: (bmUnitId: string, patch: WorkingPlanPatch) => void
  onRemove: (bmUnitId: string) => void
  onClear: () => void
  onApplyWindowToAll: () => void
  onCommit: () => void
}

export default function WorkingPlanSummary({
  plan, settlementPeriods, units, promotedActions, planWindow, reservePct, generalReserveRequirements,
  onUpdate, onRemove, onClear, onApplyWindowToAll, onCommit,
}: Props) {
  const unitById = useMemo(() => new Map(units.map(u => [u.bmUnitId, u])), [units])
  const spBySlot = useMemo(() => new Map(settlementPeriods.map(sp => [sp.settlementPeriod, sp])), [settlementPeriods])

  const totals = useMemo(() => {
    const t: Record<ActionType, number> = { start: 0, deload: 0, desync: 0, capacity: 0 }
    for (const a of plan) {
      const sp = spBySlot.get(a.fromPeriod)
      if (sp) t[actionTypeOf(a)] += changeMw(actionTypeOf(a), a.bmUnitId, sp, unitById.get(a.bmUnitId))
    }
    return t
  }, [plan, spBySlot, unitById])

  // Worst EMX − TR2 over the Schedule window, without and with the plan (same TR2 as MarginChart).
  const worst = useMemo(() => {
    const genReq = new Map(generalReserveRequirements.map(r => [r.sp, r.requirement]))
    let before = Infinity, after = Infinity
    for (const sp of settlementPeriods) {
      const n = sp.settlementPeriod
      if (n < planWindow.fromPeriod || n > planWindow.toPeriod) continue
      const tr2 = sp.demand * (1 + reservePct / 100) + (genReq.get(n) ?? 0)
      const alreadyModelled = new Set<string>()
      for (const [u, pn] of Object.entries(sp.pn)) if (pn > 1) alreadyModelled.add(u)
      for (const a of promotedActions) if (covers(a, n)) alreadyModelled.add(a.bmUnitId)
      const withPlan = applyDraftToBaseline(sp, sp.emx, sp.eol, sp.emi, plan, alreadyModelled, units)
      before = Math.min(before, sp.emx - tr2)
      after = Math.min(after, withPlan.emx - tr2)
    }
    return Number.isFinite(before) ? { before, after } : null
  }, [settlementPeriods, planWindow, reservePct, generalReserveRequirements, promotedActions, plan, units])

  const slotOptions = settlementPeriods.map(sp => (
    <option key={sp.settlementPeriod} value={sp.settlementPeriod}>{slotLabel(sp.settlementPeriod, settlementPeriods)}</option>
  ))
  const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmtMw(Math.abs(n))}`

  return (
    <>
      <div className="schedule-section-head">
        <strong>Working plan</strong>
        <span className="schedule-hint">{plan.length} action{plan.length === 1 ? '' : 's'}</span>
        {ACTION_TYPES.filter(t => plan.some(a => actionTypeOf(a) === t)).map(t => (
          <span key={t} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <ActionChip type={t} /> <span className="mono">{signed(totals[t])} MW</span>
          </span>
        ))}
        {worst && plan.length > 0 && (
          <span className="schedule-hint">
            Worst margin in window: {signed(worst.before)} → <strong style={{ color: worst.after < 0 ? '#ef4444' : '#22c55e' }}>{signed(worst.after)} MW</strong>
          </span>
        )}
        <span className="schedule-spacer" />
        <button className="btn btn-ghost" disabled={plan.length === 0} onClick={onApplyWindowToAll}>Apply window to all</button>
        <button className="btn btn-ghost" disabled={plan.length === 0} onClick={onClear}>Clear</button>
        <button className="btn btn-primary" disabled={plan.length === 0} onClick={onCommit}>Commit…</button>
      </div>

      {plan.length === 0 ? (
        <div className="workspace-empty" style={{ padding: 24 }}>
          <p>No actions yet. Select units above and add them.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>BMU</th><th>Action</th><th>Change</th><th>From</th><th>To</th>
                <th>Output</th><th>Reason</th><th>Event</th><th>Note</th><th />
              </tr>
            </thead>
            <tbody>
              {plan.map(a => {
                const type = actionTypeOf(a)
                const unit = unitById.get(a.bmUnitId)
                const name = unit?.nationalGridBmUnit ?? a.bmUnitId
                return (
                  <tr key={a.bmUnitId}>
                    <td>
                      <div className="bmu-cell-inner">
                        <span>{name}</span>
                        <span className="site-sub">{unit?.gspGroup ?? ''}</span>
                      </div>
                    </td>
                    <td><ActionChip type={type} /></td>
                    <td className="mono">{describeChange(a, spBySlot.get(a.fromPeriod), unit)}</td>
                    <td>
                      <select className="reason-select" value={a.fromPeriod}
                        onChange={e => onUpdate(a.bmUnitId, { fromPeriod: Number(e.target.value) })}>
                        {slotOptions}
                      </select>
                    </td>
                    <td>
                      <select className="reason-select" value={a.toPeriod ?? ''}
                        onChange={e => onUpdate(a.bmUnitId, { toPeriod: e.target.value === '' ? undefined : Number(e.target.value) })}>
                        <option value="">—</option>
                        {slotOptions}
                      </select>
                    </td>
                    <td>
                      {type === 'start' ? (
                        <input type="number" className="reason-select" style={{ width: 80 }} min={0} value={a.outputLevel}
                          onChange={e => { const v = Number(e.target.value); if (!Number.isNaN(v)) onUpdate(a.bmUnitId, { outputLevel: Math.max(0, v) }) }} />
                      ) : (
                        <span style={{ color: 'var(--text-faint)' }}>{DIMMED_OUTPUT[type]}</span>
                      )}
                    </td>
                    <td>
                      <select className="reason-select" value={a.reasonCode}
                        onChange={e => onUpdate(a.bmUnitId, { reasonCode: e.target.value as ModellingAction['reasonCode'] })}>
                        {REASON_CODES.map(r => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td>
                      <select className="reason-select" value={a.operationType ?? ''}
                        onChange={e => onUpdate(a.bmUnitId, { operationType: e.target.value === '' ? undefined : e.target.value as OperationType })}>
                        <option value="">—</option>
                        {OPERATION_TYPES.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                    </td>
                    <td>
                      <input className="reason-select" placeholder="Note" value={a.note ?? ''}
                        onChange={e => onUpdate(a.bmUnitId, { note: e.target.value })} />
                    </td>
                    <td>
                      <button className="btn btn-ghost" aria-label={`Remove ${name}`} onClick={() => onRemove(a.bmUnitId)}>✕</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
```

- [ ] **Step 2: Create `CommitPlanModal.tsx`**

```tsx
'use client'

// Commit dialog for the working plan (spec §8.3). Same look as ConfirmModal.

import { useEffect, useState } from 'react'

interface Props {
  actionCount: number
  onCommit: (name: string, description: string) => void
  onCancel: () => void
}

export default function CommitPlanModal({ actionCount, onCommit, onCancel }: Props) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const canCommit = name.trim().length > 0

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onCancel}
    >
      <form
        onClick={e => e.stopPropagation()}
        onSubmit={e => { e.preventDefault(); if (canCommit) onCommit(name.trim(), description.trim()) }}
        style={{
          background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-pop)', padding: '20px 22px 16px', width: 380,
          display: 'flex', flexDirection: 'column', gap: 12,
        }}
      >
        <p style={{ margin: 0, fontSize: 13.5, color: 'var(--text)', fontWeight: 600 }}>
          Commit {actionCount} action{actionCount === 1 ? '' : 's'}
        </p>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
          Name
          <input className="reason-select" autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Evening margin cover" />
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
          Description
          <textarea className="reason-select" rows={3} value={description} onChange={e => setDescription(e.target.value)} />
        </label>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={!canCommit}>Commit</button>
        </div>
      </form>
    </div>
  )
}
```

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit` (expected: no output), then:

```bash
git add src/components/schedule/WorkingPlanSummary.tsx src/components/schedule/CommitPlanModal.tsx
git commit -m "feat(schedule): working plan summary and commit dialog"
```

---

### Task 12: Config tweaks

**Files:**
- Modify: `src/components/ConfigPanel.tsx`
- Modify: `src/app/page.tsx` (tweak defaults only)

- [ ] **Step 1: Extend `TweakState`**

In `src/components/ConfigPanel.tsx`, add two fields to `TweakState` after `chartInteractionMode`:

```ts
  schedulePicker: 'typeFirst' | 'unitsFirst' | 'tabs'   // Schedule tab candidate picker (A/B/C)
  solveDestination: 'workspace' | 'schedule'            // where Solve ↗ takes the operator
```

- [ ] **Step 2: Add the controls to the Tweaks tab**

In `TweaksTab`, directly after the Chart `SegControl` (the one whose `onChange` sets `chartInteractionMode`) and before the closing `</div>` of `twk-body`, add:

```tsx
      <div className="twk-sect">Scheduling picker</div>
      <SegControl
        value={tweaks.schedulePicker}
        options={[
          { value: 'typeFirst',  label: 'A · Type first' },
          { value: 'unitsFirst', label: 'B · Units first' },
          { value: 'tabs',       label: 'C · Tabs' },
        ]}
        onChange={v => onChangeTweak('schedulePicker', v)}
      />

      <div className="twk-sect">Solve ↗ goes to</div>
      <SegControl
        value={tweaks.solveDestination}
        options={[
          { value: 'workspace', label: 'Workspace' },
          { value: 'schedule',  label: 'Schedule' },
        ]}
        onChange={v => onChangeTweak('solveDestination', v)}
      />
```

- [ ] **Step 3: Add defaults in `page.tsx`**

In `src/app/page.tsx`, in the `useState<TweakState>({ ... })` initialiser, add after `chartInteractionMode: 'twoClick',`:

```ts
    schedulePicker: 'tabs',
    solveDestination: 'schedule',
```

- [ ] **Step 4: Check for other `TweakState` literals**

Run: `grep -rn "chartInteractionMode:" src`
Expected: the `TweakState` definition and the `page.tsx` initialiser. If any other file builds a full `TweakState` object (for example the unused `TweaksPanel.tsx`), add the same two defaults there so `tsc` passes.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` (expected: no output), then:

```bash
git add src/components/ConfigPanel.tsx src/app/page.tsx
git commit -m "feat(schedule): Config tweaks for picker and Solve destination"
```

---

### Task 13: Schedule tab frame

**Files:**
- Create: `src/components/schedule/ScheduleTab.tsx`

- [ ] **Step 1: Create `ScheduleTab.tsx`**

```tsx
'use client'

// Schedule tab (spec §8.1): window + filters, the configured candidate picker, and the
// working plan summary. Reads store data directly, like MarginChart.

import { useMemo, useRef, useState } from 'react'
import { useModellingStore } from '@/store/useModellingStore'
import type { ModellingAction, WorkingPlanAction } from '@/models/types'
import type { TweakState } from '@/components/ConfigPanel'
import { ScenarioPopover } from '@/components/DraftDetails'
import { GspFilterPopover } from '@/components/GspFilterPopover'
import { SCENARIOS } from '@/config/scenarios'
import { actionTypeOf } from '@/utils/actionEffects'
import { buildCandidateRows } from './candidates'
import type { PickerProps } from './pickerTypes'
import { fmtMw, slotLabel } from './scheduleUi'
import PickerTypeFirst from './PickerTypeFirst'
import PickerUnitsFirst from './PickerUnitsFirst'
import PickerTabs from './PickerTabs'
import WorkingPlanSummary from './WorkingPlanSummary'
import CommitPlanModal from './CommitPlanModal'

const EMPTY_PLAN: WorkingPlanAction[] = []

interface Props {
  picker: TweakState['schedulePicker']
  scenario: string
  onScenarioChange: (s: string) => void
  gspFilter: Record<string, 'include' | 'exclude'>
  onGspFilterChange: (f: Record<string, 'include' | 'exclude'>) => void
  voltageArea: string
  reservePct: number
  reasonCode: ModellingAction['reasonCode']
  solveMw: number | null
  showOnCharts: boolean
  onToggleShowOnCharts: () => void
  onWindowEdited: () => void
  onAdded: (count: number) => void
  onCommitted: (name: string) => void
}

export default function ScheduleTab({
  picker, scenario, onScenarioChange, gspFilter, onGspFilterChange, voltageArea, reservePct, reasonCode,
  solveMw, showOnCharts, onToggleShowOnCharts, onWindowEdited, onAdded, onCommitted,
}: Props) {
  const units             = useModellingStore(s => s.units)
  const settlementPeriods = useModellingStore(s => s.settlementPeriods)
  const drafts            = useModellingStore(s => s.drafts)
  const areaRequirements  = useModellingStore(s => s.areaRequirements)
  const plan              = useModellingStore(s => s.workingPlans[s.currentUser]) ?? EMPTY_PLAN
  const planWindow        = useModellingStore(s => s.workingPlanWindow)
  const setPlanWindow     = useModellingStore(s => s.setWorkingPlanWindow)
  const addToWorkingPlan  = useModellingStore(s => s.addToWorkingPlan)
  const updateAction      = useModellingStore(s => s.updateWorkingPlanAction)
  const removeAction      = useModellingStore(s => s.removeFromWorkingPlan)
  const clearPlan         = useModellingStore(s => s.clearWorkingPlan)
  const applyWindowToAll  = useModellingStore(s => s.applyWindowToAll)
  const commitWorkingPlan = useModellingStore(s => s.commitWorkingPlan)

  const [scenarioOpen, setScenarioOpen] = useState(false)
  const [gspOpen, setGspOpen] = useState(false)
  const [committing, setCommitting] = useState(false)
  const scenarioWrapRef = useRef<HTMLDivElement>(null)
  const gspWrapRef = useRef<HTMLDivElement>(null)

  const promotedActions = useMemo(
    () => drafts.filter(d => d.status === 'promoted').flatMap(d => d.actions),
    [drafts],
  )
  const promotedUnitIds = useMemo(() => new Set(promotedActions.map(a => a.bmUnitId)), [promotedActions])
  const firstSp = settlementPeriods.find(sp => sp.settlementPeriod === planWindow.fromPeriod)
  const rows = useMemo(
    () => buildCandidateRows({ units, sp: firstSp, promotedUnitIds, gspFilter, scenario, voltageArea }),
    [units, firstSp, promotedUnitIds, gspFilter, scenario, voltageArea],
  )
  const inPlan = useMemo(() => new Map(plan.map(a => [a.bmUnitId, actionTypeOf(a)])), [plan])

  if (settlementPeriods.length === 0) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading system data…</div>
  }

  const timeLabel = slotLabel(planWindow.fromPeriod, settlementPeriods)
  const scenarioName = SCENARIOS.find(s => s.id === scenario)?.name ?? 'None'
  const gspIncludes = Object.values(gspFilter).filter(v => v === 'include').length
  const gspExcludes = Object.values(gspFilter).filter(v => v === 'exclude').length

  function changeFrom(v: number) {
    setPlanWindow(v, Math.max(v, planWindow.toPeriod))
    onWindowEdited()
  }
  function changeTo(v: number) {
    setPlanWindow(Math.min(v, planWindow.fromPeriod), v)
    onWindowEdited()
  }

  const pickerProps: PickerProps = {
    rows,
    inPlan,
    timeLabel,
    onAdd: items => {
      const n = addToWorkingPlan(items, reasonCode)
      if (n > 0) onAdded(n)
    },
  }

  return (
    <div className="schedule-tab">
      <div className="schedule-bar">
        <label className="settle-select">
          <span className="settle-label">From</span>
          <select value={planWindow.fromPeriod} onChange={e => changeFrom(Number(e.target.value))}>
            {settlementPeriods.map(sp => (
              <option key={sp.settlementPeriod} value={sp.settlementPeriod}>{slotLabel(sp.settlementPeriod, settlementPeriods)}</option>
            ))}
          </select>
        </label>
        <span className="time-arrow">→</span>
        <label className="settle-select">
          <span className="settle-label">To</span>
          <select value={planWindow.toPeriod} onChange={e => changeTo(Number(e.target.value))}>
            {settlementPeriods.map(sp => (
              <option key={sp.settlementPeriod} value={sp.settlementPeriod}>{slotLabel(sp.settlementPeriod, settlementPeriods)}</option>
            ))}
          </select>
        </label>
        {solveMw !== null && <span className="schedule-shortfall">{fmtMw(solveMw)} MW shortfall</span>}

        <div ref={scenarioWrapRef} style={{ position: 'relative' }}>
          <button className="btn btn-ghost" onClick={() => setScenarioOpen(o => !o)}>Scenario ▾ {scenarioName}</button>
          {scenarioOpen && (
            <ScenarioPopover scenario={scenario} onChange={onScenarioChange} onClose={() => setScenarioOpen(false)} wrapperRef={scenarioWrapRef} />
          )}
        </div>
        <div ref={gspWrapRef} style={{ position: 'relative' }}>
          <button className="btn btn-ghost" onClick={() => setGspOpen(o => !o)}>
            GSP ▾{gspIncludes > 0 ? ` +${gspIncludes}` : ''}{gspExcludes > 0 ? ` −${gspExcludes}` : ''}
          </button>
          {gspOpen && (
            <GspFilterPopover gspFilter={gspFilter} onChange={onGspFilterChange} onClose={() => setGspOpen(false)} wrapperRef={gspWrapRef} />
          )}
        </div>

        <span className="schedule-spacer" />
        <label className="schedule-hint" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={showOnCharts} onChange={onToggleShowOnCharts} /> Show on charts
        </label>
      </div>

      <section className="schedule-section">
        {picker === 'typeFirst' && <PickerTypeFirst {...pickerProps} />}
        {picker === 'unitsFirst' && <PickerUnitsFirst {...pickerProps} />}
        {picker === 'tabs' && <PickerTabs {...pickerProps} />}
      </section>

      <section className="schedule-section">
        <WorkingPlanSummary
          plan={plan}
          settlementPeriods={settlementPeriods}
          units={units}
          promotedActions={promotedActions}
          planWindow={planWindow}
          reservePct={reservePct}
          generalReserveRequirements={areaRequirements['general_reserve'] ?? []}
          onUpdate={updateAction}
          onRemove={removeAction}
          onClear={clearPlan}
          onApplyWindowToAll={applyWindowToAll}
          onCommit={() => setCommitting(true)}
        />
      </section>

      {committing && (
        <CommitPlanModal
          actionCount={plan.length}
          onCancel={() => setCommitting(false)}
          onCommit={(name, description) => {
            commitWorkingPlan(name, description)
            setCommitting(false)
            onCommitted(name)
          }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Check the `GspFilterPopover` props match**

Run: `sed -n 30,40p src/components/GspFilterPopover.tsx`
Expected: props `{ gspFilter, onChange, onClose, wrapperRef }`, with `onChange` taking the full filter record. If the names differ, adjust the `<GspFilterPopover ... />` call to match. Do not change `GspFilterPopover.tsx`.

- [ ] **Step 3: Type-check and commit**

Run: `npx tsc --noEmit` (expected: no output), then:

```bash
git add src/components/schedule/ScheduleTab.tsx
git commit -m "feat(schedule): Schedule tab frame"
```

---

### Task 14: Wire the Schedule tab into `page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Imports**

After `import ConstraintsDetailPage from '@/components/ConstraintsDetailPage'`, add:

```ts
import ScheduleTab from '@/components/schedule/ScheduleTab'
import { workingPlanAsDraft, workingPlanDraftId } from '@/utils/workingPlan'
```

- [ ] **Step 2: Tab type**

Change the `Tab` union to include `'schedule'`:

```ts
type Tab = 'dashboard' | 'dashboard2' | 'constraints' | 'workspace' | 'schedule' | 'chart' | 'promoted' | 'redeclare' | 'graph' | 'requirements'
```

- [ ] **Step 3: Store reads**

After `const setAllAreaThresholds = useModellingStore(s => s.setAllAreaThresholds)`, add:

```ts
  const workingPlans          = useModellingStore(s => s.workingPlans)
  const setWorkingPlanWindow  = useModellingStore(s => s.setWorkingPlanWindow)
```

- [ ] **Step 4: Solve routing**

Replace `handleSolveNavigate` with:

```ts
  const handleSolveNavigate = useCallback(() => {
    if (!solveTarget) return
    setSolvePanelVisible(false)
    setClearSelectionKey(k => k + 1)
    setScenario(getArea(activeAreaTab).defaultScenario)
    if (tweaks.solveDestination === 'schedule') {
      setWorkingPlanWindow(solveTarget.fromSp, solveTarget.toSp)
      setActiveTab('schedule')
      return
    }
    const draftId = createDraft()
    updateDraftWindow(draftId, solveTarget.fromSp, solveTarget.toSp)
    setActiveTab('workspace')
  }, [solveTarget, createDraft, updateDraftWindow, setScenario, activeAreaTab, tweaks.solveDestination, setWorkingPlanWindow])
```

- [ ] **Step 5: Working plan overlay for `AreaChart`**

After the `promotedUnitIds` `useMemo`, add:

```ts
  // The current operator's working plan, drawn like a draft on AreaChart (spec §8.4).
  const draftsWithWorkingPlan = useMemo(() => {
    const wp = workingPlanAsDraft(workingPlans[currentUser], currentUser)
    return wp ? [...drafts, wp] : drafts
  }, [drafts, workingPlans, currentUser])
```

In the Chart tab's `<AreaChart ... />`, change `drafts={drafts}` to `drafts={draftsWithWorkingPlan}`. Leave every other `drafts={drafts}` prop (sidebar, Promoted, Redeclare) unchanged.

- [ ] **Step 6: Tab button**

In the tab bar, directly after the Workspace button, add:

```tsx
          <button
            className={`tab-btn${activeTab === 'schedule' ? ' active' : ''}`}
            onClick={() => setActiveTab('schedule')}
          >
            Schedule
          </button>
```

- [ ] **Step 7: Render the tab**

Directly before the `{/* Workspace tab */}` comment, add:

```tsx
        {/* Schedule tab — Scheduling Actions (Docs/superpowers/specs/2026-11-21-scheduling-actions-design.md) */}
        {activeTab === 'schedule' && (
          <ScheduleTab
            picker={tweaks.schedulePicker}
            scenario={scenario}
            onScenarioChange={setScenario}
            gspFilter={gspFilter}
            onGspFilterChange={setGspFilter}
            voltageArea={voltageArea}
            reservePct={tweaks.reservePct}
            reasonCode={SCENARIO_REASON[scenario] ?? 'MARGIN'}
            solveMw={solveTarget?.adjustedMw ?? null}
            showOnCharts={!hiddenDraftIds.has(workingPlanDraftId(currentUser))}
            onToggleShowOnCharts={() => toggleDraftChartVisibility(workingPlanDraftId(currentUser))}
            onWindowEdited={() => setSolveTarget(null)}
            onAdded={n => flashToast(n === 1 ? 'Added 1 action' : `Added ${n} actions`)}
            onCommitted={name => { setSolveTarget(null); flashToast(`Committed "${name}"`) }}
          />
        )}
```

Check the name of the sidebar visibility toggle first: `grep -n "const toggleDraftChartVisibility" src/app/page.tsx`. If it has a different name, use that name.

- [ ] **Step 8: Type-check, test and build**

Run: `npx tsc --noEmit && npm run test:actions && npm run test:dashboard2 && npm run build`
Expected: no type errors, `ℹ fail 0` twice, and the build ends with the route table (`○ /`).

- [ ] **Step 9: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(schedule): Schedule tab, Solve routing and area chart overlay"
```

---

### Task 15: Working plan overlay on MarginChart and Dashboard 2

**Files:**
- Modify: `src/components/MarginChart.tsx`
- Modify: `src/dashboard2/data/realAdapters.ts`
- Modify: `src/dashboard2/components/OperationalDashboard.tsx`

- [ ] **Step 1: MarginChart store reads**

In `MarginChart.tsx`, add the import:

```ts
import { workingPlanAsDraft } from '@/utils/workingPlan'
```

Directly after `const units = useModellingStore(state => state.units)`, add (these must stay above the early `return` — hooks-order rule in `CLAUDE.md`):

```ts
  const workingPlans      = useModellingStore(state => state.workingPlans)
  const currentUser       = useModellingStore(state => state.currentUser)
```

- [ ] **Step 2: MarginChart overlay list**

Replace the line:

```ts
  const activeDrafts = drafts.filter(d => d.status === 'draft' && !hiddenDraftIds.has(d.id))
```

with:

```ts
  // Drafts plus the current operator's working plan (spec §8.4), minus anything hidden.
  const workingPlanDraft = workingPlanAsDraft(workingPlans[currentUser], currentUser)
  const overlaySource = workingPlanDraft ? [...drafts, workingPlanDraft] : drafts
  const activeDrafts = overlaySource.filter(d => d.status === 'draft' && !hiddenDraftIds.has(d.id))
```

- [ ] **Step 3: Dashboard 2 context**

In `src/dashboard2/data/realAdapters.ts`, add the import after `import { applyDraftToAreaBaseline } from '@/utils/areaAggregates'`:

```ts
import { workingPlanAsDraft } from '@/utils/workingPlan'
```

Replace `readRealContext` with:

```ts
export function readRealContext(reservePct: number, nowMs: number, hiddenDraftIds: ReadonlySet<string>): RealContext {
  const { settlementPeriods, areaRequirements, units, drafts, workingPlans, currentUser } = useModellingStore.getState()
  // The current operator's working plan overlays like a draft (Scheduling Actions spec §8.4).
  const workingPlanDraft = workingPlanAsDraft(workingPlans[currentUser], currentUser)
  const overlaySource = workingPlanDraft ? [...drafts, workingPlanDraft] : drafts
  return {
    settlementPeriods, areaRequirements, reservePct, nowMs, units,
    // Same draft set as MarginChart / AreaChart: every 'draft'-status plan the sidebar has not hidden.
    overlayDrafts: overlaySource.filter(d => d.status === 'draft' && !hiddenDraftIds.has(d.id)),
    promotedActions: drafts.filter(d => d.status === 'promoted').flatMap(d => d.actions),
  }
}
```

- [ ] **Step 4: Dashboard 2 refetch on plan edits**

In `src/dashboard2/components/OperationalDashboard.tsx`, after `const units = useModellingStore(s => s.units)` add:

```ts
  const workingPlans = useModellingStore(s => s.workingPlans)
```

and add `workingPlans` to both the object and the dependency array of the `refreshKey` `useMemo`:

```ts
  const refreshKey = useMemo(
    () => ({ settlementPeriods, areaRequirements, reservePct, areaSources, drafts, units, hiddenDraftIds, workingPlans }),
    [settlementPeriods, areaRequirements, reservePct, areaSources, drafts, units, hiddenDraftIds, workingPlans],
  )
```

- [ ] **Step 5: Type-check, test, build**

Run: `npx tsc --noEmit && npm run test:actions && npm run test:dashboard2 && npm run build`
Expected: all pass, build prints the route table.

- [ ] **Step 6: Commit**

```bash
git add src/components/MarginChart.tsx src/dashboard2/data/realAdapters.ts src/dashboard2/components/OperationalDashboard.tsx
git commit -m "feat(schedule): working plan overlay on Margin chart and Dashboard 2"
```

---

### Task 16: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Correct the MELS fact**

Replace the section `### MELS always returns empty from the public API` and its paragraph with:

```markdown
### MELS — app falls back to registered capacity
`fetchMELS` calls `/datasets/MELS?from=<day>&to=<day>`, which Elexon rejects (HTTP 400: ranges over 1 hour are not allowed), so the app always uses mock MELS = `registeredCapacity`. Real declared MEL exists but is too heavy for a page load: `/datasets/MELS/stream` is ~38 MB per day, `/balancing/physical/all?dataset=MELS` ~0.6 MB per SP. Kept as is on purpose (Scheduling Actions spec D4). Do not add logic that expects real MEL values.
```

- [ ] **Step 2: Add a Scheduling Actions section**

Add a new section after "## Deficit Solver" (before "## Draft Cost Calculation"):

```markdown
## Scheduling Actions (Schedule tab)

Spec: `Docs/superpowers/specs/2026-11-21-scheduling-actions-design.md`. Plan: `Docs/superpowers/plans/2026-11-21-scheduling-actions.md`.

- **Action types** (`ActionType` in `types.ts`): `start` (off unit runs at `outputLevel`), `deload` (running → SEL), `desync` (running → 0), `capacity` (MEL raised from PN to registered capacity). `ModellingAction.actionType` is optional; `undefined` = `start`, so every older draft keeps working. Always read it through `actionTypeOf()`.
- **`src/utils/actionEffects.ts`** (pure, no value imports, tested by `npm run test:actions`): `isCandidate`, `marginDelta`, `areaDelta`, `changeMw`, `covers`, `slotValues`. `computeAggregates`, `applyDraftToBaseline`, `computeAreaAvailabilities` and `applyDraftToAreaBaseline` call it. The "skip if already PN-committed / already modelled" rule applies to **Start only**. Area availability is clamped to ≥ 0.
- **Working plan**: `workingPlans[currentUser]` (Zustand, in memory, cleared by `clearAllDrafts`), `workingPlanWindow` for the Schedule tab. `commitWorkingPlan(name, description)` saves it as a draft and calls `promoteDraft`. It is drawn as a draft-shaped overlay with id `wp:<user>` (`src/utils/workingPlan.ts`) on MarginChart, AreaChart and Dashboard 2; "Show on charts" toggles that id in `hiddenDraftIds`.
- **Schedule tab** (`src/components/schedule/`): window + Scenario/GSP bar, one of three pickers (Config → Tweaks → Scheduling picker: A type first, B units first, C tabs + basket; default C), and `WorkingPlanSummary`. Candidates come from `buildCandidateRows` (window's first slot; excludes `EXCLUDED_FUEL_TYPES`, promoted units and GSP-filtered units) ranked by `scenarioScore` (`src/utils/scenarioRanking.ts`).
- **Solve ↗**: `TweakState.solveDestination` (`'schedule'` default, or `'workspace'`).
- Workspace and the draft sidebar are unchanged.
```

- [ ] **Step 3: Update the component map, state shape and running notes**

- In the "Running the App" code block, add the line: `npm run test:actions   # Scheduling Actions unit tests (node --test)`.
- In the "State — Zustand only" code block, add:
  ```ts
  workingPlans: Partial<Record<UserId, WorkingPlanAction[]>>  // Scheduling Actions working plan per operator
  workingPlanWindow: { fromPeriod: number; toPeriod: number }
  ```
- In the Component Map table, add rows:
  - `src/components/schedule/` — Schedule tab (Scheduling Actions): `ScheduleTab`, `PickerTypeFirst` / `PickerUnitsFirst` / `PickerTabs`, `CandidateTable`, `WorkingPlanSummary`, `CommitPlanModal`, `candidates.ts`, `scheduleUi.tsx`
  - `src/utils/actionEffects.ts` — per-type candidate rules and per-slot effects (pure)
  - `src/utils/workingPlan.ts` — working plan → draft-shaped overlay (pure)
  - `src/utils/scenarioRanking.ts` — `scenarioScore`, shared by AvailableTable and the Schedule pickers
- In the `page.tsx` row of the Component Map, add `Schedule` after `Workspace` in the tab order.
- In "Known Issues / Future Work", add: **Scheduling Actions effects are approximations** — Model capacity treats PN as the reduced MEL and adds on top of a baseline that already counts registered capacity; Desync subtracts from area availability that never included the unit (clamped at 0).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document Scheduling Actions and correct the MELS note"
```

---

### Task 17: Manual verification in the browser

**Files:** none.

- [ ] **Step 1: Start the app**

Run: `npm run dev` and open http://localhost:3000. Wait for data to load.

- [ ] **Step 2: Picker C (default)**

1. Open the **Schedule** tab. Set From/To to cover the next few hours.
2. On the Start tab, tick two units. Switch to the Deload to SEL tab and tick one. Switch to Desync and tick one, then Model capacity and tick one.
3. Check that a unit ticked on one tab is greyed "in basket as …" on the others.
4. Click **Add basket to plan**. Expected: a toast "Added 5 actions", five summary rows with green/amber/red/blue chips, per-type MW totals and a "Worst margin in window" figure.

- [ ] **Step 3: Edit and see overlays**

1. Change one row's From and To, and one Start row's Output.
2. Open **Chart** → Margin: a green dotted "Working plan" line covers the actions' windows. Switch the area to General Reserve: a dotted line is there too.
3. Open **Dashboard 2**: the +ve MARGIN row shows the dotted working plan line and the legend lists "Working plan".
4. Back on Schedule, untick **Show on charts**: the dotted lines disappear from Chart and Dashboard 2.

- [ ] **Step 4: Commit the plan**

Click **Commit…**, enter a name, confirm. Expected: toast `Committed "<name>"`, the summary empties, the committed units disappear from the candidate lists, the Margin chart's solid line moves, and the **Promoted** tab lists the new draft's units.

- [ ] **Step 5: Pickers A and B**

1. Config → Tweaks → Scheduling picker → **A**. On Schedule, choose "Desync" in the Action select: only running units show, with a −MW column. Tick one, click **Add 1 as Desync**.
2. Switch to **B**. Tick one running and one off unit, open **Action ▾**: Deload shows "(1 of 2)" or "(0 of 2)" depending on SEL, Start shows "(1 of 2)". Choose Start: the off unit is added and a notice names the skipped running unit.

- [ ] **Step 6: Solve ↗ both ways**

1. On Chart → Margin, select a shortfall range and click **Solve ↗**. Expected (default `schedule`): the Schedule tab opens with From/To set to the range and a red "N MW shortfall" badge. Editing From clears the badge.
2. Config → Solve ↗ goes to → **Workspace**, repeat: the old Workspace flow opens with a new draft, as before.

- [ ] **Step 7: Existing flow regression**

In **Workspace**, create a draft, add two units, promote it. Expected: same behaviour as before this feature (solid line moves, Promoted tab lists them).

- [ ] **Step 8: Finish**

Stop the dev server. Use superpowers:finishing-a-development-branch to decide how to merge `feat/scheduling-actions`.
