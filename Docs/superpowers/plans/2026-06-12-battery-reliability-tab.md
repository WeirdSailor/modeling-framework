# Battery Reliability Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third "Reliability" tab to the Battery section that shows, per settlement period in the selected window, how much battery capacity remains after stripping out constrained/contracted units and applying an operator de-rate, against a configurable MW requirement — via a per-SP stacked bar chart and a supporting unit table.

**Architecture:** Two new pure calculation utils (`computeBatteryAvailability`, `computeBatteryReliability`) form the seam between raw unit/SP data and the UI; `BatterySummaryTab`'s GSP/AS-Services/timeframe filter state is lifted to `page.tsx` and shared with the new `BatteryReliabilityTab` (which also gets its own local `requirementMW`/`deRatePct` state). A new shared `BatteryFilters.tsx` extracts the `AsServicesPopover` + `TIMEFRAME_OPTIONS` so both tabs render identical filter UI from shared state.

**Tech Stack:** Next.js 16 (client components), React 19, Zustand 5 (untouched — no new store state), Recharts 3.8.1 (`BarChart`/`Bar`/`Cell`/`ReferenceLine`), plain `.data-table` HTML tables (no AG Grid). No test framework — verification is `npx tsc --noEmit` plus manual dev-server checks.

---

## Reference spec

This plan implements `Docs/superpowers/specs/2026-06-11-battery-reliability-tab-design.md` in full. Read it for the "why" — this plan covers the "how".

---

### Task 1: `computeBatteryAvailability` util

**Files:**
- Create: `src/utils/batteryAvailability.ts`

- [ ] **Step 1: Create the file**

```ts
import type { BMUnit, SettlementPeriodData } from '@/models/types'
import { maxBatteryPn } from '@/utils/batteryPn'

export interface BatteryAvailabilityRow {
  bmUnitId: string
  nationalGridBmUnit: string
  gspGroup: string
  mel: number
  pn: number | undefined
  avail: number
  priceToMel: number
}

export function computeBatteryAvailability(
  units: BMUnit[],
  settlementPeriods: SettlementPeriodData[],
  spCount: number
): BatteryAvailabilityRow[] {
  const windowSps = [...settlementPeriods]
    .sort((a, b) => a.settlementPeriod - b.settlementPeriod)
    .slice(0, spCount)

  return units.map(u => {
    const worstPn = maxBatteryPn(u.bmUnitId, windowSps)
    const mel = u.registeredCapacity ?? 0
    return {
      bmUnitId: u.bmUnitId,
      nationalGridBmUnit: u.nationalGridBmUnit,
      gspGroup: u.gspGroup,
      mel,
      pn: worstPn,
      avail: Math.max(0, mel - (worstPn ?? 0)),
      priceToMel: u.priceToMel ?? 0,
    }
  })
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (the new file is not yet imported anywhere, so this just confirms it's self-consistent).

- [ ] **Step 3: Commit**

```bash
git add src/utils/batteryAvailability.ts
git commit -m "feat: add computeBatteryAvailability calculation seam"
```

---

### Task 2: Refactor `BatterySummaryTab` to use `computeBatteryAvailability`

This is the approved behaviour-preserving refactor: the inline `rows` calculation moves into the new util, and the `capacity` field is renamed to `avail` to match `BatteryAvailabilityRow`. No visual or behavioural change.

**Files:**
- Modify: `src/components/BatterySummaryTab.tsx`

- [ ] **Step 1: Swap the import**

Replace:
```ts
import { maxBatteryPn } from '@/utils/batteryPn'
```
with:
```ts
import { computeBatteryAvailability } from '@/utils/batteryAvailability'
```

- [ ] **Step 2: Remove the local `BatteryRow` interface**

Replace:
```ts
interface BatteryRow {
  bmUnitId: string
  nationalGridBmUnit: string
  gspGroup: string
  mel: number
  priceToMel: number
  pn: number | undefined
  capacity: number
}

export default function BatterySummaryTab({ units, settlementPeriods, unitServices }: Props) {
```
with:
```ts
export default function BatterySummaryTab({ units, settlementPeriods, unitServices }: Props) {
```

- [ ] **Step 3: Replace the `rows` useMemo body**

Replace:
```ts
  const rows = useMemo<BatteryRow[]>(() => {
    const windowSps = [...settlementPeriods]
      .sort((a, b) => a.settlementPeriod - b.settlementPeriod)
      .slice(0, spCount)

    return units.map(u => {
      const worstPn = maxBatteryPn(u.bmUnitId, windowSps)
      const mel = u.registeredCapacity ?? 0
      return {
        bmUnitId: u.bmUnitId,
        nationalGridBmUnit: u.nationalGridBmUnit,
        gspGroup: u.gspGroup,
        mel,
        priceToMel: u.priceToMel ?? 0,
        pn: worstPn,
        capacity: Math.max(0, mel - (worstPn ?? 0)),
      }
    })
  }, [units, settlementPeriods, spCount])
```
with:
```ts
  const rows = useMemo(
    () => computeBatteryAvailability(units, settlementPeriods, spCount),
    [units, settlementPeriods, spCount]
  )
```

- [ ] **Step 4: Rename `capacity` → `avail` at the three remaining call sites**

Replace:
```ts
  const sumCapacity = (list: typeof classified) => list.reduce((s, r) => s + r.capacity, 0)
```
with:
```ts
  const sumCapacity = (list: typeof classified) => list.reduce((s, r) => s + r.avail, 0)
```

Replace:
```ts
                cumulative += row.capacity
```
with:
```ts
                cumulative += row.avail
```

Replace:
```ts
                    <td className="mono num">{row.capacity.toFixed(0)}</td>
```
with:
```ts
                    <td className="mono num">{row.avail.toFixed(0)}</td>
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual visual check**

Run: `npm run dev`, open `http://localhost:3000`, switch to the **Battery** section → **Summary** tab.
Expected: Total/Contracted/Constrained/Usable cards and the table (with Cumulative column) render exactly as before — same numbers as prior to this change.

- [ ] **Step 7: Commit**

```bash
git add src/components/BatterySummaryTab.tsx
git commit -m "refactor: extract BatterySummaryTab row calc into computeBatteryAvailability"
```

---

### Task 3: Extract shared `BatteryFilters.tsx`

Moves `AsServicesPopover` (and its filter type) and `TIMEFRAME_OPTIONS` out of `BatterySummaryTab.tsx` into a shared file so the new Reliability tab can reuse them. This step only **creates** the new file — `BatterySummaryTab.tsx` is updated in Task 4.

**Files:**
- Create: `src/components/BatteryFilters.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useRef } from 'react'
import { usePopoverDismiss } from '@/components/GspFilterPopover'

export const TIMEFRAME_OPTIONS = [
  { label: 'Next 30 min',  spCount: 1 },
  { label: 'Next 1 hour',  spCount: 2 },
  { label: 'Next 1.5 hours', spCount: 3 },
  { label: 'Next 2 hours', spCount: 4 },
]

export interface AsServicesFilter { sr: boolean; qr: boolean }

export function AsServicesPopover({ filter, onChange, onClose, wrapperRef }: {
  filter: AsServicesFilter
  onChange: (f: AsServicesFilter) => void
  onClose: () => void
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, wrapperRef, onClose)

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
      background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
      borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.35)', width: 220, overflow: 'hidden',
    }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)' }}>
          Treat as contracted
        </span>
      </div>
      {(['sr', 'qr'] as const).map(key => (
        <label key={key} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', fontSize: 12.5, color: 'var(--text)', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={filter[key]}
            onChange={e => onChange({ ...filter, [key]: e.target.checked })}
          />
          {key.toUpperCase()} units
        </label>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (new file not yet imported anywhere; `BatterySummaryTab.tsx` still has its own duplicate copy until Task 4).

- [ ] **Step 3: Commit**

```bash
git add src/components/BatteryFilters.tsx
git commit -m "feat: extract AsServicesPopover and TIMEFRAME_OPTIONS into shared BatteryFilters"
```

---

### Task 4: Point `BatterySummaryTab` at the shared `BatteryFilters`

Removes the now-duplicated `AsServicesPopover` and `TIMEFRAME_OPTIONS` from `BatterySummaryTab.tsx` and imports them from `BatteryFilters.tsx` instead. No behavioural change.

**Files:**
- Modify: `src/components/BatterySummaryTab.tsx`

- [ ] **Step 1: Update imports**

Replace:
```ts
import { GspFilterPopover, usePopoverDismiss } from '@/components/GspFilterPopover'
import { computeBatteryAvailability } from '@/utils/batteryAvailability'
```
with:
```ts
import { GspFilterPopover } from '@/components/GspFilterPopover'
import { computeBatteryAvailability } from '@/utils/batteryAvailability'
import { TIMEFRAME_OPTIONS, AsServicesPopover, type AsServicesFilter } from '@/components/BatteryFilters'
```

- [ ] **Step 2: Remove the local `TIMEFRAME_OPTIONS` constant**

Replace:
```ts
const TIMEFRAME_OPTIONS = [
  { label: 'Next 30 min',  spCount: 1 },
  { label: 'Next 1 hour',  spCount: 2 },
  { label: 'Next 1.5 hours', spCount: 3 },
  { label: 'Next 2 hours', spCount: 4 },
]

type CardId = 'total' | 'contracted' | 'constrained' | 'usable'
```
with:
```ts
type CardId = 'total' | 'contracted' | 'constrained' | 'usable'
```

- [ ] **Step 3: Remove the local `AsServicesPopover` function**

By this point (after Task 2), the `BatteryRow` interface has already been removed, so this function sits directly above `export default function BatterySummaryTab`.

Replace:
```ts
function AsServicesPopover({ filter, onChange, onClose, wrapperRef }: {
  filter: { sr: boolean; qr: boolean }
  onChange: (f: { sr: boolean; qr: boolean }) => void
  onClose: () => void
  wrapperRef: React.RefObject<HTMLDivElement | null>
}) {
  const ref = useRef<HTMLDivElement>(null)
  usePopoverDismiss(ref, wrapperRef, onClose)

  return (
    <div ref={ref} style={{
      position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
      background: 'var(--bg-panel)', border: '1px solid var(--border-strong)',
      borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.35)', width: 220, overflow: 'hidden',
    }}>
      <div style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text-faint)' }}>
          Treat as contracted
        </span>
      </div>
      {(['sr', 'qr'] as const).map(key => (
        <label key={key} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '7px 12px', fontSize: 12.5, color: 'var(--text)', cursor: 'pointer',
        }}>
          <input
            type="checkbox"
            checked={filter[key]}
            onChange={e => onChange({ ...filter, [key]: e.target.checked })}
          />
          {key.toUpperCase()} units
        </label>
      ))}
    </div>
  )
}

export default function BatterySummaryTab({ units, settlementPeriods, unitServices }: Props) {
```
with:
```ts
export default function BatterySummaryTab({ units, settlementPeriods, unitServices }: Props) {
```

- [ ] **Step 4: Update the `asFilter` state type to `AsServicesFilter`**

Replace:
```ts
  const [asFilter, setAsFilter] = useState<{ sr: boolean; qr: boolean }>({ sr: false, qr: false })
```
with:
```ts
  const [asFilter, setAsFilter] = useState<AsServicesFilter>({ sr: false, qr: false })
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual visual check**

Run: `npm run dev`, open the Battery section → Summary tab.
Expected: GSP filter button, AS Services filter button (with its popover/checkboxes), and the timeframe selector all behave exactly as before.

- [ ] **Step 7: Commit**

```bash
git add src/components/BatterySummaryTab.tsx
git commit -m "refactor: import AsServicesPopover and TIMEFRAME_OPTIONS from shared BatteryFilters"
```

---

### Task 5: Lift GSP/AS Services/timeframe filter state to `page.tsx`

Makes `BatterySummaryTab` a controlled component for `gspFilter`, `asFilter`, and `tfIndex`, and adds the lifted state (under new names to avoid colliding with Balancing's existing `gspFilter`/`scenario` state) to `page.tsx`. Both files are edited together so the build stays green throughout.

**Files:**
- Modify: `src/components/BatterySummaryTab.tsx`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update `BatterySummaryTab`'s `Props` interface**

Replace:
```ts
interface Props {
  units: BMUnit[]
  settlementPeriods: SettlementPeriodData[]
  unitServices: Record<string, ServiceType>
}
```
with:
```ts
interface Props {
  units: BMUnit[]
  settlementPeriods: SettlementPeriodData[]
  unitServices: Record<string, ServiceType>
  gspFilter: Record<string, 'include' | 'exclude'>
  onGspFilterChange: (f: Record<string, 'include' | 'exclude'>) => void
  asFilter: AsServicesFilter
  onAsFilterChange: (f: AsServicesFilter) => void
  tfIndex: number
  onTfIndexChange: (i: number) => void
}
```

- [ ] **Step 2: Update the component signature and remove the lifted `useState`s**

Replace:
```ts
export default function BatterySummaryTab({ units, settlementPeriods, unitServices }: Props) {
  const [gspFilter, setGspFilter] = useState<Record<string, 'include' | 'exclude'>>({})
  const [asFilter, setAsFilter] = useState<AsServicesFilter>({ sr: false, qr: false })
  const [tfIndex, setTfIndex] = useState(0)
  const [selectedCard, setSelectedCard] = useState<CardId | null>(null)
```
with:
```ts
export default function BatterySummaryTab({
  units, settlementPeriods, unitServices,
  gspFilter, onGspFilterChange, asFilter, onAsFilterChange, tfIndex, onTfIndexChange,
}: Props) {
  const [selectedCard, setSelectedCard] = useState<CardId | null>(null)
```

- [ ] **Step 3: Update the three call sites that previously used the local setters**

Replace:
```ts
              {gspOpen && <GspFilterPopover gspFilter={gspFilter} onChange={setGspFilter} onClose={() => setGspOpen(false)} wrapperRef={gspWrapperRef} />}
```
with:
```ts
              {gspOpen && <GspFilterPopover gspFilter={gspFilter} onChange={onGspFilterChange} onClose={() => setGspOpen(false)} wrapperRef={gspWrapperRef} />}
```

Replace:
```ts
              {asOpen && <AsServicesPopover filter={asFilter} onChange={setAsFilter} onClose={() => setAsOpen(false)} wrapperRef={asWrapperRef} />}
```
with:
```ts
              {asOpen && <AsServicesPopover filter={asFilter} onChange={onAsFilterChange} onClose={() => setAsOpen(false)} wrapperRef={asWrapperRef} />}
```

Replace:
```ts
              key={opt.label}
              onClick={() => setTfIndex(i)}
```
with:
```ts
              key={opt.label}
              onClick={() => onTfIndexChange(i)}
```

- [ ] **Step 4: Add the lifted state to `page.tsx`**

In `src/app/page.tsx`, find the existing Balancing-section filter state:

```ts
  const [scenario, setScenario] = useState('none')
  const [gspFilter, setGspFilter] = useState<Record<string, 'include' | 'exclude'>>({})
```

Add the new battery-section state immediately after it (distinct names — `gspFilter` above is already taken by Balancing):

```ts
  const [scenario, setScenario] = useState('none')
  const [gspFilter, setGspFilter] = useState<Record<string, 'include' | 'exclude'>>({})
  const [batteryGspFilter, setBatteryGspFilter] = useState<Record<string, 'include' | 'exclude'>>({})
  const [batteryAsFilter, setBatteryAsFilter] = useState<AsServicesFilter>({ sr: false, qr: false })
  const [batteryTfIndex, setBatteryTfIndex] = useState(0)
```

- [ ] **Step 5: Import `AsServicesFilter` in `page.tsx`**

Find the existing Battery component imports:

```ts
import BatterySummaryTab from '@/components/BatterySummaryTab'
import BatteryRedeclareTab from '@/components/BatteryRedeclareTab'
```

Add a type-only import below them:

```ts
import BatterySummaryTab from '@/components/BatterySummaryTab'
import BatteryRedeclareTab from '@/components/BatteryRedeclareTab'
import type { AsServicesFilter } from '@/components/BatteryFilters'
```

- [ ] **Step 6: Pass the new props to `BatterySummaryTab` in `page.tsx`**

Replace:
```tsx
          <div style={{ display: activeBatteryTab === 'summary' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <BatterySummaryTab
              units={batteryUnits}
              settlementPeriods={settlementPeriods}
              unitServices={unitServices}
            />
          </div>
```
with:
```tsx
          <div style={{ display: activeBatteryTab === 'summary' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <BatterySummaryTab
              units={batteryUnits}
              settlementPeriods={settlementPeriods}
              unitServices={unitServices}
              gspFilter={batteryGspFilter}
              onGspFilterChange={setBatteryGspFilter}
              asFilter={batteryAsFilter}
              onAsFilterChange={setBatteryAsFilter}
              tfIndex={batteryTfIndex}
              onTfIndexChange={setBatteryTfIndex}
            />
          </div>
```

- [ ] **Step 7: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Manual visual check**

Run: `npm run dev`, open the Battery section → Summary tab. Set a GSP include/exclude, tick an AS Services checkbox, and change the timeframe. Switch to Redeclare and back to Summary.
Expected: all filter state behaves exactly as before and survives the tab switch (unchanged from pre-refactor behaviour — it's just owned by `page.tsx` now).

- [ ] **Step 9: Commit**

```bash
git add src/components/BatterySummaryTab.tsx src/app/page.tsx
git commit -m "refactor: lift Battery GSP/AS Services/timeframe filter state to page.tsx"
```

---

### Task 6: `computeBatteryReliability` util

**Files:**
- Create: `src/utils/batteryReliability.ts`

- [ ] **Step 1: Create the file**

```ts
import type { ServiceType } from '@/models/types'
import type { BatteryAvailabilityRow } from '@/utils/batteryAvailability'

export interface ReliabilityRow extends BatteryAvailabilityRow {
  service: ServiceType | undefined
  constrained: boolean
  contracted: boolean
  included: boolean
}

export interface ReliabilityTotals {
  total: number
  constrained: number
  contracted: number
  usable: number
  reliable: number
  margin: number
}

export function computeBatteryReliability(
  rows: BatteryAvailabilityRow[],
  gspFilter: Record<string, 'include' | 'exclude'>,
  asFilter: { sr: boolean; qr: boolean },
  unitServices: Record<string, ServiceType>,
  deRatePct: number,
  requirementMW: number
): { rows: ReliabilityRow[]; totals: ReliabilityTotals } {
  const gspIncluded = Object.entries(gspFilter).filter(([, v]) => v === 'include').map(([k]) => k)
  const gspExcluded = Object.entries(gspFilter).filter(([, v]) => v === 'exclude').map(([k]) => k)

  function isConstrained(gspGroup: string): boolean {
    if (gspIncluded.length > 0 && !gspIncluded.includes(gspGroup)) return true
    if (gspExcluded.includes(gspGroup)) return true
    return false
  }

  const reliabilityRows: ReliabilityRow[] = rows.map(r => {
    const constrained = isConstrained(r.gspGroup)
    const service = unitServices[r.bmUnitId]
    const contracted = !constrained && (
      (service === 'SR' && asFilter.sr) || (service === 'QR' && asFilter.qr)
    )
    const included = !constrained && !contracted
    return { ...r, service, constrained, contracted, included }
  })

  const total = reliabilityRows.reduce((s, r) => s + r.avail, 0)
  const constrained = reliabilityRows.filter(r => r.constrained).reduce((s, r) => s + r.avail, 0)
  const contracted = reliabilityRows.filter(r => r.contracted).reduce((s, r) => s + r.avail, 0)
  const usable = reliabilityRows.filter(r => r.included).reduce((s, r) => s + r.avail, 0)
  const reliable = usable * (1 - deRatePct / 100)
  const margin = reliable - requirementMW

  return {
    rows: reliabilityRows,
    totals: { total, constrained, contracted, usable, reliable, margin },
  }
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/utils/batteryReliability.ts
git commit -m "feat: add computeBatteryReliability classification and totals util"
```

---

### Task 7: Create `BatteryReliabilityTab` component

The full new tab: shared filter row (GSP/AS Services/timeframe via props), Requirement/De-rate inputs row, a headline summary, the per-SP stacked bar chart, and the supporting unit table.

**Files:**
- Create: `src/components/BatteryReliabilityTab.tsx`

- [ ] **Step 1: Create the file**

```tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid,
  ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { BMUnit, ServiceType, SettlementPeriodData } from '@/models/types'
import { GspFilterPopover } from '@/components/GspFilterPopover'
import { TIMEFRAME_OPTIONS, AsServicesPopover, type AsServicesFilter } from '@/components/BatteryFilters'
import { computeBatteryAvailability } from '@/utils/batteryAvailability'
import { computeBatteryReliability, type ReliabilityTotals } from '@/utils/batteryReliability'

interface Props {
  units: BMUnit[]
  settlementPeriods: SettlementPeriodData[]
  unitServices: Record<string, ServiceType>
  gspFilter: Record<string, 'include' | 'exclude'>
  onGspFilterChange: (f: Record<string, 'include' | 'exclude'>) => void
  asFilter: AsServicesFilter
  onAsFilterChange: (f: AsServicesFilter) => void
  tfIndex: number
  onTfIndexChange: (i: number) => void
}

// ── Theme (mirrors AreaChart/MarginChart) ───────────────────────────────────

function useDarkMode() {
  const [isDark, setIsDark] = useState(false)
  useEffect(() => {
    const check = () => setIsDark(document.documentElement.getAttribute('data-theme') === 'dark')
    check()
    const observer = new MutationObserver(check)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])
  return isDark
}

interface ChartTheme {
  grid: string; axisText: string
  tooltipBg: string; tooltipBorder: string; tooltipText: string; tooltipMuted: string
}

const LIGHT: ChartTheme = {
  grid: '#f0f0f0', axisText: '#6b7280',
  tooltipBg: '#ffffff', tooltipBorder: '#e5e7eb', tooltipText: '#111827', tooltipMuted: '#6b7280',
}
const DARK: ChartTheme = {
  grid: '#1f2530', axisText: '#64748b',
  tooltipBg: '#0f1218', tooltipBorder: '#2d3441', tooltipText: '#f1f5f9', tooltipMuted: '#94a3b8',
}

function ServiceChip({ service }: { service: ServiceType | undefined }) {
  if (!service) return <span style={{ color: 'var(--text-faint)', fontSize: 11 }}>—</span>
  return <span className={`chip chip-${service.toLowerCase()}`}>{service}</span>
}

function TypeChip() {
  return <span className="chip chip-battery">Battery</span>
}

function formatMw(value: number): string {
  return `${Math.round(value).toLocaleString()} MW`
}

type SortKey = 'nationalGridBmUnit' | 'mel' | 'avail'

function SortTh({ col, sort, onSort, children, numeric }: {
  col: SortKey; sort: { key: SortKey; dir: 'asc' | 'desc' }
  onSort: (k: SortKey) => void; children: React.ReactNode; numeric?: boolean
}) {
  const active = sort.key === col
  return (
    <th
      className={[numeric ? 'num' : '', 'sortable', active ? 'col-active' : ''].filter(Boolean).join(' ')}
      onClick={() => onSort(col)}
    >
      <span className="th-inner">
        {children}
        <span className="sort-caret">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </span>
    </th>
  )
}

interface ChartBar extends ReliabilityTotals {
  sp: number
  startTime: string
  deratedOff: number
}

export default function BatteryReliabilityTab({
  units, settlementPeriods, unitServices,
  gspFilter, onGspFilterChange, asFilter, onAsFilterChange, tfIndex, onTfIndexChange,
}: Props) {
  const [requirementMW, setRequirementMW] = useState(0)
  const [deRatePct, setDeRatePct] = useState(0)
  const [gspOpen, setGspOpen] = useState(false)
  const [asOpen, setAsOpen] = useState(false)
  const gspWrapperRef = useRef<HTMLDivElement>(null)
  const asWrapperRef = useRef<HTMLDivElement>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'nationalGridBmUnit', dir: 'asc' })

  const isDark = useDarkMode()
  const t = isDark ? DARK : LIGHT

  const { spCount } = TIMEFRAME_OPTIONS[tfIndex]

  const windowSps = useMemo(() =>
    [...settlementPeriods].sort((a, b) => a.settlementPeriod - b.settlementPeriod).slice(0, spCount),
    [settlementPeriods, spCount]
  )

  const gspIncluded = useMemo(() => Object.entries(gspFilter).filter(([, v]) => v === 'include').map(([k]) => k), [gspFilter])
  const gspExcluded = useMemo(() => Object.entries(gspFilter).filter(([, v]) => v === 'exclude').map(([k]) => k), [gspFilter])

  const tableRows = useMemo(() => {
    const avail = computeBatteryAvailability(units, windowSps, spCount)
    return computeBatteryReliability(avail, gspFilter, asFilter, unitServices, deRatePct, requirementMW).rows
  }, [units, windowSps, spCount, gspFilter, asFilter, unitServices, deRatePct, requirementMW])

  const sortedRows = useMemo(() => {
    const list = [...tableRows]
    list.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key]
      const cmp = typeof av === 'number'
        ? (av as number) - (bv as number)
        : String(av).localeCompare(String(bv))
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return list
  }, [tableRows, sort])

  const toggleSort = useCallback((key: SortKey) => {
    setSort(s => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  }, [])

  const chartData = useMemo<ChartBar[]>(() => {
    return windowSps.map(sp => {
      const avail = computeBatteryAvailability(units, [sp], 1)
      const { totals } = computeBatteryReliability(avail, gspFilter, asFilter, unitServices, deRatePct, requirementMW)
      return {
        ...totals,
        sp: sp.settlementPeriod,
        startTime: sp.startTime,
        deratedOff: totals.usable - totals.reliable,
      }
    })
  }, [windowSps, units, gspFilter, asFilter, unitServices, deRatePct, requirementMW])

  const worstBar = useMemo(() => {
    if (chartData.length === 0) return null
    return chartData.reduce((worst, bar) => bar.reliable < worst.reliable ? bar : worst, chartData[0])
  }, [chartData])

  const avgReliable = useMemo(() => {
    if (chartData.length === 0) return 0
    return chartData.reduce((s, b) => s + b.reliable, 0) / chartData.length
  }, [chartData])

  if (units.length === 0) {
    return (
      <div className="workspace-empty">
        <h2>No battery units found</h2>
        <p>No units with fuel type BATTERY were returned by the data source.</p>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'auto' }}>
      {/* Filters row */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        flexShrink: 0,
      }}>
        {/* GSP filter */}
        {(() => {
          const incCount = gspIncluded.length
          const excCount = gspExcluded.length
          const active = incCount > 0 || excCount > 0
          const excOnly = excCount > 0 && incCount === 0
          return (
            <div ref={gspWrapperRef} style={{ position: 'relative' }}>
              <button style={{
                border: `1px solid ${active ? (excOnly ? '#dc2626' : '#4f46e5') : 'var(--border-strong)'}`,
                borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                background: active ? (excOnly ? 'rgba(220,38,38,.1)' : 'rgba(79,70,229,.1)') : 'var(--bg-panel)',
                color: active ? (excOnly ? '#fca5a5' : '#a5b4fc') : 'var(--text-soft)',
                display: 'flex', alignItems: 'center', gap: 6,
              }} onClick={() => setGspOpen(o => !o)}>
                GSP ▾
                {incCount > 0 && <span style={{ background: '#4f46e5', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>+{incCount}</span>}
                {excCount > 0 && <span style={{ background: '#dc2626', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>−{excCount}</span>}
              </button>
              {gspOpen && <GspFilterPopover gspFilter={gspFilter} onChange={onGspFilterChange} onClose={() => setGspOpen(false)} wrapperRef={gspWrapperRef} />}
            </div>
          )
        })()}

        {/* AS Services filter */}
        {(() => {
          const count = (asFilter.sr ? 1 : 0) + (asFilter.qr ? 1 : 0)
          const active = count > 0
          return (
            <div ref={asWrapperRef} style={{ position: 'relative' }}>
              <button style={{
                border: `1px solid ${active ? '#4f46e5' : 'var(--border-strong)'}`,
                borderRadius: 6, padding: '5px 10px', fontSize: 12, cursor: 'pointer',
                background: active ? 'rgba(79,70,229,.1)' : 'var(--bg-panel)',
                color: active ? '#a5b4fc' : 'var(--text-soft)',
                display: 'flex', alignItems: 'center', gap: 6,
              }} onClick={() => setAsOpen(o => !o)}>
                AS Services ▾
                {count > 0 && <span style={{ background: '#4f46e5', color: '#fff', fontSize: 10, borderRadius: 999, padding: '1px 5px', fontWeight: 600 }}>{count}</span>}
              </button>
              {asOpen && <AsServicesPopover filter={asFilter} onChange={onAsFilterChange} onClose={() => setAsOpen(false)} wrapperRef={asWrapperRef} />}
            </div>
          )
        })()}

        {/* Timeframe selector */}
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {TIMEFRAME_OPTIONS.map((opt, i) => (
            <button
              key={opt.label}
              onClick={() => onTfIndexChange(i)}
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
      </div>

      {/* Inputs row */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-panel)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexShrink: 0,
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-soft)' }}>
          Requirement (MW)
          <input
            type="number"
            value={requirementMW}
            onChange={e => setRequirementMW(Number(e.target.value))}
            style={{
              width: 90, padding: '4px 8px', fontSize: 12, borderRadius: 4,
              border: '1px solid var(--border-strong)', background: 'var(--bg-panel)', color: 'var(--text)',
            }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-soft)' }}>
          De-rate (%)
          <input
            type="number"
            min={0}
            max={100}
            value={deRatePct}
            onChange={e => setDeRatePct(Math.min(100, Math.max(0, Number(e.target.value))))}
            style={{
              width: 70, padding: '4px 8px', fontSize: 12, borderRadius: 4,
              border: '1px solid var(--border-strong)', background: 'var(--bg-panel)', color: 'var(--text)',
            }}
          />
        </label>
      </div>

      {/* Headline */}
      {worstBar && (
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {(() => {
            const surplus = worstBar.margin
            const surplusColor = surplus >= 0 ? '#22c55e' : '#ef4444'
            const surplusLabel = surplus >= 0 ? 'Surplus' : 'Shortfall'
            const sign = surplus >= 0 ? '+' : ''
            return (
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text)' }}>
                Worst SP ({worstBar.startTime.slice(11, 16)}): Reliable {formatMw(worstBar.reliable)} vs Requirement {formatMw(requirementMW)} →{' '}
                <span style={{ color: surplusColor, fontWeight: 700 }}>{surplusLabel} {sign}{formatMw(surplus)}</span>
              </p>
            )
          })()}
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-soft)' }}>
            Window average reliable: {formatMw(avgReliable)}
          </p>
        </div>
      )}

      {/* Hero chart */}
      <div style={{ flexShrink: 0, height: 280, padding: '12px 20px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            barCategoryGap={chartData.length === 1 ? '70%' : '20%'}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} />
            <XAxis
              dataKey="startTime"
              tickFormatter={(v: string) => v.slice(11, 16)}
              tick={{ fontSize: 11, fill: t.axisText }}
              axisLine={{ stroke: t.grid }}
              tickLine={{ stroke: t.grid }}
            />
            <YAxis
              tick={{ fontSize: 11, fill: t.axisText }}
              axisLine={{ stroke: t.grid }}
              tickLine={{ stroke: t.grid }}
              label={{ value: 'MW', angle: -90, position: 'insideLeft', offset: 10, fontSize: 11, fill: t.axisText }}
            />
            <Tooltip
              contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorder}`, borderRadius: 8, fontSize: 11.5 }}
              labelFormatter={(v: string) => v.slice(11, 16)}
              labelStyle={{ color: t.tooltipText }}
              itemStyle={{ color: t.tooltipMuted }}
            />
            <ReferenceLine
              y={requirementMW} stroke="#f59e0b" strokeDasharray="5 4" strokeWidth={1.5}
              label={{ value: 'Requirement', position: 'insideTopRight', fontSize: 10, fill: '#f59e0b' }}
            />
            <Bar dataKey="reliable" name="Reliable" stackId="a" fill="#22c55e" maxBarSize={80}>
              {chartData.map((bar, i) => (
                <Cell
                  key={i}
                  fill="#22c55e"
                  stroke={bar.reliable < requirementMW ? '#ef4444' : undefined}
                  strokeWidth={bar.reliable < requirementMW ? 2 : 0}
                />
              ))}
            </Bar>
            <Bar dataKey="deratedOff" name="De-rated off" stackId="a" fill="#22c55e" fillOpacity={0.35} maxBarSize={80} />
            <Bar dataKey="contracted" name="Contracted" stackId="a" fill="#8b5cf6" maxBarSize={80} />
            <Bar dataKey="constrained" name="Constrained" stackId="a" fill="#ef4444" maxBarSize={80} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Supporting table */}
      <div className="table-scroll" style={{ flex: 1 }}>
        <table className="data-table" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr>
              <SortTh col="nationalGridBmUnit" sort={sort} onSort={toggleSort}>BMU</SortTh>
              <th>Type</th>
              <th>Service</th>
              <SortTh col="mel" sort={sort} onSort={toggleSort} numeric>MEL</SortTh>
              <SortTh col="avail" sort={sort} onSort={toggleSort} numeric>Avail.</SortTh>
              <th className="num">Constrained</th>
              <th className="num">Contracted</th>
              <th className="num">Included</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => (
              <tr key={row.bmUnitId}>
                <td className="mono">
                  <div className="bmu-cell-inner">
                    <span>{row.nationalGridBmUnit}</span>
                  </div>
                </td>
                <td><TypeChip /></td>
                <td><ServiceChip service={row.service} /></td>
                <td className="mono num">{row.mel > 0 ? row.mel.toFixed(0) : '—'}</td>
                <td className="mono num">{row.avail.toFixed(0)}</td>
                <td className="num">{row.constrained ? '✓' : '—'}</td>
                <td className="num">{row.contracted ? '✓' : '—'}</td>
                <td className="num">{row.included ? '✓' : '✗'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/BatteryReliabilityTab.tsx
git commit -m "feat: add BatteryReliabilityTab with per-SP stacked bar chart and unit table"
```

---

### Task 8: Wire `BatteryReliabilityTab` into `page.tsx`

Adds the third tab button, mounts the new component (stay-mounted pattern, same as Summary/Redeclare), and extends the `BatteryTab` type.

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Import the new component**

Replace:
```ts
import BatterySummaryTab from '@/components/BatterySummaryTab'
import BatteryRedeclareTab from '@/components/BatteryRedeclareTab'
import type { AsServicesFilter } from '@/components/BatteryFilters'
```
with:
```ts
import BatterySummaryTab from '@/components/BatterySummaryTab'
import BatteryRedeclareTab from '@/components/BatteryRedeclareTab'
import BatteryReliabilityTab from '@/components/BatteryReliabilityTab'
import type { AsServicesFilter } from '@/components/BatteryFilters'
```

- [ ] **Step 2: Extend the `BatteryTab` type**

Replace:
```ts
type BatteryTab = 'summary' | 'redeclare'
```
with:
```ts
type BatteryTab = 'summary' | 'redeclare' | 'reliability'
```

- [ ] **Step 3: Add the "Reliability" tab button**

Replace:
```tsx
            <button
              className={`tab-btn${activeBatteryTab === 'redeclare' ? ' active' : ''}`}
              onClick={() => setActiveBatteryTab('redeclare')}
            >
              Redeclare
            </button>
          </div>
```
with:
```tsx
            <button
              className={`tab-btn${activeBatteryTab === 'redeclare' ? ' active' : ''}`}
              onClick={() => setActiveBatteryTab('redeclare')}
            >
              Redeclare
            </button>
            <button
              className={`tab-btn${activeBatteryTab === 'reliability' ? ' active' : ''}`}
              onClick={() => setActiveBatteryTab('reliability')}
            >
              Reliability
            </button>
          </div>
```

- [ ] **Step 4: Add the mounted-but-hidden Reliability panel**

Replace:
```tsx
          <div style={{ display: activeBatteryTab === 'redeclare' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <BatteryRedeclareTab
              units={batteryUnits}
              settlementPeriods={settlementPeriods}
              unitServices={unitServices}
              onSetService={setUnitService}
            />
          </div>
        </main>
      )}
```
with:
```tsx
          <div style={{ display: activeBatteryTab === 'redeclare' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <BatteryRedeclareTab
              units={batteryUnits}
              settlementPeriods={settlementPeriods}
              unitServices={unitServices}
              onSetService={setUnitService}
            />
          </div>

          <div style={{ display: activeBatteryTab === 'reliability' ? 'flex' : 'none', flexDirection: 'column', flex: 1, minHeight: 0 }}>
            <BatteryReliabilityTab
              units={batteryUnits}
              settlementPeriods={settlementPeriods}
              unitServices={unitServices}
              gspFilter={batteryGspFilter}
              onGspFilterChange={setBatteryGspFilter}
              asFilter={batteryAsFilter}
              onAsFilterChange={setBatteryAsFilter}
              tfIndex={batteryTfIndex}
              onTfIndexChange={setBatteryTfIndex}
            />
          </div>
        </main>
      )}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Manual visual check**

Run: `npm run dev`, open the Battery section.
- Click the new **Reliability** tab — filter row (GSP/AS Services/timeframe) appears identical to Summary's.
- Enter a Requirement (e.g. `500`) and a De-rate (e.g. `10`).
- Confirm the per-SP stacked bar chart renders 1–4 bars depending on the timeframe selector, with a dashed amber "Requirement" line at the entered value.
- Confirm any bar whose green "Reliable" segment is below the requirement line gets a red outline.
- Confirm the headline above the chart shows "Worst SP (...): Reliable ... vs Requirement ... → Surplus/Shortfall ...".
- Confirm the supporting table below lists all battery units with sortable BMU/MEL/Avail. columns and Constrained/Contracted/Included indicators.
- Switch GSP/AS Services filters or the timeframe on the **Summary** tab, then switch to **Reliability** — confirm the same filter/timeframe state is reflected (shared state).
- Toggle dark mode (if available) and confirm the chart grid/axis/tooltip colours adapt.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat: wire BatteryReliabilityTab into Battery section tab bar"
```

---

## Spec coverage check

- **Reuse Elexon data / GSP filter / AS Services filter / window selector** → Task 5 (lifted shared state), Task 7 (Reliability filter row).
- **Requirement (MW) + De-rate (%) inputs** → Task 7 (inputs row).
- **Hero per-SP stacked bar chart with requirement reference line** → Task 7 (chart section).
- **Supporting table (BMU/Type/Service/MEL/Avail./constrained/contracted/included)** → Task 7 (table section).
- **`computeBatteryAvailability` seam** → Task 1, consumed by Task 2 and Task 7.
- **`computeBatteryReliability`** → Task 6, consumed by Task 7 (table rows + per-SP chart totals).
- **BatterySummaryTab behaviour-preserving refactor (capacity→avail, controlled filters, shared AsServicesPopover)** → Tasks 2, 4, 5.
- **No waterfall, no energy/SoC modelling, Redeclare untouched** → not built; `BatteryRedeclareTab.tsx` is never modified by any task above.
