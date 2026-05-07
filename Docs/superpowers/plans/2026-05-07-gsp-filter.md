# GSP Group Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-zone include/exclude GSP group filter to the Available Units panel via a toolbar popover.

**Architecture:** All changes are confined to `src/components/AvailableTable.tsx`. A `GspFilterPopover` subcomponent is defined inline above the main component. Filter state is local React state (`gspFilter`, `gspPopoverOpen`). The existing `visible` memo gets one extra filter step using `GSP_AREAS` from the existing config.

**Tech Stack:** React 18 hooks (`useState`, `useMemo`, `useEffect`, `useRef`), TypeScript, inline styles (CSS variable tokens from `globals.css`).

---

## File Map

| File | Change |
|------|--------|
| `src/components/AvailableTable.tsx` | Add import, state, subcomponent, memo step, toolbar button |

No other files touched.

---

### Task 1: Add import and filter state

**Files:**
- Modify: `src/components/AvailableTable.tsx:3-5` (imports)
- Modify: `src/components/AvailableTable.tsx:112-115` (state declarations)

- [ ] **Step 1: Update the import on line 3 to add `useRef` and `useEffect`**

Replace line 3:
```ts
import { useState, useMemo, useCallback } from 'react'
```
With:
```ts
import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
```

- [ ] **Step 2: Update the scenarios import on line 5 to include `GSP_AREAS`**

Replace line 5:
```ts
import { SCENARIOS } from '@/config/scenarios'
```
With:
```ts
import { SCENARIOS, GSP_AREAS } from '@/config/scenarios'
```

- [ ] **Step 3: Add the two new state declarations inside `AvailableTable`, after the existing `useState` lines (currently lines 112–115)**

After:
```ts
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
```
Add:
```ts
  const [gspFilter, setGspFilter] = useState<Record<string, 'include' | 'exclude'>>({})
  const [gspPopoverOpen, setGspPopoverOpen] = useState(false)
```

- [ ] **Step 4: Verify TypeScript is happy**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/AvailableTable.tsx
git commit -m "feat(gsp-filter): add state and imports to AvailableTable"
```

---

### Task 2: Add GSP filter step to the visible memo

**Files:**
- Modify: `src/components/AvailableTable.tsx:139-162` (the `visible` useMemo)

- [ ] **Step 1: Replace the entire `visible` useMemo with the version below**

Find the block starting with `const visible = useMemo(() => {` (currently line 139) and replace it entirely with:

```ts
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const gspIncluded = Object.entries(gspFilter).filter(([, v]) => v === 'include').map(([k]) => k)
    const gspExcluded = Object.entries(gspFilter).filter(([, v]) => v === 'exclude').map(([k]) => k)
    let filtered = rows.filter(r => {
      if (typeFilter !== 'All' && r.fuelType !== typeFilter) return false
      if (gspIncluded.length > 0 && !gspIncluded.includes(r.gspGroup)) return false
      if (gspExcluded.includes(r.gspGroup)) return false
      if (!q) return true
      return (
        r.bmUnitId.toLowerCase().includes(q) ||
        r.nationalGridBmUnit.toLowerCase().includes(q) ||
        r.fuelType.toLowerCase().includes(q)
      )
    })
    if (scenario !== 'none') {
      filtered.sort((a, b) => scenarioScore(b, scenario, voltageArea) - scenarioScore(a, scenario, voltageArea))
    } else {
      filtered.sort((a, b) => {
        const av = a[sort.key], bv = b[sort.key]
        const cmp = typeof av === 'number'
          ? (av as number) - (bv as number)
          : String(av).localeCompare(String(bv))
        return sort.dir === 'asc' ? cmp : -cmp
      })
    }
    return filtered
  }, [rows, search, typeFilter, gspFilter, sort, scenario, voltageArea])
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AvailableTable.tsx
git commit -m "feat(gsp-filter): add GSP include/exclude filter to visible memo"
```

---

### Task 3: Build the GspFilterPopover subcomponent

**Files:**
- Modify: `src/components/AvailableTable.tsx` — add subcomponent above the `export default` function

- [ ] **Step 1: Insert the `GspFilterPopover` component**

Add the following block immediately before the line `export default function AvailableTable(` (currently line 108):

```tsx
interface GspFilterPopoverProps {
  gspFilter: Record<string, 'include' | 'exclude'>
  onChange: (filter: Record<string, 'include' | 'exclude'>) => void
  onClose: () => void
}

function GspFilterPopover({ gspFilter, onChange, onClose }: GspFilterPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  function setZone(id: string, seg: 'include' | 'exclude' | null) {
    const next = { ...gspFilter }
    if (seg === null) delete next[id]
    else next[id] = seg
    onChange(next)
  }

  const includedIds = Object.entries(gspFilter).filter(([, v]) => v === 'include').map(([k]) => k)
  const excludedIds = Object.entries(gspFilter).filter(([, v]) => v === 'exclude').map(([k]) => k)

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
        background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
        borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.35)', width: 268,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)' }}>
          GSP Groups
        </span>
        <button
          style={{ background: 'none', border: 0, color: '#6366f1', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}
          onClick={() => onChange({})}
        >
          Clear all
        </button>
      </div>

      {/* Zone rows */}
      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
        {GSP_AREAS.map(area => {
          const state = gspFilter[area.id] ?? null
          return (
            <div key={area.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 12px', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text)' }}>{area.label}</span>
              <div style={{ display: 'flex', border: '1px solid var(--border-strong)', borderRadius: 5, overflow: 'hidden', flexShrink: 0 }}>
                {(['include', null, 'exclude'] as const).map((seg, i) => {
                  const active = state === seg
                  const label = seg === 'include' ? '+' : seg === 'exclude' ? '−' : '·'
                  let bg = 'var(--bg-panel)'
                  let color = 'var(--text-faint)'
                  if (active && seg === 'include') { bg = 'rgba(5,150,105,.15)'; color = '#6ee7b7' }
                  if (active && seg === null)      { bg = 'var(--bg-subtle)';    color = 'var(--text)' }
                  if (active && seg === 'exclude') { bg = 'rgba(220,38,38,.15)'; color = '#fca5a5' }
                  return (
                    <button
                      key={i}
                      style={{
                        padding: '3px 8px', fontSize: 11, fontWeight: 600,
                        background: bg, color, border: 'none',
                        borderRight: i < 2 ? '1px solid var(--border-strong)' : 'none',
                        cursor: 'pointer', lineHeight: 1.4,
                      }}
                      onClick={() => setZone(area.id, seg)}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer summary — only shown when filter is active */}
      {(includedIds.length > 0 || excludedIds.length > 0) && (
        <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--text-faint)' }}>
          {includedIds.length > 0 && (
            <span>Showing: <span style={{ color: '#6ee7b7' }}>{includedIds.join(', ')}</span></span>
          )}
          {includedIds.length > 0 && excludedIds.length > 0 && (
            <span style={{ margin: '0 6px' }}>·</span>
          )}
          {excludedIds.length > 0 && (
            <span>Hiding: <span style={{ color: '#fca5a5' }}>{excludedIds.join(', ')}</span></span>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/AvailableTable.tsx
git commit -m "feat(gsp-filter): add GspFilterPopover subcomponent"
```

---

### Task 4: Add toolbar button and wire up popover

**Files:**
- Modify: `src/components/AvailableTable.tsx` — the toolbar JSX section (around line 244 after the earlier additions)

- [ ] **Step 1: Insert the GSP button + popover after the scenario `<select>` in the toolbar**

Find this block in the JSX (inside the `<div className="toolbar">`):
```tsx
          <select
            value={scenario}
            onChange={e => onScenarioChange(e.target.value)}
            title="Scenario — ranks units by operational priority"
          >
            <option value="none">Scenario…</option>
            {SCENARIOS.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
```

Add the following immediately after it (still inside the `<div className="toolbar">`):
```tsx
          {/* GSP filter */}
          {(() => {
            const incCount = Object.values(gspFilter).filter(v => v === 'include').length
            const excCount = Object.values(gspFilter).filter(v => v === 'exclude').length
            const active = incCount > 0 || excCount > 0
            const excOnly = excCount > 0 && incCount === 0
            return (
              <div style={{ position: 'relative' }}>
                <button
                  style={{
                    border: `1px solid ${active ? (excOnly ? '#dc2626' : '#4f46e5') : 'var(--border-strong)'}`,
                    borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                    background: active ? (excOnly ? 'rgba(220,38,38,.1)' : 'rgba(79,70,229,.1)') : 'var(--bg-panel)',
                    color: active ? (excOnly ? '#fca5a5' : '#a5b4fc') : 'var(--text-soft)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                  onClick={() => setGspPopoverOpen(o => !o)}
                >
                  GSP ▾
                  {incCount > 0 && (
                    <span style={{ background: '#4f46e5', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>
                      +{incCount}
                    </span>
                  )}
                  {excCount > 0 && (
                    <span style={{ background: '#dc2626', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>
                      −{excCount}
                    </span>
                  )}
                </button>
                {gspPopoverOpen && (
                  <GspFilterPopover
                    gspFilter={gspFilter}
                    onChange={setGspFilter}
                    onClose={() => setGspPopoverOpen(false)}
                  />
                )}
              </div>
            )
          })()}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```
Expected: no errors.

- [ ] **Step 3: Start dev server and verify in browser**

```bash
npm run dev
```

Open http://localhost:3000. On the workspace tab:

1. The Available Units toolbar should show a "GSP ▾" button after the Scenario select.
2. Click "GSP ▾" — the popover should open showing 14 zone rows, each with [+ · −] toggles.
3. Click `+` on `_F — North Scotland` — it should turn green, the button badge should show `+1`.
4. Click `−` on `_P — Northern England` — it should turn red, the button badge should show `+1 −1`.
5. The table should now show only _F units (with _P units hidden from those).
6. The footer summary in the open popover should show "Showing: _F · Hiding: _P".
7. Click `·` on `_F` to reset it — the inclusion disappears, badge updates to `−1`.
8. Click outside the popover — it should close.
9. Click "GSP ▾" again — popover reopens with the same filter state.
10. Click "Clear all" — all toggles reset, button returns to inactive state.
11. Press Escape — popover closes.

- [ ] **Step 4: Commit**

```bash
git add src/components/AvailableTable.tsx
git commit -m "feat(gsp-filter): add GSP filter toolbar button and wire up popover"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|-----------------|------|
| `gspFilter` state `Record<string, 'include'\|'exclude'>` | Task 1 |
| `gspPopoverOpen` state | Task 1 |
| `GSP_AREAS` import from `scenarios.ts` | Task 1 |
| Filter logic: included/excluded arrays, per-row checks | Task 2 |
| `gspFilter` in `visible` dependency array | Task 2 |
| `GspFilterPopover` subcomponent with header, zone rows, footer | Task 3 |
| `[+ · −]` segmented toggle per zone | Task 3 |
| Click-outside dismiss (`document.mousedown`) | Task 3 |
| Escape key dismiss | Task 3 |
| Footer summary "Showing: … · Hiding: …" | Task 3 |
| Toolbar button with indigo/red badge states | Task 4 |
| Popover anchored below button, `position: absolute` | Task 4 |
| All changes confined to `AvailableTable.tsx` | All tasks |
| No store/props/page.tsx changes | All tasks |
