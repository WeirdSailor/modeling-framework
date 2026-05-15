# Balancing Areas Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an 8-area system balance dashboard, per-area time-series charts with drag-to-solve, and a Requirements tab for entering 48 HH values per area — all overlaid on the existing workflow without touching existing components.

**Architecture:** New components (Dashboard, AreaChart, RequirementsTab) are wired into page.tsx alongside the existing tabs. A new utility `areaAggregates.ts` computes per-area availability from committed draft actions using simple contribution formulas. The Zustand store gains `areaRequirements` state and calls `computeAreaAvailabilities` at the same trigger points as the existing `refreshAggregates`. Margin uses its existing data path throughout.

**Tech Stack:** Next.js 16, React, Zustand, Recharts 3.x, TypeScript, inline SVG for sparklines.

---

## File Map

**Create:**
- `src/config/areas.ts` — `AreaId` type, `AREAS` config array, `getArea()` helper
- `src/utils/areaAggregates.ts` — `computeAreaAvailabilities`, `unitAreaContribution`, `applyDraftToAreaBaseline`, `computeAreaStatus`
- `src/components/RequirementsTab.tsx` — 48-row editable requirements table, area chip selector
- `src/components/Dashboard.tsx` — 8-area tile grid with sparklines, timeframe selector, A/B toggle
- `src/components/AreaChart.tsx` — Recharts chart for non-Margin areas with drag-to-solve

**Modify:**
- `src/models/types.ts` — extend `ModellingAction.reasonCode`, add `AreaRequirementRow`, add `areaAvailability` to `SettlementPeriodData`
- `src/store/useModellingStore.ts` — add `areaRequirements` state + actions, call `computeAreaAvailabilities` at all `refreshAggregates` trigger points
- `src/app/page.tsx` — add Dashboard + Requirements tabs, area subtab row on Chart tab, updated `handleSolveNavigate`
- `src/components/CommittedTab.tsx` — update `REASON_LABEL`, `REASON_COLORS`, `REASON_ORDER` for new codes

**Unchanged:** MarginChart.tsx, DraftSidebar.tsx, DraftDetails.tsx, AvailableTable.tsx, SelectedTable.tsx, RedeclareTab.tsx, GraphTab.tsx, ConfigPanel.tsx, elexon.ts, standingDataSync.ts, margin.ts, settlements.ts, fuelTypes.ts

---

## Task 1: Create feature branch

**Files:** none

- [ ] **Step 1: Create and switch to branch**

```bash
git checkout -b feature/balancing-areas-dashboard
```

Expected: `Switched to a new branch 'feature/balancing-areas-dashboard'`

- [ ] **Step 2: Verify clean state**

```bash
git status
```

Expected: `nothing to commit, working tree clean`

---

## Task 2: Create `src/config/areas.ts`

**Files:**
- Create: `src/config/areas.ts`

- [ ] **Step 1: Write the file**

```ts
import type { ScenarioId } from './scenarios'

export type AreaId =
  | 'margin'
  | 'recovery_reserve'
  | 'freq_control_reserve'
  | 'general_reserve'
  | 'contingency_reserve'
  | 'response'
  | 'inertia'
  | 'voltage'

export interface AreaConfig {
  id: AreaId
  name: string
  shortName: string
  unit: string
  defaultScenario: ScenarioId
  color: string
}

export const AREAS: AreaConfig[] = [
  { id: 'margin',                name: 'Margin',                    shortName: 'Margin',      unit: 'MW',   defaultScenario: 'margin',   color: '#94a3b8' },
  { id: 'recovery_reserve',      name: 'Recovery Reserve',          shortName: 'Recov. Res.', unit: 'MW',   defaultScenario: 'reserve',  color: '#6366f1' },
  { id: 'freq_control_reserve',  name: 'Freq. Control Reserve',     shortName: 'Freq. Ctrl.', unit: 'MW',   defaultScenario: 'reserve',  color: '#8b5cf6' },
  { id: 'general_reserve',       name: 'General Reserve',           shortName: 'Gen. Res.',   unit: 'MW',   defaultScenario: 'reserve',  color: '#06b6d4' },
  { id: 'contingency_reserve',   name: 'Contingency Reserve',       shortName: 'Conting.',    unit: 'MW',   defaultScenario: 'reserve',  color: '#0ea5e9' },
  { id: 'response',              name: 'Response',                  shortName: 'Response',    unit: 'MW',   defaultScenario: 'response', color: '#f97316' },
  { id: 'inertia',               name: 'Inertia',                   shortName: 'Inertia',     unit: 'GVAs', defaultScenario: 'inertia',  color: '#22c55e' },
  { id: 'voltage',               name: 'Voltage',                   shortName: 'Voltage',     unit: 'MVAr', defaultScenario: 'voltage',  color: '#f59e0b' },
]

export const NON_MARGIN_AREAS = AREAS.filter(a => a.id !== 'margin')

export const NON_MARGIN_AREA_IDS = NON_MARGIN_AREAS.map(a => a.id)

export function getArea(id: AreaId): AreaConfig {
  const area = AREAS.find(a => a.id === id)
  if (!area) throw new Error(`Unknown area: ${id}`)
  return area
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/config/areas.ts
git commit -m "feat: add areas config with AreaId type and metadata"
```

---

## Task 3: Extend `src/models/types.ts`

**Files:**
- Modify: `src/models/types.ts`

- [ ] **Step 1: Add `AreaRequirementRow` interface after the `UnitSnapshot` interface**

```ts
export interface AreaRequirementRow {
  sp: number           // 1–48 slot index within the rolling window
  requirement: number  // MW / GVAs / MVAr
  contracted: number   // base contracted availability before modelling actions
  constrained: number  // portion unusable (e.g. constrained off)
}
```

- [ ] **Step 2: Add `areaAvailability` to `SettlementPeriodData`**

Add this field after the `proxyEol` field:

```ts
areaAvailability?: Record<string, number>  // effective availability per non-Margin AreaId, after committed actions
```

- [ ] **Step 3: Replace `ModellingAction.reasonCode` union**

Find:
```ts
reasonCode: 'MARGIN' | 'INERTIA' | 'VOLTAGE' | 'CONSTRAINT' | 'RESERVE';
```

Replace with:
```ts
reasonCode: 'MARGIN' | 'RECOVERY_RESERVE' | 'FREQ_CONTROL_RESERVE' | 'GENERAL_RESERVE' | 'CONTINGENCY_RESERVE' | 'RESPONSE' | 'INERTIA' | 'VOLTAGE';
```

- [ ] **Step 4: Type-check — expect errors (CommittedTab uses old codes)**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: errors referencing `CONSTRAINT`, `RESERVE` in CommittedTab.tsx and page.tsx — these will be fixed in Task 12.

- [ ] **Step 5: Commit**

```bash
git add src/models/types.ts
git commit -m "feat: extend types — AreaRequirementRow, areaAvailability, new reasonCodes"
```

---

## Task 4: Create `src/utils/areaAggregates.ts`

**Files:**
- Create: `src/utils/areaAggregates.ts`

- [ ] **Step 1: Write the file**

```ts
import type { BMUnit, SettlementPeriodData, ModellingAction, AreaRequirementRow } from '@/models/types'

// Fuel types that contribute inertia (synchronous machines only)
const SYNCHRONOUS_FUEL_TYPES = new Set(['CCGT', 'NUCLEAR', 'NPSHYD', 'OCGT', 'PS', 'COAL'])
// Fuel types eligible for Response contribution
const RESPONSE_FUEL_TYPES = new Set(['PS', 'NPSHYD', 'OCGT', 'CCGT'])

const NON_MARGIN_AREA_IDS = [
  'recovery_reserve', 'freq_control_reserve', 'general_reserve',
  'contingency_reserve', 'response', 'inertia', 'voltage',
] as const

// MW / GVAs / MVAr contribution of committing one unit to a given area for a given SP.
// Returns 0 for margin — margin uses the existing computeAggregates path.
export function unitAreaContribution(
  bmUnitId: string,
  area: string,
  sp: SettlementPeriodData,
  units: BMUnit[]
): number {
  if (area === 'margin') return 0
  const unit = units.find(u => u.bmUnitId === bmUnitId)
  const mel = unit?.registeredCapacity ?? sp.mel[bmUnitId] ?? 0
  const pn = sp.pn[bmUnitId] ?? 0
  const headroom = Math.max(0, mel - pn)

  switch (area) {
    case 'recovery_reserve':
    case 'freq_control_reserve':
    case 'general_reserve':
    case 'contingency_reserve':
      return headroom
    case 'response':
      return unit && RESPONSE_FUEL_TYPES.has(unit.fuelType) ? headroom : 0
    case 'inertia':
      return unit && SYNCHRONOUS_FUEL_TYPES.has(unit.fuelType)
        ? (unit.registeredCapacity ?? 0) * 0.05
        : 0
    case 'voltage':
      return (unit?.registeredCapacity ?? 0) * 0.3
    default:
      return 0
  }
}

// Compute effective availability for all non-Margin areas across all SPs.
// Returns a new array of SPs with areaAvailability filled.
// Called after refreshAggregates so sp.emx/eol/emi are already fresh.
export function computeAreaAvailabilities(
  settlementPeriods: SettlementPeriodData[],
  committedActions: ModellingAction[],
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
      for (const action of committedActions) {
        if (
          action.fromPeriod <= spIdx &&
          (action.toPeriod === undefined || action.toPeriod >= spIdx) &&
          !seen.has(action.bmUnitId)
        ) {
          seen.add(action.bmUnitId)
          contribution += unitAreaContribution(action.bmUnitId, area, sp, units)
        }
      }
      areaAvailability[area] = base + contribution
    }

    return { ...sp, areaAvailability }
  })
}

// For draft overlay rendering: compute projected availability if draft actions were committed.
// alreadyModelled = bmUnitIds already counted in sp.areaAvailability[area] (committed draft units).
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
    if (
      action.fromPeriod <= spIdx &&
      (action.toPeriod === undefined || action.toPeriod >= spIdx) &&
      !seen.has(action.bmUnitId) &&
      !alreadyModelled.has(action.bmUnitId)
    ) {
      seen.add(action.bmUnitId)
      addition += unitAreaContribution(action.bmUnitId, area, sp, units)
    }
  }
  return baseAvailability + addition
}

export type AreaStatus = 'ok' | 'tight' | 'shortfall'

export interface AreaStatusResult {
  status: AreaStatus
  worstGap: number       // min(avail - req) over window; negative = shortfall
  worstAvail: number     // avail at worst SP
  worstReq: number       // req at worst SP
}

// Compute worst-case status for an area across the first spCount SPs.
// reservePct is only used for area === 'margin'.
export function computeAreaStatus(
  area: string,
  settlementPeriods: SettlementPeriodData[],
  areaRequirements: Record<string, AreaRequirementRow[]>,
  spCount: number,
  reservePct = 10
): AreaStatusResult {
  const window = settlementPeriods.slice(0, spCount)
  if (window.length === 0) return { status: 'ok', worstGap: 0, worstAvail: 0, worstReq: 0 }

  let worstGap = Infinity
  let worstAvail = 0
  let worstReq = 0

  for (const sp of window) {
    let avail: number
    let req: number
    if (area === 'margin') {
      avail = sp.emx
      req = sp.demand * (1 + reservePct / 100)
    } else {
      avail = sp.areaAvailability?.[area] ?? 0
      const row = (areaRequirements[area] ?? []).find(r => r.sp === sp.settlementPeriod)
      req = row?.requirement ?? 0
    }
    const gap = avail - req
    if (gap < worstGap) { worstGap = gap; worstAvail = avail; worstReq = req }
  }

  if (!isFinite(worstGap)) return { status: 'ok', worstGap: 0, worstAvail: 0, worstReq: 0 }

  const status: AreaStatus =
    worstGap < 0 ? 'shortfall' :
    worstReq > 0 && worstGap < worstReq * 0.1 ? 'tight' : 'ok'

  return { status, worstGap, worstAvail, worstReq }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep areaAggregates
```

Expected: no errors from this file

- [ ] **Step 3: Commit**

```bash
git add src/utils/areaAggregates.ts
git commit -m "feat: add areaAggregates utility — contribution formulas, computeAreaAvailabilities, computeAreaStatus"
```

---

## Task 5: Extend `src/store/useModellingStore.ts`

**Files:**
- Modify: `src/store/useModellingStore.ts`

- [ ] **Step 1: Add imports and helper at the top of the file**

After the existing imports, add:

```ts
import { computeAreaAvailabilities } from '@/utils/areaAggregates'
import type { AreaRequirementRow } from '@/models/types'
```

Add this helper function after the existing `refreshAggregates` function (around line 23):

```ts
const NON_MARGIN_AREA_IDS = [
  'recovery_reserve', 'freq_control_reserve', 'general_reserve',
  'contingency_reserve', 'response', 'inertia', 'voltage',
] as const

function initialAreaRequirements(): Record<string, AreaRequirementRow[]> {
  const result: Record<string, AreaRequirementRow[]> = {}
  for (const area of NON_MARGIN_AREA_IDS) {
    result[area] = Array.from({ length: 48 }, (_, i) => ({
      sp: i + 1, requirement: 0, contracted: 0, constrained: 0,
    }))
  }
  return result
}

// Runs both refreshAggregates (margin) and computeAreaAvailabilities (all other areas).
// Use this everywhere refreshAggregates was called previously.
function refreshAllAggregates(
  periods: SettlementPeriodData[],
  drafts: DraftPlan[],
  units: BMUnit[],
  areaRequirements: Record<string, AreaRequirementRow[]>
): SettlementPeriodData[] {
  const committedActions = drafts.filter(d => d.status === 'committed').flatMap(d => d.actions)
  const withMargin = refreshAggregates(periods, drafts, units)
  return computeAreaAvailabilities(withMargin, committedActions, units, areaRequirements)
}
```

- [ ] **Step 2: Add `areaRequirements` to the `ModellingState` interface**

After the `unitServices` field, add:

```ts
areaRequirements: Record<string, AreaRequirementRow[]>
setAreaRequirement: (area: string, sp: number, field: 'requirement' | 'contracted' | 'constrained', value: number) => void
fillAreaRequirements: (area: string, requirement?: number, contracted?: number) => void
```

- [ ] **Step 3: Add initial state and actions inside `create()`**

In the initial state object (after `unitServices: {}`), add:

```ts
areaRequirements: initialAreaRequirements(),
```

After the `setUnitService` action, add:

```ts
setAreaRequirement: (area, sp, field, value) =>
  set(state => {
    const rows = (state.areaRequirements[area] ?? []).map(r =>
      r.sp === sp ? { ...r, [field]: value } : r
    )
    const newReqs = { ...state.areaRequirements, [area]: rows }
    const committedActions = state.drafts.filter(d => d.status === 'committed').flatMap(d => d.actions)
    return {
      areaRequirements: newReqs,
      settlementPeriods: computeAreaAvailabilities(state.settlementPeriods, committedActions, state.units, newReqs),
    }
  }),

fillAreaRequirements: (area, requirement, contracted) =>
  set(state => {
    const rows = (state.areaRequirements[area] ?? []).map(r => ({
      ...r,
      ...(requirement !== undefined ? { requirement } : {}),
      ...(contracted  !== undefined ? { contracted  } : {}),
    }))
    const newReqs = { ...state.areaRequirements, [area]: rows }
    const committedActions = state.drafts.filter(d => d.status === 'committed').flatMap(d => d.actions)
    return {
      areaRequirements: newReqs,
      settlementPeriods: computeAreaAvailabilities(state.settlementPeriods, committedActions, state.units, newReqs),
    }
  }),
```

- [ ] **Step 4: Replace all `refreshAggregates(...)` calls with `refreshAllAggregates(..., state.areaRequirements)`**

There are 8 call sites. Replace each one. The old signature was `refreshAggregates(periods, drafts, units)` — add `, state.areaRequirements` as the fourth argument and change the function name.

`setSettlementPeriods` — change to:
```ts
setSettlementPeriods: (periods) =>
  set(state => ({
    settlementPeriods: refreshAllAggregates(periods, state.drafts, state.units, state.areaRequirements),
  })),
```

`removeUnitFromDraft` — change the conditional return to:
```ts
return {
  drafts,
  settlementPeriods: isCommitted
    ? refreshAllAggregates(state.settlementPeriods, drafts, state.units, state.areaRequirements)
    : state.settlementPeriods,
}
```

`updateDraftWindow` — change the conditional return to:
```ts
return {
  drafts,
  settlementPeriods: needsRefresh
    ? refreshAllAggregates(state.settlementPeriods, drafts, state.units, state.areaRequirements)
    : state.settlementPeriods,
}
```

`updateUnitWindow` — change to:
```ts
return {
  drafts,
  settlementPeriods: draft.status === 'committed'
    ? refreshAllAggregates(state.settlementPeriods, drafts, state.units, state.areaRequirements)
    : state.settlementPeriods,
}
```

`commitDraft` — change the return to:
```ts
return {
  drafts,
  settlementPeriods: refreshAllAggregates(state.settlementPeriods, drafts, state.units, state.areaRequirements),
}
```

`discardDraft` — change to:
```ts
return {
  drafts,
  settlementPeriods: wasCommitted
    ? refreshAllAggregates(state.settlementPeriods, drafts, state.units, state.areaRequirements)
    : state.settlementPeriods,
}
```

`reopenDraft` — change to:
```ts
return {
  drafts,
  settlementPeriods: wasCommitted
    ? refreshAllAggregates(state.settlementPeriods, drafts, state.units, state.areaRequirements)
    : state.settlementPeriods,
}
```

`clearAllDrafts` — change to:
```ts
return {
  drafts: [],
  activeDraftId: null,
  selectedUnits: new Set<string>(),
  settlementPeriods: hadCommitted
    ? refreshAllAggregates(state.settlementPeriods, [], state.units, state.areaRequirements)
    : state.settlementPeriods,
}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "CommittedTab\|page.tsx"
```

Expected: no errors from the store file itself

- [ ] **Step 6: Commit**

```bash
git add src/store/useModellingStore.ts
git commit -m "feat: extend store with areaRequirements state and refreshAllAggregates"
```

---

## Task 6: Create `src/components/RequirementsTab.tsx`

**Files:**
- Create: `src/components/RequirementsTab.tsx`

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useState } from 'react'
import { useModellingStore } from '@/store/useModellingStore'
import { NON_MARGIN_AREAS } from '@/config/areas'
import { spToStartTime } from '@/utils/settlements'

export default function RequirementsTab() {
  const areaRequirements  = useModellingStore(s => s.areaRequirements)
  const setAreaRequirement = useModellingStore(s => s.setAreaRequirement)
  const fillAreaRequirements = useModellingStore(s => s.fillAreaRequirements)

  const [activeArea, setActiveArea] = useState(NON_MARGIN_AREAS[0].id)
  const [fillReq, setFillReq]  = useState('')
  const [fillCon, setFillCon]  = useState('')

  const area = NON_MARGIN_AREAS.find(a => a.id === activeArea)!
  const rows = areaRequirements[activeArea] ?? []

  function handleFillApply() {
    const req = fillReq !== '' ? parseFloat(fillReq) : undefined
    const con = fillCon !== '' ? parseFloat(fillCon) : undefined
    if (req !== undefined || con !== undefined) {
      fillAreaRequirements(activeArea, req, con)
    }
  }

  return (
    <div className="redeclare-tab">
      {/* Area chip selector + fill toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Area:</span>
        {NON_MARGIN_AREAS.map(a => (
          <button
            key={a.id}
            onClick={() => setActiveArea(a.id)}
            style={{
              padding: '3px 10px',
              borderRadius: 4,
              fontSize: 11,
              border: '1px solid var(--border)',
              background: activeArea === a.id ? 'var(--accent)' : 'var(--surface)',
              color: activeArea === a.id ? '#fff' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {a.shortName}
          </button>
        ))}

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
          Fill all SPs:
        </span>
        <input
          type="number"
          placeholder={`Req (${area.unit})`}
          value={fillReq}
          onChange={e => setFillReq(e.target.value)}
          style={{ width: 90, padding: '3px 6px', fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)' }}
        />
        <input
          type="number"
          placeholder={`Contracted (${area.unit})`}
          value={fillCon}
          onChange={e => setFillCon(e.target.value)}
          style={{ width: 110, padding: '3px 6px', fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)' }}
        />
        <button
          onClick={handleFillApply}
          style={{ padding: '3px 10px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
        >
          Apply
        </button>
      </div>

      {/* 48-row table */}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>SP</th>
              <th>Time (UTC)</th>
              <th>Requirement ({area.unit})</th>
              <th>Contracted ({area.unit})</th>
              <th>Constrained ({area.unit})</th>
              <th>Net Available</th>
              <th>Gap</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              const netAvail = row.contracted - row.constrained
              const gap = netAvail - row.requirement
              const gapColor = gap < 0 ? 'var(--red)' : gap < row.requirement * 0.1 ? 'var(--amber)' : 'var(--green)'
              return (
                <tr key={row.sp}>
                  <td>{row.sp}</td>
                  <td>{spToStartTime(row.sp).slice(11, 16)}</td>
                  <td>
                    <input
                      type="number"
                      value={row.requirement}
                      onChange={e => setAreaRequirement(activeArea, row.sp, 'requirement', parseFloat(e.target.value) || 0)}
                      style={{ width: 80, padding: '2px 5px', fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.contracted}
                      onChange={e => setAreaRequirement(activeArea, row.sp, 'contracted', parseFloat(e.target.value) || 0)}
                      style={{ width: 80, padding: '2px 5px', fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)' }}
                    />
                  </td>
                  <td>
                    <input
                      type="number"
                      value={row.constrained}
                      onChange={e => setAreaRequirement(activeArea, row.sp, 'constrained', parseFloat(e.target.value) || 0)}
                      style={{ width: 80, padding: '2px 5px', fontSize: 11, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 3, color: 'var(--text)' }}
                    />
                  </td>
                  <td style={{ color: netAvail >= row.requirement ? 'var(--green)' : 'var(--red)' }}>
                    {netAvail.toLocaleString()}
                  </td>
                  <td style={{ fontWeight: 700, color: gapColor }}>
                    {gap >= 0 ? '+' : ''}{gap.toLocaleString()}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

Note: `spToStartTime` expects a real settlement period SP number. Since the RequirementsTab rows are slot indices 1–48 which map 1:1 to HH slots starting at 00:00 UTC, pass `row.sp` directly. Verify the output looks correct in the browser.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep RequirementsTab
```

Expected: no errors from this file

- [ ] **Step 3: Commit**

```bash
git add src/components/RequirementsTab.tsx
git commit -m "feat: add RequirementsTab with 48-row editable table and fill shortcut"
```

---

## Task 7: Wire Requirements tab into `src/app/page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add import**

At the top of page.tsx alongside other component imports:

```ts
import RequirementsTab from '@/components/RequirementsTab'
```

- [ ] **Step 2: Add `'requirements'` to the `Tab` type**

Find:
```ts
type Tab = 'workspace' | 'chart' | 'committed' | 'redeclare' | 'graph'
```

Replace with:
```ts
type Tab = 'workspace' | 'chart' | 'committed' | 'redeclare' | 'graph' | 'requirements'
```

- [ ] **Step 3: Add the tab button to the tab bar**

In the tab bar `<div className="tab-bar">`, after the Redeclare button, add:

```tsx
<button
  className={`tab-btn${activeTab === 'requirements' ? ' active' : ''}`}
  onClick={() => setActiveTab('requirements')}
>
  Requirements
</button>
```

- [ ] **Step 4: Add the tab panel**

After the `{activeTab === 'redeclare' && ...}` block, add:

```tsx
{activeTab === 'requirements' && (
  <RequirementsTab />
)}
```

- [ ] **Step 5: Verify in browser — open the app, click Requirements tab, switch between areas, enter values in a few cells**

```bash
npm run dev
```

Open http://localhost:3000, click Requirements tab, select "Recov. Res.", enter 1800 in Requirement for SP 1, verify Gap shows −1800 (since Contracted defaults to 0).

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire Requirements tab into page.tsx"
```

---

## Task 8: Create `src/components/Dashboard.tsx`

**Files:**
- Create: `src/components/Dashboard.tsx`

- [ ] **Step 1: Write the full component**

```tsx
'use client'

import { useMemo, useState } from 'react'
import { AREAS, getArea, type AreaId } from '@/config/areas'
import { computeAreaStatus, type AreaStatus } from '@/utils/areaAggregates'
import type { SettlementPeriodData, AreaRequirementRow } from '@/models/types'

interface DashboardProps {
  settlementPeriods: SettlementPeriodData[]
  areaRequirements: Record<string, AreaRequirementRow[]>
  reservePct: number
  onTileClick: (area: AreaId) => void
}

const TIMEFRAME_OPTIONS = [
  { label: 'Next 2h',  spCount: 4  },
  { label: 'Next 4h',  spCount: 8  },
  { label: 'Next 8h',  spCount: 16 },
  { label: 'Next 12h', spCount: 24 },
  { label: 'Next 24h', spCount: 48 },
]

const STATUS_COLORS: Record<AreaStatus, string> = {
  shortfall: 'var(--red,#ef4444)',
  tight:     'var(--amber,#f59e0b)',
  ok:        'var(--green,#22c55e)',
}

const STATUS_LABELS: Record<AreaStatus, string> = {
  shortfall: 'Shortfall',
  tight:     'Tight',
  ok:        'OK',
}

export default function Dashboard({ settlementPeriods, areaRequirements, reservePct, onTileClick }: DashboardProps) {
  const [tfIndex, setTfIndex] = useState(1)  // default Next 4h
  const [view, setView]       = useState<'A' | 'B'>('A')

  const { spCount } = TIMEFRAME_OPTIONS[tfIndex]

  const areaStatuses = useMemo(() =>
    AREAS.map(a => ({
      area: a,
      status: computeAreaStatus(a.id, settlementPeriods, areaRequirements, spCount, reservePct),
    }))
  , [settlementPeriods, areaRequirements, spCount, reservePct])

  if (settlementPeriods.length === 0) {
    return <div style={{ padding: 24, color: 'var(--text-muted)' }}>Loading system data…</div>
  }

  return (
    <div style={{ padding: '12px 16px' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.06em', color: 'var(--text)' }}>
          SYSTEM BALANCE DASHBOARD
        </span>
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {TIMEFRAME_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              onClick={() => setTfIndex(i)}
              style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 11, cursor: 'pointer',
                background: tfIndex === i ? 'var(--accent,#6366f1)' : 'var(--surface)',
                color: tfIndex === i ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, padding: 2 }}>
          {(['A', 'B'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: '2px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer', border: 'none',
                background: view === v ? 'var(--accent,#6366f1)' : 'transparent',
                color: view === v ? '#fff' : 'var(--text-muted)',
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {/* Tile grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {areaStatuses.map(({ area, status }) => {
          const color = STATUS_COLORS[status.status]
          const borderSide = `3px solid ${color}`
          const rows = areaRequirements[area.id] ?? []

          return (
            <div
              key={area.id}
              onClick={() => onTileClick(area.id)}
              style={{
                background: 'var(--surface)',
                borderRadius: 8,
                padding: '12px 14px',
                borderLeft: borderSide,
                cursor: 'pointer',
                transition: 'filter .15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(1.1)')}
              onMouseLeave={e => (e.currentTarget.style.filter = '')}
            >
              {view === 'A' ? (
                <TileViewA area={area} status={status} color={color} />
              ) : (
                <TileViewB area={area} status={status} color={color} />
              )}
              <Sparkline
                area={area.id}
                settlementPeriods={settlementPeriods}
                areaRequirements={rows}
                reservePct={reservePct}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── View A: status-first ──────────────────────────────────────────────────────

function TileViewA({ area, status, color }: {
  area: ReturnType<typeof getArea>
  status: ReturnType<typeof computeAreaStatus>
  color: string
}) {
  const sign = status.worstGap >= 0 ? '+' : ''
  return (
    <>
      <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em', color, marginBottom: 1 }}>
        {STATUS_LABELS[status.status]}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1 }}>
        {sign}{Math.round(status.worstGap).toLocaleString()} {area.unit}
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', margin: '3px 0 6px' }}>
        {area.name}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginBottom: 6 }}>
        <span>Req: {Math.round(status.worstReq).toLocaleString()}</span>
        <span>Avail: {Math.round(status.worstAvail).toLocaleString()}</span>
      </div>
    </>
  )
}

// ── View B: numbers-first ─────────────────────────────────────────────────────

function TileViewB({ area, status, color }: {
  area: ReturnType<typeof getArea>
  status: ReturnType<typeof computeAreaStatus>
  color: string
}) {
  const sign = status.worstGap >= 0 ? '+' : ''
  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>{area.name}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginBottom: 6 }}>
        {[['Required', status.worstReq], ['Available', status.worstAvail]].map(([label, val]) => (
          <div key={label as string} style={{ background: 'var(--bg)', borderRadius: 4, padding: '5px 6px' }}>
            <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{Math.round(val as number).toLocaleString()}</div>
            <div style={{ fontSize: 8, color: 'var(--text-muted)' }}>{area.unit}</div>
          </div>
        ))}
      </div>
      <div style={{
        background: `${color}18`, border: `1px solid ${color}`, borderRadius: 3,
        padding: '3px 6px', textAlign: 'center', fontSize: 10, fontWeight: 700, color, marginBottom: 6,
      }}>
        {STATUS_LABELS[status.status].toUpperCase()} &nbsp; {sign}{Math.round(status.worstGap).toLocaleString()} {area.unit}
      </div>
    </>
  )
}

// ── Sparkline ─────────────────────────────────────────────────────────────────

function Sparkline({ area, settlementPeriods, areaRequirements, reservePct }: {
  area: string
  settlementPeriods: SettlementPeriodData[]
  areaRequirements: AreaRequirementRow[]
  reservePct: number
}) {
  const points = settlementPeriods.map((sp, i) => {
    let avail: number
    let req: number
    if (area === 'margin') {
      avail = sp.emx
      req = sp.demand * (1 + reservePct / 100)
    } else {
      avail = sp.areaAvailability?.[area] ?? 0
      req = areaRequirements.find(r => r.sp === sp.settlementPeriod)?.requirement ?? 0
    }
    return { i, avail, req }
  })

  if (points.length === 0) return null

  const allVals = points.flatMap(p => [p.avail, p.req]).filter(v => v > 0)
  const min = Math.min(...allVals, 0)
  const max = Math.max(...allVals, 1)
  const range = max - min || 1

  const W = 100, H = 28
  const toY = (v: number) => H - ((v - min) / range) * H

  // Build SVG polyline point strings
  const availPts = points.map(p => `${(p.i / (points.length - 1)) * W},${toY(p.avail)}`).join(' ')
  const reqPts   = points.map(p => `${(p.i / (points.length - 1)) * W},${toY(p.req)}`).join(' ')

  // Determine fill colour: red if any deficit, green otherwise
  const hasDeficit = points.some(p => p.avail < p.req)
  const fillColor = hasDeficit ? '#ef444420' : '#22c55e18'
  const lineColor = hasDeficit ? '#ef4444' : '#22c55e'

  // Close the area under the avail line
  const closedPts = `${availPts} ${W},${H} 0,${H}`

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }} preserveAspectRatio="none">
      <polygon points={closedPts} fill={fillColor} />
      <polyline points={reqPts}   fill="none" stroke="#64748b" strokeWidth=".8" strokeDasharray="2,2" />
      <polyline points={availPts} fill="none" stroke={lineColor} strokeWidth="1.2" />
    </svg>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep Dashboard
```

Expected: no errors from this file

- [ ] **Step 3: Commit**

```bash
git add src/components/Dashboard.tsx
git commit -m "feat: add Dashboard component with area tiles, sparklines, and timeframe selector"
```

---

## Task 9: Wire Dashboard tab into `src/app/page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add imports and new local state**

Add the import:
```ts
import Dashboard from '@/components/Dashboard'
import type { AreaId } from '@/config/areas'
```

Add store selector after the existing ones:
```ts
const areaRequirements = useModellingStore(s => s.areaRequirements)
```

Add local state (after existing state declarations):
```ts
const [activeAreaTab, setActiveAreaTab] = useState<AreaId>('margin')
```

- [ ] **Step 2: Add `'dashboard'` to the Tab type and initial state**

Find:
```ts
type Tab = 'workspace' | 'chart' | 'committed' | 'redeclare' | 'graph' | 'requirements'
```

Replace with:
```ts
type Tab = 'dashboard' | 'workspace' | 'chart' | 'committed' | 'redeclare' | 'graph' | 'requirements'
```

Change initial state from `'workspace'` to `'dashboard'`:
```ts
const [activeTab, setActiveTab] = useState<Tab>('dashboard')
```

- [ ] **Step 3: Add Dashboard tab button — first in tab bar**

In the tab bar div, add this button before the Workspace button:

```tsx
<button
  className={`tab-btn${activeTab === 'dashboard' ? ' active' : ''}`}
  onClick={() => setActiveTab('dashboard')}
>
  Dashboard
</button>
```

- [ ] **Step 4: Add tile-click handler and Dashboard tab panel**

Add the handler (after the existing handlers):
```ts
const handleDashboardTileClick = useCallback((area: AreaId) => {
  setActiveAreaTab(area)
  setActiveTab('chart')
}, [])
```

Add the tab panel (before the Workspace tab panel):
```tsx
{activeTab === 'dashboard' && (
  <Dashboard
    settlementPeriods={settlementPeriods}
    areaRequirements={areaRequirements}
    reservePct={tweaks.reservePct}
    onTileClick={handleDashboardTileClick}
  />
)}
```

- [ ] **Step 5: Verify in browser — Dashboard appears first, all 8 tiles visible, clicking a tile switches to Chart tab**

```bash
npm run dev
```

Expected: Dashboard is the landing page; all 8 tiles show (all OK / 0 values since Requirements tab is empty). Clicking any tile switches to Chart tab.

- [ ] **Step 6: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire Dashboard tab as landing page with tile-click navigation"
```

---

## Task 10: Create `src/components/AreaChart.tsx`

**Files:**
- Create: `src/components/AreaChart.tsx`

**Before writing:** read `src/components/MarginChart.tsx` in full to understand the Recharts drag interaction pattern. The implementation below replicates the key patterns documented in CLAUDE.md. Do not skip this read — the Recharts 3.x `activeTooltipIndex` quirks and the `useRef`-for-drag requirement are non-obvious.

- [ ] **Step 1: Write the file**

```tsx
'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceArea, ReferenceLine, CartesianGrid,
} from 'recharts'
import { applyDraftToAreaBaseline } from '@/utils/areaAggregates'
import type { SettlementPeriodData, DraftPlan, BMUnit, AreaRequirementRow } from '@/models/types'
import type { AreaConfig } from '@/config/areas'

interface AreaChartProps {
  area: AreaConfig
  settlementPeriods: SettlementPeriodData[]
  areaRequirements: AreaRequirementRow[]   // 48 rows for this area
  drafts: DraftPlan[]                      // active visible drafts for overlay
  units: BMUnit[]
  hiddenDraftIds: Set<string>
  chartInteractionMode: 'drag' | 'twoClick' | 'deficit'
  onSolveSelect: (fromSp: number, toSp: number, worstDeficitMw: number) => void
  isLoading: boolean
}

// ── Deficit range detection ───────────────────────────────────────────────────

interface DeficitRange { start: number; end: number }

function findDeficitRanges(
  data: { slotIdx: number; gap: number }[]
): DeficitRange[] {
  const ranges: DeficitRange[] = []
  let start: number | null = null
  for (const d of data) {
    if (d.gap < 0) {
      if (start === null) start = d.slotIdx
    } else {
      if (start !== null) { ranges.push({ start, end: d.slotIdx - 1 }); start = null }
    }
  }
  if (start !== null) ranges.push({ start, end: data[data.length - 1]?.slotIdx ?? start })
  return ranges
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AreaChart({
  area,
  settlementPeriods,
  areaRequirements,
  drafts,
  units,
  hiddenDraftIds,
  chartInteractionMode,
  onSolveSelect,
  isLoading,
}: AreaChartProps) {
  // Drag state — useRef for synchronous tracking in event handlers (useState batches)
  const isDraggingRef  = useRef(false)
  const dragStartRef   = useRef<number | null>(null)
  const [dragStart, setDragStart] = useState<number | null>(null)
  const [dragEnd,   setDragEnd]   = useState<number | null>(null)

  // 2-click state
  const [clickPhase, setClickPhase] = useState<0 | 1>(0)
  const [clickStart, setClickStart] = useState<number | null>(null)

  // Reset selection state when mode changes
  useEffect(() => {
    isDraggingRef.current = false
    dragStartRef.current  = null
    setDragStart(null)
    setDragEnd(null)
    setClickPhase(0)
    setClickStart(null)
  }, [chartInteractionMode])

  // Active drafts for overlay
  const activeDrafts = useMemo(
    () => drafts.filter(d => d.status === 'draft' && !hiddenDraftIds.has(d.id)),
    [drafts, hiddenDraftIds]
  )

  // Units already counted in the committed baseline (for draft overlay dedup)
  const alreadyModelled = useMemo(() => new Set(
    drafts.filter(d => d.status === 'committed').flatMap(d => d.actions.map(a => a.bmUnitId))
  ), [drafts])

  // Chart data — must be computed before early return to satisfy hooks ordering
  const chartData = useMemo(() => {
    return settlementPeriods.map((sp, idx) => {
      const slotIdx = sp.settlementPeriod
      const requirement = areaRequirements.find(r => r.sp === slotIdx)?.requirement ?? 0
      const availability = sp.areaAvailability?.[area.id] ?? 0
      const gap = availability - requirement

      // Draft overlays
      const overlays: Record<string, number | null> = {}
      for (const draft of activeDrafts) {
        const prevIdx = slotIdx - 1
        const nextIdx = slotIdx + 1
        const covered = draft.actions.some(a =>
          a.fromPeriod <= slotIdx && (a.toPeriod === undefined || a.toPeriod >= slotIdx)
        )
        const prevCovered = draft.actions.some(a =>
          a.fromPeriod <= prevIdx && (a.toPeriod === undefined || a.toPeriod >= prevIdx)
        )
        const nextCovered = draft.actions.some(a =>
          a.fromPeriod <= nextIdx && (a.toPeriod === undefined || a.toPeriod >= nextIdx)
        )
        if (covered) {
          overlays[draft.id] = applyDraftToAreaBaseline(sp, availability, draft.actions, alreadyModelled, units, area.id)
        } else if (prevCovered || nextCovered) {
          overlays[draft.id] = availability  // bridge point
        } else {
          overlays[draft.id] = null
        }
      }

      return { slotIdx, idx, requirement, availability, gap, surplus: gap >= 0 ? gap : 0, deficit: gap < 0 ? gap : 0, ...overlays }
    })
  }, [settlementPeriods, areaRequirements, area.id, activeDrafts, alreadyModelled, units])

  // Deficit zones — must be before early return
  const deficitRanges = useMemo(() => findDeficitRanges(chartData), [chartData])

  // Midnight index
  const midnightIdx = useMemo(() => {
    for (let i = 1; i < settlementPeriods.length; i++) {
      const prev = settlementPeriods[i - 1]
      const curr = settlementPeriods[i]
      if (curr.settlementDate !== prev.settlementDate) return i
    }
    return null
  }, [settlementPeriods])

  if (isLoading || settlementPeriods.length === 0) {
    return <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading…</div>
  }

  // ── Event helpers ────────────────────────────────────────────────────────

  function indexFromEvent(e: { activeTooltipIndex?: unknown } | null): number | null {
    const raw = e?.activeTooltipIndex
    if (raw == null) return null
    const idx = parseInt(String(raw), 10)
    return isNaN(idx) ? null : idx
  }

  function fireIfDeficit(fromIdx: number, toIdx: number) {
    const lo = Math.min(fromIdx, toIdx)
    const hi = Math.max(fromIdx, toIdx)
    const slice = chartData.slice(lo, hi + 1)
    const deficits = slice.filter(d => d.gap < 0)
    if (deficits.length === 0) return
    const worst = Math.min(...deficits.map(d => d.gap))
    onSolveSelect(lo + 1, hi + 1, worst)  // +1: slotIdx is 1-based
  }

  // ── Mouse handlers for drag mode ─────────────────────────────────────────

  function handleMouseDown(e: Parameters<typeof handleMouseDown>[0]) {
    if (chartInteractionMode !== 'drag') return
    const idx = indexFromEvent(e)
    if (idx == null) return
    isDraggingRef.current = true
    dragStartRef.current  = idx
    setDragStart(idx)
    setDragEnd(null)
  }

  function handleMouseMove(e: Parameters<typeof handleMouseMove>[0]) {
    if (chartInteractionMode !== 'drag' || !isDraggingRef.current) return
    const idx = indexFromEvent(e)
    if (idx == null) return
    setDragEnd(idx)
  }

  function handleMouseUp() {
    if (chartInteractionMode !== 'drag' || !isDraggingRef.current) return
    isDraggingRef.current = false
    const start = dragStartRef.current
    const end   = dragEnd
    if (start != null && end != null) fireIfDeficit(start, end)
    dragStartRef.current = null
    setDragStart(null)
    setDragEnd(null)
  }

  // ── Click handler for 2-click and deficit-zone modes ─────────────────────

  function handleClick(e: Parameters<typeof handleClick>[0]) {
    const idx = indexFromEvent(e)
    if (idx == null) return

    if (chartInteractionMode === 'twoClick') {
      if (clickPhase === 0) {
        setClickStart(idx)
        setClickPhase(1)
      } else {
        if (clickStart != null) fireIfDeficit(clickStart, idx)
        setClickPhase(0)
        setClickStart(null)
      }
      return
    }

    if (chartInteractionMode === 'deficit') {
      // Find the contiguous deficit range containing idx
      const range = deficitRanges.find(r => r.start - 1 <= idx && idx <= r.end - 1)
      if (!range) return
      fireIfDeficit(range.start - 1, range.end - 1)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const selLo = dragStart != null && dragEnd != null ? Math.min(dragStart, dragEnd) : null
  const selHi = dragStart != null && dragEnd != null ? Math.max(dragStart, dragEnd) : null

  return (
    <div style={{ userSelect: 'none' }}>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart
          data={chartData}
          onMouseDown={handleMouseDown as never}
          onMouseMove={handleMouseMove as never}
          onMouseUp={handleMouseUp}
          onClick={handleClick as never}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="slotIdx" hide />
          <YAxis
            label={{ value: area.unit, angle: -90, position: 'insideLeft', offset: 10, style: { fontSize: 10, fill: '#64748b' } }}
            tick={{ fontSize: 10, fill: '#64748b' }}
            width={48}
          />
          <Tooltip
            contentStyle={{ background: '#1e293b', border: '1px solid #334155', fontSize: 11 }}
            formatter={(val: number, name: string) => [
              typeof val === 'number' ? `${Math.round(val).toLocaleString()} ${area.unit}` : val,
              name,
            ]}
          />

          {/* Surplus shading */}
          {chartData.map((d, i) =>
            d.gap > 0 ? (
              <ReferenceArea key={`s${i}`} x1={i} x2={i} fill="#22c55e08" />
            ) : null
          )}

          {/* Deficit zone shading */}
          {deficitRanges.map((r, i) => (
            <ReferenceArea
              key={`d${i}`}
              x1={r.start - 1}
              x2={r.end - 1}
              fill="#ef444418"
              stroke="#ef444440"
              strokeWidth={0}
            />
          ))}

          {/* Drag selection highlight */}
          {selLo != null && selHi != null && (
            <ReferenceArea x1={selLo} x2={selHi} fill="#6366f115" stroke="#6366f1" strokeWidth={1} strokeDasharray="2,2" />
          )}

          {/* 2-click first-click marker */}
          {chartInteractionMode === 'twoClick' && clickPhase === 1 && clickStart != null && (
            <ReferenceLine x={clickStart} stroke="#f59e0b" strokeDasharray="3,3" strokeWidth={1.5} />
          )}

          {/* Midnight marker */}
          {midnightIdx != null && (
            <ReferenceLine
              x={midnightIdx}
              stroke="#475569"
              strokeDasharray="2,2"
              label={{ value: '← midnight', position: 'insideTopLeft', fontSize: 9, fill: '#475569' }}
            />
          )}

          {/* Requirement line (dashed) */}
          <Line
            dataKey="requirement"
            stroke="#64748b"
            strokeWidth={1.5}
            strokeDasharray="5,4"
            dot={false}
            isAnimationActive={false}
            name={`Requirement (${area.unit})`}
          />

          {/* Availability line (solid, area-coloured) */}
          <Line
            dataKey="availability"
            stroke={area.color}
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
            name={`Available (${area.unit})`}
          />

          {/* Draft overlay lines (dotted) */}
          {activeDrafts.map(draft => (
            <Line
              key={draft.id}
              dataKey={draft.id}
              stroke={draft.color}
              strokeWidth={1.5}
              strokeDasharray="3,2"
              dot={false}
              isAnimationActive={false}
              connectNulls={false}
              name={draft.name}
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep AreaChart
```

Expected: no errors (Recharts `never` casts on event handlers suppress known Recharts 3.x type gaps)

- [ ] **Step 3: Commit**

```bash
git add src/components/AreaChart.tsx
git commit -m "feat: add AreaChart component with drag-to-solve, draft overlays, deficit zones"
```

---

## Task 11: Add area subtab row to the Chart tab in `src/app/page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add AreaChart import**

```ts
import AreaChart from '@/components/AreaChart'
import { AREAS, NON_MARGIN_AREAS, getArea } from '@/config/areas'
import { computeAreaStatus } from '@/utils/areaAggregates'
```

- [ ] **Step 2: Add a solve-bar component and a per-area status memo**

Add after existing memos (inside the component, before `return`):

```ts
const areaStatusMap = useMemo(() =>
  Object.fromEntries(
    AREAS.map(a => [
      a.id,
      computeAreaStatus(a.id, settlementPeriods, areaRequirements, 48, tweaks.reservePct),
    ])
  )
, [settlementPeriods, areaRequirements, tweaks.reservePct])

const STATUS_DOT_COLOR: Record<string, string> = {
  shortfall: 'var(--red,#ef4444)',
  tight:     'var(--amber,#f59e0b)',
  ok:        'var(--green,#22c55e)',
}
```

- [ ] **Step 3: Replace the existing `{activeTab === 'chart' && (...)}` block**

Find the existing chart block (which just renders `<MarginChart ...>`). Wrap the existing content and add the subtab row above it:

```tsx
{activeTab === 'chart' && (
  <div>
    {/* Area subtab row */}
    <div style={{
      display: 'flex', gap: 0, borderBottom: '1px solid var(--border)',
      background: 'var(--surface)', overflowX: 'auto', padding: '0 12px',
    }}>
      {AREAS.map(a => {
        const st = areaStatusMap[a.id]
        const dotColor = STATUS_DOT_COLOR[st?.status ?? 'ok']
        const isActive = activeAreaTab === a.id
        return (
          <button
            key={a.id}
            onClick={() => setActiveAreaTab(a.id)}
            style={{
              padding: '6px 12px', fontSize: 10, whiteSpace: 'nowrap',
              background: 'transparent', border: 'none', cursor: 'pointer',
              borderBottom: isActive ? `2px solid ${dotColor}` : '2px solid transparent',
              color: isActive ? dotColor : 'var(--text-muted)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
            {a.shortName}
          </button>
        )
      })}
    </div>

    {/* Margin chart — existing, unchanged */}
    {activeAreaTab === 'margin' && (
      /* === PASTE THE EXISTING MarginChart JSX HERE EXACTLY AS IT WAS === */
      <MarginChart
        settlementPeriods={settlementPeriods}
        drafts={drafts}
        units={units}
        isLoading={isLoading}
        hiddenDraftIds={hiddenDraftIds}
        reservePct={tweaks.reservePct}
        chartInteractionMode={tweaks.chartInteractionMode}
        onSolveSelect={handleSolveSelect}
      />
      /* === END OF EXISTING MarginChart JSX === */
    )}

    {/* Non-Margin area charts */}
    {activeAreaTab !== 'margin' && (() => {
      const areaConfig = getArea(activeAreaTab)
      const reqs = areaRequirements[activeAreaTab] ?? []
      return (
        <AreaChart
          area={areaConfig}
          settlementPeriods={settlementPeriods}
          areaRequirements={reqs}
          drafts={drafts}
          units={units}
          hiddenDraftIds={hiddenDraftIds}
          chartInteractionMode={tweaks.chartInteractionMode}
          onSolveSelect={handleAreaSolveSelect}
          isLoading={isLoading}
        />
      )
    })()}

    {/* Existing solve bar — keep exactly as is */}
    {/* ... existing solvePanelVisible / SolveBar JSX ... */}
  </div>
)}
```

**Important:** do not move or change any of the existing MarginChart JSX — just wrap it in the `activeAreaTab === 'margin'` conditional.

- [ ] **Step 4: Add `handleAreaSolveSelect` that also sets the active area tab**

Add alongside the existing `handleSolveSelect`:

```ts
const handleAreaSolveSelect = useCallback((fromSp: number, toSp: number, worstDeficitMw: number) => {
  setSolveTarget({ fromSp, toSp, worstDeficitMw, adjustedMw: Math.abs(worstDeficitMw) })
  setSolvePanelVisible(true)
}, [])
```

Note: `activeAreaTab` is already known at this point. `handleSolveNavigate` will read it via the closure when "Solve ↗" is pressed.

- [ ] **Step 5: Update `handleSolveNavigate` to use the active area's default scenario**

Find:
```ts
setScenario('margin')
```

Replace with:
```ts
setScenario(getArea(activeAreaTab).defaultScenario)
```

Add `activeAreaTab` to the `useCallback` deps array.

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit 2>&1 | grep -v "CommittedTab"
```

Expected: no errors except CommittedTab (fixed in Task 12)

- [ ] **Step 7: Verify in browser**

Open http://localhost:3000. Go to Chart tab. Verify the area subtab row appears. Click each subtab — Margin shows the existing chart unchanged; other areas show the AreaChart component (empty/zero until Requirements tab is populated). Populate some values in Requirements tab and verify the area chart updates.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add area subtab row to Chart tab, wire AreaChart, auto-scenario on solve"
```

---

## Task 12: Update `CommittedTab.tsx` for new reasonCodes

**Files:**
- Modify: `src/components/CommittedTab.tsx`

- [ ] **Step 1: Find all usages to replace**

```bash
grep -n "REASON_LABEL\|REASON_COLORS\|REASON_ORDER\|CONSTRAINT\|'RESERVE'" src/components/CommittedTab.tsx
```

- [ ] **Step 2: Replace `REASON_LABEL`**

Find:
```ts
const REASON_LABEL: Record<ModellingAction['reasonCode'], string> = {
  MARGIN:     'Margin',
  INERTIA:    'Inertia',
  VOLTAGE:    'Voltage',
  CONSTRAINT: 'Constraint',
  RESERVE:    'Reserve',
}
```

Replace with:
```ts
const REASON_LABEL: Record<ModellingAction['reasonCode'], string> = {
  MARGIN:                 'Margin',
  RECOVERY_RESERVE:       'Recovery Reserve',
  FREQ_CONTROL_RESERVE:   'Freq. Control',
  GENERAL_RESERVE:        'General Reserve',
  CONTINGENCY_RESERVE:    'Contingency',
  RESPONSE:               'Response',
  INERTIA:                'Inertia',
  VOLTAGE:                'Voltage',
}
```

- [ ] **Step 3: Replace `REASON_COLORS`**

Find:
```ts
const REASON_COLORS: Record<ModellingAction['reasonCode'], string> = {
  MARGIN:     '#f59e0b',
  INERTIA:    '#8b5cf6',
  VOLTAGE:    '#06b6d4',
  RESERVE:    '#f97316',
  CONSTRAINT: '#ec4899',
}
```

Replace with:
```ts
const REASON_COLORS: Record<ModellingAction['reasonCode'], string> = {
  MARGIN:               '#f59e0b',
  RECOVERY_RESERVE:     '#6366f1',
  FREQ_CONTROL_RESERVE: '#8b5cf6',
  GENERAL_RESERVE:      '#06b6d4',
  CONTINGENCY_RESERVE:  '#0ea5e9',
  RESPONSE:             '#f97316',
  INERTIA:              '#22c55e',
  VOLTAGE:              '#f59e0b',
}
```

- [ ] **Step 4: Replace `REASON_ORDER`**

Find:
```ts
const REASON_ORDER: ModellingAction['reasonCode'][] = ['MARGIN', 'INERTIA', 'VOLTAGE', 'RESERVE', 'CONSTRAINT']
```

Replace with:
```ts
const REASON_ORDER: ModellingAction['reasonCode'][] = [
  'MARGIN', 'RECOVERY_RESERVE', 'FREQ_CONTROL_RESERVE', 'GENERAL_RESERVE',
  'CONTINGENCY_RESERVE', 'RESPONSE', 'INERTIA', 'VOLTAGE',
]
```

- [ ] **Step 5: Update `SCENARIO_REASON` in `page.tsx`**

Find:
```ts
const SCENARIO_REASON: Record<string, ModellingAction['reasonCode']> = {
  margin:   'MARGIN',
  inertia:  'INERTIA',
  voltage:  'VOLTAGE',
  reserve:  'RESERVE',
  response: 'RESERVE',
  pullback: 'CONSTRAINT',
}
```

Replace with:
```ts
const SCENARIO_REASON: Record<string, ModellingAction['reasonCode']> = {
  margin:   'MARGIN',
  inertia:  'INERTIA',
  voltage:  'VOLTAGE',
  reserve:  'RECOVERY_RESERVE',
  response: 'RESPONSE',
  pullback: 'MARGIN',   // pullback has no dedicated code; falls back to MARGIN
}
```

- [ ] **Step 6: Type-check — expect clean**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/CommittedTab.tsx src/app/page.tsx
git commit -m "feat: update reasonCode labels and SCENARIO_REASON for new area codes"
```

---

## Task 13: Final type check, smoke test, and branch push

**Files:** none new

- [ ] **Step 1: Full type check**

```bash
npx tsc --noEmit
```

Expected: zero errors

- [ ] **Step 2: Production build check**

```bash
npm run build 2>&1 | tail -20
```

Expected: successful build, no errors

- [ ] **Step 3: Browser smoke test checklist**

Start dev server: `npm run dev`

Run through each item:

1. **Dashboard loads** as the first tab — 8 tiles visible, all showing OK / 0 values
2. **Requirements tab** — switch to a few areas, enter a Requirement of 1800 and Contracted of 1500 for all SPs using Fill, verify Gap shows −300 for all rows and Net Available shows 1500
3. **Dashboard tiles update** — after setting requirements, the Recovery Reserve tile should show Shortfall −300, sparkline shows a flat deficit line
4. **Timeframe selector** — clicking 2h/4h/8h/24h changes the tile headline values (same in this case since all SPs have the same values, but verify the selector is functional)
5. **A/B toggle** — switches tile layout
6. **Tile click** — clicking Recovery Reserve tile → navigates to Chart tab with Recovery Reserve subtab active
7. **Area chart renders** — requirement line (dashed) and availability line visible; deficit zone shaded red
8. **Drag-to-solve** — drag across a deficit zone → solve bar appears with correct MW value and area badge
9. **Solve → Workspace** — clicking Solve ↗ switches to Workspace, scenario auto-set to Reserve, deficit badge on DraftDetails
10. **Commit a draft** — commit a unit; verify both the Margin chart and the Recovery Reserve chart availability line moves up
11. **Margin tab unchanged** — verify existing Margin chart works identically to before

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: balancing areas dashboard — complete implementation

Dashboard tab, 8-area status tiles with sparklines, timeframe selector,
A/B view toggle, per-area Chart subtabs with drag-to-solve, Requirements
tab with 48 HH editing, cross-area availability computation.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 5: Push branch**

```bash
git push -u origin feature/balancing-areas-dashboard
```

---

## Self-Review Notes

- `AreaRequirementRow` is added to `types.ts` and the store uses `Record<string, AreaRequirementRow[]>` (string key not AreaId) to avoid a circular import between types.ts and areas.ts.
- `spToStartTime` in RequirementsTab is used to render the Time column — verify the function signature accepts a number (slot index) and returns an ISO string; if the utility expects a real settlement-day SP, the time labels will still be correct since slot 1 = SP 1 = 00:00.
- `areaAvailability` is typed as `Record<string, number> | undefined` on `SettlementPeriodData` — always use `sp.areaAvailability?.[area] ?? 0` to handle SPs that haven't been through `refreshAllAggregates` yet.
- The `as never` casts on ComposedChart event handlers suppress Recharts 3.x type mismatches — this is consistent with how MarginChart handles the same issue.
- The pullback scenario no longer maps to `CONSTRAINT` (removed) — it maps to `MARGIN` as a fallback. This is acceptable for the prototype since pullback is about reducing generation not adding it.
