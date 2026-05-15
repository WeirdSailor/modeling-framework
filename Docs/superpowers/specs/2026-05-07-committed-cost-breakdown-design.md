# Committed Tab — Cost Breakdown by Reason Code

**Date:** 2026-05-07  
**Status:** Approved

---

## Goal

Give operators a fast read of what each operational need is costing within the committed scheduling solution — without leaving the Committed tab.

---

## Design

### Layout

The Committed tab gains a new **cost breakdown row** inserted between the existing summary-pills bar (unit count + draft badges) and the table. Everything else on the tab stays unchanged.

```
┌─────────────────────────────────────────────────────────┐
│ 9 units across 3 committed drafts  [Alpha] [Bravo] [...]│  ← existing
├─────────────────────────────────────────────────────────┤
│ [Total £194k]  [Margin £87k]  [Inertia £52k]  ...      │  ← NEW
├─────────────────────────────────────────────────────────┤
│ ☐ BMU  Type  NDZ  MZT  MNZT  SEL  MEL  £SEL  £MEL  ... │  ← existing table
│ ...                                                     │
└─────────────────────────────────────────────────────────┘
```

### Cards

Six cards in a horizontal flex row (wraps on narrow viewports):

| Position | Label      | Accent colour |
|----------|------------|---------------|
| 1st      | Total      | Blue (#58a6ff) |
| 2nd      | Margin     | Amber (#f59e0b) |
| 3rd      | Inertia    | Purple (#8b5cf6) |
| 4th      | Voltage    | Cyan (#06b6d4) |
| 5th      | Reserve    | Orange (#f97316) |
| 6th      | Constraint | Pink (#ec4899) |

Each card shows:
- Reason label (small caps, accent colour)
- Estimated cost (`£Xk` formatted, large)
- Unit count + total MEL (`N units · X,XXX MW`)

Cards with **0 units** render at `opacity: 0.4` and are still clickable (clicking resets to Total).

### Interaction

- One card active at a time. Default: **Total**.
- Clicking a reason card sets `selectedReason` to that code → table filters to matching rows.
- Clicking the already-active card resets to Total (`selectedReason = null`).
- Clicking Total always resets to null.
- Active card: coloured border (2px, accent colour) + slightly elevated background.

### Cost Formula

Consistent with the draft cost shown in `DraftDetails`:

```
cost per unit = max(0, MEL − PN) × £120
```

- MEL = `unit.registeredCapacity`
- PN = `unitPnByBmUnit[bmUnitId]` (already in `CommittedRow`)
- £120 = static price placeholder (same constant used everywhere)

The **Total** card sums this across all rows (a unit appearing in two committed drafts counts twice — consistent with how `rows` is already built).

### State & Data — inside `CommittedTab` only

New local state:
```ts
const [selectedReason, setSelectedReason] = useState<ModellingAction['reasonCode'] | null>(null)
```

New derived values (computed from existing `rows`):

```ts
// Summary per reason code
const reasonSummaries = useMemo(() => {
  const CODES: ModellingAction['reasonCode'][] = ['MARGIN','INERTIA','VOLTAGE','RESERVE','CONSTRAINT']
  return CODES.map(code => {
    const matching = rows.filter(r => r.reasonCode === code)
    const cost = matching.reduce((s, r) => s + Math.max(0, r.mel - r.pn) * 120, 0)
    const totalMel = matching.reduce((s, r) => s + r.mel, 0)
    return { code, count: matching.length, cost, totalMel }
  })
}, [rows])

// Total across all committed rows
const totalSummary = useMemo(() => ({
  count: rows.length,
  cost: rows.reduce((s, r) => s + Math.max(0, r.mel - r.pn) * 120, 0),
  totalMel: rows.reduce((s, r) => s + r.mel, 0),
}), [rows])
```

Filtered rows for the table:
```ts
const visibleRows = selectedReason
  ? rows.filter(r => r.reasonCode === selectedReason)
  : rows
```

### No prop changes

All new state and derived data live inside `CommittedTab`. `page.tsx`, the store, and all other components are untouched.

### Imports needed

`CommittedTab` already imports `ModellingAction` — no new imports required beyond what's already there.

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/CommittedTab.tsx` | Add cost breakdown cards row, `selectedReason` state, filtering logic |

No other files change.

---

## Out of Scope

- Real offer prices (£120 remains a static placeholder)
- Persisting the selected reason across tab switches (resets to Total on remount — acceptable)
- Multi-select reason filtering
