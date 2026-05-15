# Committed Cost Breakdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a row of cost-summary cards to the Committed tab that shows total scheduling solution cost plus a per-reason-code breakdown, with click-to-filter on the table below.

**Architecture:** All changes are self-contained in `CommittedTab.tsx`. A new `selectedReason` state drives filtering of the existing `rows` array into a `visibleRows` array that the table renders. Six summary cards (Total + 5 reason codes) are computed from `rows` via useMemo and rendered between the existing summary-pills bar and the table.

**Tech Stack:** React (useState, useMemo), TypeScript — no new dependencies.

> **Note:** This project has no test suite (see CLAUDE.md). TDD steps are replaced with TypeScript type-checking (`npx tsc --noEmit`) and visual browser verification.

---

## File Map

| File | Change |
|------|--------|
| `src/components/CommittedTab.tsx` | All changes — state, derived data, cards UI, table filtering |

---

### Task 1: Add selectedReason state, colour map, and summary data

**Files:**
- Modify: `src/components/CommittedTab.tsx`

- [ ] **Step 1: Add the colour map and cost helper constant**

  Add these two constants directly below the existing `REASON_LABEL` block (after line 13):

  ```ts
  const STATIC_PRICE = 120

  const REASON_COLORS: Record<ModellingAction['reasonCode'], string> = {
    MARGIN:     '#f59e0b',
    INERTIA:    '#8b5cf6',
    VOLTAGE:    '#06b6d4',
    RESERVE:    '#f97316',
    CONSTRAINT: '#ec4899',
  }

  const REASON_ORDER: ModellingAction['reasonCode'][] = ['MARGIN', 'INERTIA', 'VOLTAGE', 'RESERVE', 'CONSTRAINT']

  function formatCost(cost: number): string {
    if (cost === 0) return '—'
    if (cost >= 1_000_000) return `£${(cost / 1_000_000).toFixed(1)}m`
    if (cost >= 1_000)     return `£${Math.round(cost / 1_000)}k`
    return `£${Math.round(cost)}`
  }
  ```

  > Note: `STATIC_PRICE` was previously declared in this file but is now removed from the columns — this re-adds it as the shared constant for the cost formula.

- [ ] **Step 2: Add `selectedReason` state inside the component**

  In `CommittedTab`, add this new state declaration immediately after the existing `const [selected, ...]` line (after line 69):

  ```ts
  const [selectedReason, setSelectedReason] = useState<ModellingAction['reasonCode'] | null>(null)
  ```

- [ ] **Step 3: Add `reasonSummaries` and `totalSummary` memos**

  Add these two memos immediately after the existing `rows` memo (after line 107):

  ```ts
  const reasonSummaries = useMemo(() =>
    REASON_ORDER.map(code => {
      const matching = rows.filter(r => r.reasonCode === code)
      return {
        code,
        count: matching.length,
        cost: matching.reduce((s, r) => s + Math.max(0, r.mel - r.pn) * STATIC_PRICE, 0),
        totalMel: matching.reduce((s, r) => s + r.mel, 0),
      }
    })
  , [rows])

  const totalSummary = useMemo(() => ({
    count: rows.length,
    cost: rows.reduce((s, r) => s + Math.max(0, r.mel - r.pn) * STATIC_PRICE, 0),
    totalMel: rows.reduce((s, r) => s + r.mel, 0),
  }), [rows])
  ```

- [ ] **Step 4: Add `visibleRows` and update checkbox derived values**

  Add `visibleRows` immediately after the two new memos:

  ```ts
  const visibleRows = selectedReason
    ? rows.filter(r => r.reasonCode === selectedReason)
    : rows
  ```

  Then update the two lines that compute `allChecked` and `someChecked` to use `visibleRows` instead of `rows`:

  ```ts
  const allChecked = visibleRows.length > 0 && visibleRows.every(r => selected.has(r.key))
  const someChecked = visibleRows.some(r => selected.has(r.key))
  ```

  And update `toggleAll` to operate on `visibleRows`:

  ```ts
  function toggleAll() {
    setSelected(prev => {
      if (allChecked) return new Set()
      return new Set(visibleRows.map(r => r.key))
    })
  }
  ```

- [ ] **Step 5: Add a `handleReasonSelect` click handler**

  Add this function after `handleRemove`:

  ```ts
  function handleReasonSelect(code: ModellingAction['reasonCode'] | null) {
    setSelectedReason(prev => prev === code ? null : code)
    setSelected(new Set())
  }
  ```

  > Clicking the active reason card resets to Total (null). Clicking Total always sets null. Switching reason also clears checkbox selection to avoid confusion.

- [ ] **Step 6: Update the table body to render `visibleRows`**

  In the `<tbody>`, change `{rows.map(row => (` to `{visibleRows.map(row => (`:

  ```tsx
  {visibleRows.map(row => (
    <tr
      key={row.key}
  ```

- [ ] **Step 7: Type-check**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 8: Commit**

  ```bash
  git add src/components/CommittedTab.tsx
  git commit -m "feat: add committed cost breakdown state, summaries, and row filtering"
  ```

---

### Task 2: Render the cost breakdown cards row

**Files:**
- Modify: `src/components/CommittedTab.tsx`

- [ ] **Step 1: Insert the cards row between summary pills and table**

  Find the comment `{/* Table */}` (currently around line 164) and insert the cards row immediately before it:

  ```tsx
  {/* Cost breakdown cards */}
  <div style={{
    padding: '10px 20px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-panel)',
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap',
    flexShrink: 0,
  }}>
    {/* Total card */}
    {(() => {
      const isActive = selectedReason === null
      return (
        <div
          onClick={() => handleReasonSelect(null)}
          style={{
            background: isActive ? 'color-mix(in srgb, #58a6ff 12%, var(--bg-inset))' : 'var(--bg-inset)',
            border: `2px solid ${isActive ? '#58a6ff' : 'var(--border)'}`,
            borderRadius: 6,
            padding: '8px 14px',
            cursor: 'pointer',
            minWidth: 100,
            transition: 'border-color 0.1s, background 0.1s',
          }}
        >
          <div style={{ fontSize: 9, color: '#58a6ff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px' }}>
            Total
          </div>
          <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, margin: '3px 0', fontFamily: 'monospace' }}>
            {formatCost(totalSummary.cost)}
          </div>
          <div style={{ color: 'var(--text-soft)', fontSize: 10 }}>
            {totalSummary.count} unit{totalSummary.count !== 1 ? 's' : ''} · {Math.round(totalSummary.totalMel).toLocaleString()} MW
          </div>
        </div>
      )
    })()}

    {/* Per-reason cards */}
    {reasonSummaries.map(({ code, count, cost, totalMel }) => {
      const isActive = selectedReason === code
      const color = REASON_COLORS[code]
      const isEmpty = count === 0
      return (
        <div
          key={code}
          onClick={() => handleReasonSelect(code)}
          style={{
            background: isActive ? `color-mix(in srgb, ${color} 12%, var(--bg-inset))` : 'var(--bg-inset)',
            border: `2px solid ${isActive ? color : 'var(--border)'}`,
            borderRadius: 6,
            padding: '8px 14px',
            cursor: 'pointer',
            minWidth: 100,
            opacity: isEmpty ? 0.4 : 1,
            transition: 'border-color 0.1s, background 0.1s, opacity 0.1s',
          }}
        >
          <div style={{ fontSize: 9, color, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px' }}>
            {REASON_LABEL[code]}
          </div>
          <div style={{ color: 'var(--text)', fontSize: 16, fontWeight: 700, margin: '3px 0', fontFamily: 'monospace' }}>
            {formatCost(cost)}
          </div>
          <div style={{ color: 'var(--text-soft)', fontSize: 10 }}>
            {count} unit{count !== 1 ? 's' : ''}{count > 0 ? ` · ${Math.round(totalMel).toLocaleString()} MW` : ''}
          </div>
        </div>
      )
    })}
  </div>
  ```

- [ ] **Step 2: Type-check**

  ```bash
  npx tsc --noEmit
  ```

  Expected: no errors.

- [ ] **Step 3: Visual verification in the browser — open http://localhost:3000**

  Commit at least one draft with units tagged to different reason codes, then go to the Committed tab and verify:

  - [ ] Six cards appear (Total + 5 reason codes) between the draft badges and the table
  - [ ] Total card shows aggregate cost, unit count, and total MEL
  - [ ] Reason cards with units show cost / count / MW
  - [ ] Reason cards with 0 units are visibly dimmed (~40% opacity)
  - [ ] Clicking a reason card filters the table to only those rows
  - [ ] Active card has a coloured border; inactive cards have the default border
  - [ ] Clicking the active reason card resets to Total (all rows visible)
  - [ ] Clicking Total always shows all rows
  - [ ] Checkbox "select all" only selects visible rows when a filter is active
  - [ ] Switching reason cards clears any checkbox selection

- [ ] **Step 4: Commit**

  ```bash
  git add src/components/CommittedTab.tsx
  git commit -m "feat: render cost breakdown cards on Committed tab"
  ```
