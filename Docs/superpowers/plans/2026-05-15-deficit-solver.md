# Deficit Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let operators drag-select a deficit period on the Chart tab, then auto-populate From/To + a MW target in the Workspace and pre-check the minimum unit set that covers the deficit.

**Architecture:** Purely additive — five existing files get new props/state. MarginChart grows an interaction overlay using Recharts' own synthetic mouse events. AvailableTable pre-seeds its existing `pendingIds` checkbox state when `solveMode` is true. A new `solveTarget` state in `page.tsx` ties everything together.

**Tech Stack:** Next.js 16, React, Recharts (ComposedChart synthetic events), Zustand, TypeScript. No new dependencies.

---

## File Map

| File | Change |
|------|--------|
| `src/components/ConfigPanel.tsx` | Add `chartInteractionMode` to `TweakState`; add SegControl in Tweaks tab |
| `src/components/MarginChart.tsx` | Add two new props; add interaction state + overlay div + ReferenceArea for all three modes |
| `src/app/page.tsx` | Add `solveTarget` state; add `handleSolveSelect` callback; add Solve bar JSX in Chart tab; pass new props to MarginChart, DraftDetails, AvailableTable; clear solveTarget on data load |
| `src/components/DraftDetails.tsx` | Add optional `solveMw` prop; render MW field when non-null |
| `src/components/AvailableTable.tsx` | Add `solveMode`/`solveMw` props; useEffect to seed `pendingIds` with covering set when solve mode activates |

---

## Task 1 — Add `chartInteractionMode` to TweakState and Config UI

**Files:**
- Modify: `src/components/ConfigPanel.tsx`

The `TweakState` interface is exported from `ConfigPanel.tsx` and consumed by `page.tsx`. Add the new field there and wire it to a segmented control in the Tweaks tab under the existing "Chart" section (which currently only has TR2 reserve %).

- [ ] **Step 1: Add the field to `TweakState`**

In `src/components/ConfigPanel.tsx`, the `TweakState` interface is at line 10. Replace the whole interface with:

```ts
export interface TweakState {
  theme: 'light' | 'dark'
  layout: 'three-col' | 'stacked'
  showSidebar: boolean
  selectionPattern: 'buttons' | 'click'
  reservePct: number
  chartInteractionMode: 'drag' | 'twoClick' | 'deficit'
}
```

- [ ] **Step 2: Add the SegControl in TweaksTab**

In `TweaksTab`, after the existing TR2 reserve % row (the `</div>` that closes the `twk-row twk-row-h` div for Reserve requirement), add:

```tsx
<SegControl
  value={tweaks.chartInteractionMode}
  options={[
    { value: 'drag',    label: 'Drag' },
    { value: 'twoClick', label: '2-Click' },
    { value: 'deficit', label: 'Deficit zone' },
  ]}
  onChange={v => onChangeTweak('chartInteractionMode', v)}
/>
```

- [ ] **Step 3: Set the default in `page.tsx`**

In `src/app/page.tsx`, find the `useState<TweakState>` initialiser (around line 34) and add the new field:

```ts
const [tweaks, setTweaksState] = useState<TweakState>({
  theme: 'dark',
  layout: 'three-col',
  showSidebar: true,
  selectionPattern: 'buttons',
  reservePct: 10,
  chartInteractionMode: 'drag',   // ← add this
})
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Smoke-test in browser**

```bash
npm run dev
```

Open Config → Tweaks. A "Drag / 2-Click / Deficit zone" segmented control should appear under TR2 reserve %. Switching modes does nothing yet (no behaviour wired).

- [ ] **Step 6: Commit**

```bash
git add src/components/ConfigPanel.tsx src/app/page.tsx
git commit -m "feat: add chartInteractionMode tweak (drag/twoClick/deficit)"
```

---

## Task 2 — Add Interaction Overlay to MarginChart (Drag Mode)

**Files:**
- Modify: `src/components/MarginChart.tsx`

Recharts' `ComposedChart` fires `onMouseDown`/`onMouseMove` with a synthesised event object that includes `activeTooltipIndex` (0-based slot index) — use these instead of raw DOM pixel math. For mouseup outside the chart, attach a `document` listener via `useEffect`.

The selection renders as a Recharts `ReferenceArea` using label values (the `HH:MM` strings that the X axis uses as `dataKey`). Two new props are added: `chartInteractionMode` and `onSolveSelect`.

- [ ] **Step 1: Add new props to `MarginChart`**

Find the existing props destructure at line 164:

```ts
export function MarginChart({ hiddenDraftIds = new Set<string>(), reservePct = 10 }: { hiddenDraftIds?: Set<string>; reservePct?: number }) {
```

Replace with:

```ts
export function MarginChart({
  hiddenDraftIds = new Set<string>(),
  reservePct = 10,
  chartInteractionMode = 'drag',
  onSolveSelect,
}: {
  hiddenDraftIds?: Set<string>
  reservePct?: number
  chartInteractionMode?: 'drag' | 'twoClick' | 'deficit'
  onSolveSelect?: (fromSp: number, toSp: number, worstDeficitMw: number) => void
}) {
```

- [ ] **Step 2: Add interaction state**

After the existing `const isDark = useDarkMode()` line, add:

```ts
// Interaction state — slot indices (0-based, matching chartData array positions)
const [dragStart, setDragStart]   = useState<number | null>(null)
const [dragEnd,   setDragEnd]     = useState<number | null>(null)
const [isDragging, setIsDragging] = useState(false)
// twoClick: 0 = waiting for start, 1 = waiting for end
const [clickPhase, setClickPhase] = useState<0 | 1>(0)
const [clickStart, setClickStart] = useState<number | null>(null)
```

- [ ] **Step 3: Add document mouseup listener to finish drags that end outside the chart**

After the `useDarkMode` call block, add:

```ts
// Tracks whether the drag was already finalised by ComposedChart's onMouseUp
// (which fires when releasing inside the chart). The document handler only
// acts if the mouseup happened outside the chart area.
const dragFiredRef = useRef(false)

useEffect(() => {
  function onDocMouseUp() {
    if (!isDragging) return
    if (dragFiredRef.current) { dragFiredRef.current = false; return }
    setIsDragging(false)
    if (dragStart !== null && dragEnd !== null && dragStart !== dragEnd) {
      fireSolveSelect(dragStart, dragEnd)
    } else {
      setDragStart(null)
      setDragEnd(null)
    }
  }
  document.addEventListener('mouseup', onDocMouseUp)
  return () => document.removeEventListener('mouseup', onDocMouseUp)
}, [isDragging, dragStart, dragEnd])
```

Also add `import { useRef } from 'react'` to the existing react import at the top of `MarginChart.tsx` (it currently imports `useEffect` and `useState` and `Fragment`).

- [ ] **Step 4: Add `fireSolveSelect` helper**

After the `useEffect` above, add:

```ts
function fireSolveSelect(idxA: number, idxB: number) {
  if (!onSolveSelect) return
  const lo = Math.min(idxA, idxB)
  const hi = Math.max(idxA, idxB)
  // settlementPeriod field in chartData is the slot index 1-48
  const fromSp = lo + 1
  const toSp   = hi + 1
  const worst  = Math.min(
    ...settlementPeriods.slice(lo, hi + 1).map(sp => {
      const tr2 = sp.demand * (1 + reservePct / 100)
      return sp.emx - tr2
    })
  )
  if (worst < 0) onSolveSelect(fromSp, toSp, worst)
}
```

- [ ] **Step 5: Add chart event handlers (drag mode)**

In the `ComposedChart` JSX, add three event handlers (they only fire in drag mode for now — other modes added in Task 3):

```tsx
<ComposedChart
  data={chartData}
  margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
  onMouseDown={e => {
    if (chartInteractionMode !== 'drag') return
    const idx = e?.activeTooltipIndex
    if (idx == null) return
    setDragStart(idx)
    setDragEnd(idx)
    setIsDragging(true)
  }}
  onMouseMove={e => {
    if (chartInteractionMode !== 'drag' || !isDragging) return
    const idx = e?.activeTooltipIndex
    if (idx == null) return
    setDragEnd(idx)
  }}
  onMouseUp={e => {
    if (chartInteractionMode !== 'drag') return
    dragFiredRef.current = true   // tell the document handler we already handled this
    setIsDragging(false)
    const idx = e?.activeTooltipIndex ?? dragEnd
    if (dragStart !== null && idx !== null && dragStart !== idx) {
      setDragEnd(idx)
      fireSolveSelect(dragStart, idx)
    } else {
      setDragStart(null)
      setDragEnd(null)
    }
  }}
>
```

- [ ] **Step 6: Render the drag selection as a ReferenceArea**

After the existing `ReferenceLine y={0}` element, add the selection overlay. It renders only when `dragStart` and `dragEnd` are set. It needs the `label` strings from `chartData`:

```tsx
{dragStart !== null && dragEnd !== null && (() => {
  const lo = Math.min(dragStart, dragEnd)
  const hi = Math.max(dragStart, dragEnd)
  const x1Label = chartData[lo]?.label as string
  const x2Label = chartData[hi]?.label as string
  return (
    <ReferenceArea
      x1={x1Label}
      x2={x2Label}
      fill="#6366f1"
      fillOpacity={0.15}
      stroke="#6366f1"
      strokeOpacity={0.6}
      strokeWidth={1}
    />
  )
})()}
```

- [ ] **Step 7: Add `cursor: crosshair` style when in any interaction mode**

Wrap the existing `<div style={{ flex: 1, minHeight: 0 }}>` that contains `ResponsiveContainer`:

```tsx
<div style={{ flex: 1, minHeight: 0, cursor: chartInteractionMode !== 'drag' ? 'crosshair' : 'crosshair' }}>
```

(All modes use crosshair for now; deficit zone will override to `pointer` over deficit areas in Task 3.)

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Smoke-test**

```bash
npm run dev
```

On the Chart tab, drag across the chart. A blue-ish shaded band should follow the drag. Releasing does nothing yet (no `onSolveSelect` wired in page.tsx yet).

- [ ] **Step 10: Commit**

```bash
git add src/components/MarginChart.tsx
git commit -m "feat: add drag-to-select interaction overlay to MarginChart"
```

---

## Task 3 — Add 2-Click and Deficit-Zone Modes to MarginChart

**Files:**
- Modify: `src/components/MarginChart.tsx`

- [ ] **Step 1: Add 2-click handler to `ComposedChart`**

Inside the existing `onMouseDown` and inside the existing `onClick` handler on `ComposedChart`, add the twoClick branch. Add an `onClick` prop alongside the existing mouse handlers:

```tsx
onClick={e => {
  if (chartInteractionMode !== 'twoClick') return
  const idx = e?.activeTooltipIndex
  if (idx == null) return
  if (clickPhase === 0) {
    setClickStart(idx)
    setDragStart(idx)
    setDragEnd(idx)
    setClickPhase(1)
  } else {
    // second click — complete selection
    const start = clickStart!
    setDragEnd(idx)
    setClickPhase(0)
    setClickStart(null)
    if (start !== idx) fireSolveSelect(start, idx)
    else { setDragStart(null); setDragEnd(null) }
  }
}}
```

Also add: when `chartInteractionMode` changes, reset all interaction state. Add a `useEffect`:

```ts
useEffect(() => {
  setDragStart(null)
  setDragEnd(null)
  setIsDragging(false)
  setClickPhase(0)
  setClickStart(null)
}, [chartInteractionMode])
```

- [ ] **Step 2: Compute contiguous deficit ranges for deficit-zone mode**

Add a `deficitRanges` memo below the `chartData` memo:

```ts
const deficitRanges = useMemo(() => {
  const ranges: { lo: number; hi: number }[] = []
  let start = -1
  chartData.forEach((pt, i) => {
    const inDeficit = (pt.margin as number) < 0
    if (inDeficit && start === -1) start = i
    if (!inDeficit && start !== -1) { ranges.push({ lo: start, hi: i - 1 }); start = -1 }
  })
  if (start !== -1) ranges.push({ lo: start, hi: chartData.length - 1 })
  return ranges
}, [chartData])
```

- [ ] **Step 3: Add deficit-zone click handler**

Extend the `onClick` prop already added in Step 1 to also handle `deficit` mode:

```tsx
onClick={e => {
  if (chartInteractionMode === 'twoClick') {
    // ... (existing twoClick code)
  } else if (chartInteractionMode === 'deficit') {
    const idx = e?.activeTooltipIndex
    if (idx == null) return
    const range = deficitRanges.find(r => idx >= r.lo && idx <= r.hi)
    if (!range) { setDragStart(null); setDragEnd(null); return }
    setDragStart(range.lo)
    setDragEnd(range.hi)
    fireSolveSelect(range.lo, range.hi)
  }
}}
```

- [ ] **Step 4: Show twoClick first-pin as a ReferenceLine**

After the drag selection `ReferenceArea`, add:

```tsx
{chartInteractionMode === 'twoClick' && clickPhase === 1 && clickStart !== null && (
  <ReferenceLine
    x={chartData[clickStart]?.label as string}
    stroke="#fbbf24"
    strokeDasharray="4 3"
    label={{ value: '① start', position: 'insideTopRight', fontSize: 9, fill: '#fbbf24' }}
  />
)}
```

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Smoke-test all three modes**

```bash
npm run dev
```

- Switch Config → Tweaks to **Drag**: drag across chart, see blue band.
- Switch to **2-Click**: click once, see amber pin line. Click again, blue band appears.
- Switch to **Deficit zone**: click inside a red deficit area, blue band auto-selects that zone. Click outside deficit area, selection clears.

- [ ] **Step 7: Commit**

```bash
git add src/components/MarginChart.tsx
git commit -m "feat: add 2-click and deficit-zone interaction modes to MarginChart"
```

---

## Task 4 — Wire `solveTarget` State in `page.tsx` + Pass Props

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Add `solveTarget` state**

After the existing `const [gspFilter, ...]` line, add:

```ts
const [solveTarget, setSolveTarget] = useState<{
  fromSp: number
  toSp: number
  worstDeficitMw: number
} | null>(null)
```

- [ ] **Step 2: Add `handleSolveSelect` callback**

After the `flashToast` function, add:

```ts
const handleSolveSelect = useCallback((fromSp: number, toSp: number, worstDeficitMw: number) => {
  setSolveTarget({ fromSp, toSp, worstDeficitMw })
  setActiveTab('workspace')
  if (activeDraftId) {
    updateDraftWindow(activeDraftId, fromSp, toSp)
  }
}, [activeDraftId, updateDraftWindow])
```

- [ ] **Step 3: Clear `solveTarget` when data loads**

Find the `loadData` callback. After `setSPs(settlementPeriods)` add:

```ts
setSolveTarget(null)
```

Do the same in `loadHistoricalData` after `setSPs(settlementPeriods)`.

- [ ] **Step 4: Pass new props to `MarginChart`**

Find the `<MarginChart>` usage in the chart tab render and add:

```tsx
<MarginChart
  hiddenDraftIds={hiddenDraftIds}
  reservePct={tweaks.reservePct}
  chartInteractionMode={tweaks.chartInteractionMode}
  onSolveSelect={handleSolveSelect}
/>
```

- [ ] **Step 5: Pass `solveMw` to `DraftDetails`**

Find the `<DraftDetails>` usage and add one prop:

```tsx
<DraftDetails
  ...existing props...
  solveMw={solveTarget?.worstDeficitMw ?? null}
  onChangeFrom={from => {
    setSolveTarget(null)   // user took manual control
    updateDraftWindow(activeDraftId!, from, activeDraft.toPeriod)
  }}
  onChangeTo={to => {
    setSolveTarget(null)   // user took manual control
    updateDraftWindow(activeDraftId!, activeDraft.fromPeriod, to)
  }}
/>
```

Note: the existing inline `onChangeFrom`/`onChangeTo` lambdas are replaced by these new ones that also clear `solveTarget`.

- [ ] **Step 6: Pass `solveMode`/`solveMw` to `AvailableTable`**

Find the `<AvailableTable>` usage and add:

```tsx
<AvailableTable
  ...existing props...
  solveMode={solveTarget !== null}
  solveMw={solveTarget ? Math.abs(solveTarget.worstDeficitMw) : null}
/>
```

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors that `solveMw` is not a known prop on `DraftDetails` and `AvailableTable` — those get fixed in the next two tasks.

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add solveTarget state and handleSolveSelect in page.tsx"
```

---

## Task 5 — Add Solve Bar Below Chart

**Files:**
- Modify: `src/app/page.tsx`

The Solve bar lives in the Chart tab layout in `page.tsx`, below `<MarginChart>`. It shows From, To, Duration, Worst Deficit, and the Solve button. It is always rendered when on the chart tab, but greys out until a selection is made.

- [ ] **Step 1: Add a helper to format SP slot → time string**

Near the top of the `Home` component (after the store selectors), add:

```ts
function fmtSlot(sp: number | undefined): string {
  if (!sp) return '—'
  const found = settlementPeriods.find(s => s.settlementPeriod === sp)
  return found ? found.startTime.slice(11, 16) : `SP ${sp}`
}
```

- [ ] **Step 2: Add Solve bar JSX in the chart tab**

Find the chart tab render block:

```tsx
{activeTab === 'chart' && (
  <div style={{ ... }}>
    <MarginChart ... />
  </div>
)}
```

Replace the inner layout with:

```tsx
{activeTab === 'chart' && (
  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, padding: '10px 0' }}>
    <MarginChart
      hiddenDraftIds={hiddenDraftIds}
      reservePct={tweaks.reservePct}
      chartInteractionMode={tweaks.chartInteractionMode}
      onSolveSelect={handleSolveSelect}
    />

    {/* Solve bar */}
    <div style={{
      display: 'flex', alignItems: 'center', gap: 20,
      padding: '10px 16px',
      background: 'var(--bg-panel)',
      border: `1px solid ${solveTarget ? '#6366f1' : 'var(--border)'}`,
      borderRadius: 8,
      transition: 'border-color 0.2s',
    }}>
      {(['From', 'To', 'Duration', 'Worst Deficit'] as const).map(lbl => {
        let val = '—'
        let color: string | undefined
        if (solveTarget) {
          const dur = (solveTarget.toSp - solveTarget.fromSp + 1) * 30
          if (lbl === 'From')         val = fmtSlot(solveTarget.fromSp)
          if (lbl === 'To')           val = fmtSlot(solveTarget.toSp)
          if (lbl === 'Duration')     val = dur < 60 ? `${dur} min` : `${(dur / 60).toFixed(1)} h`
          if (lbl === 'Worst Deficit') { val = `${Math.round(solveTarget.worstDeficitMw).toLocaleString('en-GB')} MW`; color = '#ef4444' }
        }
        return (
          <div key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-faint)' }}>{lbl}</span>
            <span style={{ fontSize: 12, fontFamily: 'var(--font-mono, monospace)', color: color ?? (solveTarget ? 'var(--text)' : 'var(--text-faint)'), fontWeight: color ? 700 : 400 }}>{val}</span>
          </div>
        )
      })}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
        {solveTarget && (
          <button
            style={{ fontSize: 11, color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}
            onClick={() => setSolveTarget(null)}
          >
            ✕ Clear
          </button>
        )}
        <button
          className="btn btn-primary"
          disabled={!solveTarget}
          onClick={() => solveTarget && setActiveTab('workspace')}
          style={{ fontSize: 12, opacity: solveTarget ? 1 : 0.35, padding: '6px 16px' }}
        >
          Solve ↗
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors only from `DraftDetails`/`AvailableTable` missing new props (fixed in Tasks 6–7).

- [ ] **Step 4: Smoke-test**

```bash
npm run dev
```

Go to Chart tab. A solve bar with `—` placeholders should appear below the chart. After dragging a deficit area, Solve bar populates. Clicking Solve switches to Workspace tab.

- [ ] **Step 5: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: add Solve bar below MarginChart on Chart tab"
```

---

## Task 6 — Add MW to Solve Field in DraftDetails

**Files:**
- Modify: `src/components/DraftDetails.tsx`

- [ ] **Step 1: Add `solveMw` to the Props interface**

Find the `interface Props` at the top of `DraftDetails.tsx` and add:

```ts
interface Props {
  ...existing fields...
  solveMw?: number | null   // negative MW value from solve target; null = not in solve mode
}
```

- [ ] **Step 2: Destructure `solveMw` in the component**

Find the destructuring at the start of the component function body:

```ts
function DraftDetails({
  draft, settlementPeriods, currentUser,
  onChangeName, onChangeFrom, onChangeTo,
  ...
}: Props) {
```

Add `solveMw = null` to the destructure.

- [ ] **Step 3: Render the MW to solve field**

Find the From/To time-pickers row in the JSX (the `.time-pickers` div). After it (before the action buttons row), add:

```tsx
{solveMw !== null && solveMw !== undefined && (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
    <span style={{ fontSize: 11, color: 'var(--text-faint)' }}>MW to solve:</span>
    <span style={{
      fontSize: 12,
      fontFamily: 'var(--font-mono, monospace)',
      fontWeight: 700,
      color: '#ef4444',
      background: 'rgba(239,68,68,0.08)',
      border: '1px solid rgba(239,68,68,0.3)',
      borderRadius: 4,
      padding: '1px 8px',
    }}>
      {Math.round(solveMw).toLocaleString('en-GB')} MW
    </span>
    <span style={{ fontSize: 10, color: 'var(--text-faint)', fontStyle: 'italic' }}>deficit — adjust chart range to change</span>
  </div>
)}
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: only AvailableTable prop errors remain.

- [ ] **Step 5: Smoke-test**

```bash
npm run dev
```

Drag a deficit on Chart, click Solve. On Workspace tab, the MW to solve badge should appear in the draft details panel.

- [ ] **Step 6: Commit**

```bash
git add src/components/DraftDetails.tsx
git commit -m "feat: add MW to solve display field in DraftDetails"
```

---

## Task 7 — Pre-check Covering Set in AvailableTable (Solve Mode)

**Files:**
- Modify: `src/components/AvailableTable.tsx`

When `solveMode` is true, the table is already sorted by `scenarioScore` (this happens in the existing `visible` memo when `scenario !== 'none'`). We need to:
1. Accept the new props
2. Pre-seed `pendingIds` with the minimum covering set when solve mode activates
3. Visually highlight the covering set rows

- [ ] **Step 1: Add new props to the `Props` interface**

In `src/components/AvailableTable.tsx`, the `Props` interface starts at line 7. Add the two new fields at the end:

```ts
interface Props {
  units: BMUnit[]
  unitPnByBmUnit: Record<string, number>
  unitServices: Record<string, ServiceType>
  activeDraftUnitIds: Set<string>
  otherDraftUnitMap: Map<string, string[]>
  selectionPattern: 'buttons' | 'click'
  readOnly: boolean
  voltageArea: string
  scenario: string
  gspFilter: Record<string, 'include' | 'exclude'>
  onAddUnits: (ids: string[]) => void
  solveMode?: boolean
  solveMw?: number | null   // positive MW magnitude (e.g. 312, not -312)
}
```

- [ ] **Step 2: Destructure the new props**

```ts
export default function AvailableTable({
  units, unitPnByBmUnit, unitServices, activeDraftUnitIds, otherDraftUnitMap,
  selectionPattern, readOnly, voltageArea, scenario, gspFilter, onAddUnits,
  solveMode = false, solveMw = null,
}: Props) {
```

- [ ] **Step 3: Compute the covering set**

Add a memo after the existing `visible` memo:

```ts
const coveringSet = useMemo<Set<string>>(() => {
  if (!solveMode || !solveMw || solveMw <= 0) return new Set()
  let running = 0
  const ids = new Set<string>()
  for (const row of visible) {
    if (activeDraftUnitIds.has(row.bmUnitId)) continue
    const available = Math.max(0, row.mel - row.pn)
    if (available <= 0) continue
    ids.add(row.bmUnitId)
    running += available
    if (running >= solveMw) break
  }
  return ids
}, [solveMode, solveMw, visible, activeDraftUnitIds])
```

- [ ] **Step 4: Seed `pendingIds` when solve mode activates**

Add a `useEffect` after the covering set memo:

```ts
useEffect(() => {
  if (solveMode && coveringSet.size > 0) {
    setPendingIds(new Set(coveringSet))
  }
}, [solveMode, coveringSet])
```

- [ ] **Step 5: Add row highlight classes for the covering set**

Find the table row render in the JSX. The existing `<tr>` for each row currently has no special class for solve mode. Update the row to apply a highlight when in solve mode:

Find the existing `<tr>` render (it uses `handleRowClick` and has a `key={row.bmUnitId}`). Replace or extend the `className` / `style` on that `<tr>`:

```tsx
<tr
  key={row.bmUnitId}
  onClick={() => handleRowClick(row)}
  style={{
    cursor: selectionPattern === 'click' && !readOnly && !activeDraftUnitIds.has(row.bmUnitId) ? 'pointer' : undefined,
    background: solveMode && coveringSet.has(row.bmUnitId)
      ? 'rgba(99,102,241,0.12)'
      : undefined,
    outline: solveMode && coveringSet.has(row.bmUnitId)
      ? '1px solid rgba(99,102,241,0.3)'
      : undefined,
  }}
>
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Full flow smoke-test**

```bash
npm run dev
```

1. App loads. Go to Chart tab.
2. Ensure Scenario is set to "Margin" in the Workspace (DraftDetails Scenario button).
3. Drag across a red deficit area on the chart. Solve bar populates with From/To/Duration/Worst Deficit.
4. Click **Solve ↗**. App switches to Workspace tab.
5. Check DraftDetails: From and To fields should be pre-filled with the selected range. MW to solve badge visible.
6. Check Available table: units are sorted by available MW (highest first). The minimum covering set rows have an indigo highlight and are pre-checked.
7. Uncheck one highlighted row — the checkbox unchecks normally.
8. Check an unhighlighted row — the checkbox checks normally.
9. Click **Select** — existing behaviour, adds all checked units to the draft.

- [ ] **Step 8: Test with Scenario = None**

Set scenario to "No scenario" in DraftDetails, then redo the flow. Available table should still be pre-checked (covering set computed) but sorted by the default column sort.

- [ ] **Step 9: Test the interaction mode tweaks**

Open Config → Tweaks:
- Switch to **2-Click**: click once on chart (amber pin appears), click again (range selected, solve bar populates).
- Switch to **Deficit zone**: click inside a red area (auto-selects full contiguous deficit zone).

- [ ] **Step 10: Commit**

```bash
git add src/components/AvailableTable.tsx
git commit -m "feat: pre-check covering unit set in AvailableTable when solve mode active"
```

---

## Task 8 — Final Polish + TypeScript Clean-Up

**Files:**
- Modify: `src/app/page.tsx`, `src/components/MarginChart.tsx`

- [ ] **Step 1: Reset chart selection when tab changes away from chart**

In `page.tsx`, the `MarginChart` is only rendered when `activeTab === 'chart'`. This means React unmounts and remounts it each time the tab switches, which naturally resets local state. Verify this is the case — no extra reset logic needed.

If `MarginChart` is ever rendered outside a conditional (check `page.tsx`), add:
```tsx
// In MarginChart: reset interaction state when mode changes (already added in Task 3 Step 1)
```

- [ ] **Step 2: Verify `solveTarget` clears on Refresh**

In `page.tsx`, confirm `setSolveTarget(null)` is present in both `loadData` and `loadHistoricalData` (added in Task 4 Step 3). If missing, add it.

- [ ] **Step 3: Run full type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4: Run build check**

```bash
npm run build
```

Expected: builds successfully with no type errors.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: deficit solver — final type-check and polish"
```

---

## Complete Flow Summary

After all tasks, the full user journey works:

1. **Chart tab, Drag mode (default)**: drag across any range → blue band + solve bar populates
2. **Solve button** (only enabled when deficit found in range): switches to Workspace tab
3. **Workspace tab**: From/To pre-filled in DraftDetails; MW to solve badge visible; Available table sorted by scenario with covering set pre-checked in indigo
4. **Operator review**: tick/untick freely; clicks existing **Select** button → units added to draft as normal
5. **Config → Tweaks**: switch between Drag / 2-Click / Deficit zone interaction styles
6. **Clear**: ✕ Clear button in solve bar resets, or manually editing From/To in DraftDetails clears solve mode
