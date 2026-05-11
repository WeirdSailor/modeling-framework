# Historical Data Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Historical data mode that fetches a full 48-SP window anchored to any past date and start time, alongside the existing real-time fetch path.

**Architecture:** A new `fetchHistoricalData(startDate, startSp)` function is added to `elexon.ts` — `fetchAllData()` is not touched. Three state vars in `page.tsx` control mode/date/SP and a new `loadHistoricalData` callback dispatches the fetch with draft-clear confirmation. A new "Data" tab in `ConfigPanel` provides the UI: mode toggle, date picker, start-time select, and a Load button.

**Tech Stack:** Next.js 16, React, TypeScript, Zustand, Elexon Insights API

---

## File Map

| File | Change |
|------|--------|
| `src/services/elexon.ts` | Add `fetchHistoricalData` export at end of file |
| `src/app/page.tsx` | Add imports, 3 state vars, `loadHistoricalData` callback, new ConfigPanel props |
| `src/components/ConfigPanel.tsx` | Add `DataTab` component, extend `ConfigTab` type + Props, wire tab |

---

## Task 1: Add `fetchHistoricalData` to the fetch layer

**Files:**
- Modify: `src/services/elexon.ts` (append after the closing brace of `fetchAllData`)

- [ ] **Step 1: Append `fetchHistoricalData` to `src/services/elexon.ts`**

Add this entire block at the very end of the file (after `fetchAllData`'s closing brace):

```ts
// ---------------------------------------------------------------------------
// Public API: fetchHistoricalData — fixed 48-SP window anchored to a past date
// ---------------------------------------------------------------------------

export async function fetchHistoricalData(
  startDate: string,  // YYYY-MM-DD
  startSp: number,    // 1–48; first SP slot of the 24-hour window
): Promise<{
  units: BMUnit[]
  settlementPeriods: SettlementPeriodData[]
}> {
  const nextDate = dateToSettlementDate(
    new Date(new Date(`${startDate}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000)
  )

  // 48 slots: startSp..48 on startDate, then 1..(startSp-1) on nextDate
  const slotPlan: Array<{ slot: number; date: string; sp: number }> = []
  for (let sp = startSp; sp <= 48; sp++) {
    slotPlan.push({ slot: slotPlan.length + 1, date: startDate, sp })
  }
  for (let sp = 1; sp < startSp; sp++) {
    slotPlan.push({ slot: slotPlan.length + 1, date: nextDate, sp })
  }

  const [
    [units, startDemand, nextDemand, startMels, nextMels, startMils, nextMils],
    pnResults,
  ] = await Promise.all([
    Promise.all([
      fetchBmUnits(),
      fetchDemandForecast(startDate),
      fetchDemandForecast(nextDate),
      fetchMELS(startDate),
      fetchMELS(nextDate),
      fetchMILS(startDate),
      fetchMILS(nextDate),
    ]),
    Promise.all(slotPlan.map(({ date, sp }) => fetchSinglePN(date, sp))),
  ])

  const isPnGloballyEmpty = pnResults.every(m => m.size === 0)
  const mockPn = isPnGloballyEmpty ? buildMockPN(units) : null
  if (mockPn) console.warn('[elexon] Historical PN entirely empty — using mock PN data')

  const isMelsEmpty = startMels.size === 0 && nextMels.size === 0
  const mockMels = isMelsEmpty ? buildMockMELS(units) : null

  const isMilsEmpty = startMils.size === 0 && nextMils.size === 0
  const mockMils = isMilsEmpty ? buildMockMILS(units) : null

  const settlementPeriods: SettlementPeriodData[] = []

  for (let i = 0; i < slotPlan.length; i++) {
    const { slot, date, sp: actualSp } = slotPlan[i]

    const demandMap = date === startDate ? startDemand : nextDemand
    const demand = demandMap.get(actualSp) ?? 33000

    const rawPn = mockPn
      ? (mockPn.get(actualSp) ?? new Map<string, number>())
      : pnResults[i]
    const pn: Record<string, number> = {}
    for (const [bmUnit, value] of rawPn) pn[bmUnit] = value

    const melsMap = date === startDate ? startMels : nextMels
    const rawMel = mockMels ? mockMels.get(actualSp) : melsMap.get(actualSp)
    const mel: Record<string, number> = {}
    if (rawMel) {
      for (const [bmUnit, value] of rawMel) mel[bmUnit] = value
    } else {
      for (const unit of units) mel[unit.bmUnitId] = unit.registeredCapacity
    }

    const milsMap = date === startDate ? startMils : nextMils
    const rawMil = mockMils ? mockMils.get(actualSp) : milsMap.get(actualSp)
    const mil: Record<string, number> = {}
    if (rawMil) {
      for (const [bmUnit, value] of rawMil) mil[bmUnit] = value
    }

    const partial: SettlementPeriodData = {
      settlementDate: date,
      settlementPeriod: slot,
      startTime: spToStartTime(actualSp, date),
      pn,
      mel,
      mil,
      demand,
      emx: 0,
      eol: 0,
      emi: 0,
      margin: 0,
      hasConfirmedPn: true,
      proxyEmx: 0,
      proxyEol: 0,
    }

    settlementPeriods.push({ ...partial, ...computeAggregates(partial, [], units) })
  }

  return { units, settlementPeriods }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors related to `fetchHistoricalData`. Fix any type errors before continuing.

- [ ] **Step 3: Commit**

```bash
git add src/services/elexon.ts
git commit -m "feat(historical): add fetchHistoricalData to elexon service"
```

---

## Task 2: Wire state and callback in `page.tsx`

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Update the elexon import on line 6**

Change:
```ts
import { fetchAllData } from '@/services/elexon'
```
To:
```ts
import { fetchAllData, fetchHistoricalData } from '@/services/elexon'
```

- [ ] **Step 2: Add settlements import (after the elexon import)**

```ts
import { dateToSp, dateToSettlementDate } from '@/utils/settlements'
```

- [ ] **Step 3: Add the three new state vars**

After the existing state declarations block (around line 52, after `const [scenario, setScenario] = useState('none')`), add:

```ts
const [dataMode, setDataMode] = useState<'real' | 'historical'>('real')
const [historicalDate, setHistoricalDate] = useState<string>(
  () => dateToSettlementDate(new Date(Date.now() - 24 * 60 * 60 * 1000))
)
const [historicalStartSp, setHistoricalStartSp] = useState<number>(
  () => dateToSp(new Date())
)
```

- [ ] **Step 4: Add `loadHistoricalData` callback**

After the closing of the `loadData` useCallback (around line 105), add:

```ts
const loadHistoricalData = useCallback(async (date: string, startSp: number) => {
  const doLoad = async () => {
    clearAllDrafts()
    setLoading(true)
    setError(null)
    try {
      const { units, settlementPeriods } = await fetchHistoricalData(date, startSp)
      setUnits(units)
      setSPs(settlementPeriods)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load historical data')
    } finally {
      setLoading(false)
    }
  }

  if (drafts.length > 0) {
    setConfirmState({
      message: 'Loading new data will delete all current drafts. Continue?',
      confirmLabel: 'Load data',
      danger: true,
      onConfirm: () => {
        setConfirmState(null)
        void doLoad()
      },
    })
  } else {
    await doLoad()
  }
}, [clearAllDrafts, setLoading, setError, setUnits, setSPs, drafts, setConfirmState])
```

- [ ] **Step 5: Pass new props to `<ConfigPanel>`**

Find the `<ConfigPanel>` JSX (around line 482) and add the new props:

```tsx
{showConfig && (
  <ConfigPanel
    tweaks={tweaks}
    onChangeTweak={setTweak}
    voltageArea={voltageArea}
    onVoltageAreaChange={setVoltageArea}
    onClose={() => setShowConfig(false)}
    dataMode={dataMode}
    onDataModeChange={setDataMode}
    historicalDate={historicalDate}
    onHistoricalDateChange={setHistoricalDate}
    historicalStartSp={historicalStartSp}
    onHistoricalStartSpChange={setHistoricalStartSp}
    onLoadHistorical={loadHistoricalData}
  />
)}
```

- [ ] **Step 6: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors about missing props on ConfigPanel — those will be fixed in Task 3. Any other errors should be fixed now.

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(historical): add state and loadHistoricalData callback to page"
```

---

## Task 3: Add Data tab to ConfigPanel

**Files:**
- Modify: `src/components/ConfigPanel.tsx`

- [ ] **Step 1: Add settlements import at the top of the file**

After the existing import on line 1:
```ts
import { useRef, useState } from 'react'
import { SCENARIOS, GSP_AREAS, type ScenarioId } from '@/config/scenarios'
```

Add:
```ts
import { spToTime, dateToSettlementDate } from '@/utils/settlements'
```

- [ ] **Step 2: Extend the `Props` interface**

Find the Props interface (around line 258):
```ts
interface Props {
  tweaks: TweakState
  onChangeTweak: <K extends keyof TweakState>(key: K, value: TweakState[K]) => void
  voltageArea: string
  onVoltageAreaChange: (area: string) => void
  onClose: () => void
}
```

Replace with:
```ts
interface Props {
  tweaks: TweakState
  onChangeTweak: <K extends keyof TweakState>(key: K, value: TweakState[K]) => void
  voltageArea: string
  onVoltageAreaChange: (area: string) => void
  onClose: () => void
  dataMode: 'real' | 'historical'
  onDataModeChange: (mode: 'real' | 'historical') => void
  historicalDate: string
  onHistoricalDateChange: (date: string) => void
  historicalStartSp: number
  onHistoricalStartSpChange: (sp: number) => void
  onLoadHistorical: (date: string, startSp: number) => void
}
```

- [ ] **Step 3: Extend `ConfigTab` type**

Find (around line 266):
```ts
type ConfigTab = 'tweaks' | 'scenarios'
```

Replace with:
```ts
type ConfigTab = 'tweaks' | 'scenarios' | 'data'
```

- [ ] **Step 4: Add the `DataTab` component**

Insert this component before the `// ── ConfigPanel ───` comment block (around line 256):

```tsx
// ── Data tab ──────────────────────────────────────────────────────────────────

function DataTab({
  dataMode,
  onDataModeChange,
  historicalDate,
  onHistoricalDateChange,
  historicalStartSp,
  onHistoricalStartSpChange,
  onLoadHistorical,
}: {
  dataMode: 'real' | 'historical'
  onDataModeChange: (mode: 'real' | 'historical') => void
  historicalDate: string
  onHistoricalDateChange: (date: string) => void
  historicalStartSp: number
  onHistoricalStartSpChange: (sp: number) => void
  onLoadHistorical: (date: string, startSp: number) => void
}) {
  const yesterday = dateToSettlementDate(
    new Date(Date.now() - 24 * 60 * 60 * 1000)
  )

  const startTime = spToTime(historicalStartSp)
  const endDate = dateToSettlementDate(
    new Date(new Date(`${historicalDate}T00:00:00Z`).getTime() + 24 * 60 * 60 * 1000)
  )

  function fmtDate(iso: string) {
    const [y, m, d] = iso.split('-')
    return `${d}/${m}/${y}`
  }

  return (
    <div className="twk-body">
      <div className="twk-sect">Data source</div>
      <SegControl
        value={dataMode}
        options={[
          { value: 'real', label: 'Real-time' },
          { value: 'historical', label: 'Historical' },
        ]}
        onChange={onDataModeChange}
      />

      {dataMode === 'historical' && (
        <>
          <div className="twk-sect">Date</div>
          <input
            type="date"
            value={historicalDate}
            max={yesterday}
            onChange={e => onHistoricalDateChange(e.target.value)}
            style={{
              width: '100%',
              fontSize: 12,
              padding: '4px 6px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
              boxSizing: 'border-box',
            }}
          />

          <div className="twk-sect">Start time (UTC)</div>
          <select
            value={historicalStartSp}
            onChange={e => onHistoricalStartSpChange(Number(e.target.value))}
            style={{
              width: '100%',
              fontSize: 12,
              padding: '4px 6px',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--bg-input)',
              color: 'var(--text)',
            }}
          >
            {Array.from({ length: 48 }, (_, i) => {
              const sp = i + 1
              return (
                <option key={sp} value={sp}>
                  {spToTime(sp)}
                </option>
              )
            })}
          </select>

          <p style={{
            fontSize: 10.5,
            color: 'var(--text-soft)',
            margin: '6px 0',
            lineHeight: 1.4,
          }}>
            48 SPs: {startTime} UTC {fmtDate(historicalDate)} → {startTime} UTC {fmtDate(endDate)}
          </p>

          <button
            className="btn btn-primary btn-block"
            onClick={() => onLoadHistorical(historicalDate, historicalStartSp)}
            style={{ marginTop: 4 }}
          >
            Load historical data
          </button>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Destructure new props in `ConfigPanel` and wire tab button + content**

Find the `ConfigPanel` function signature (around line 268):
```ts
export default function ConfigPanel({
  tweaks, onChangeTweak, voltageArea, onVoltageAreaChange, onClose,
}: Props) {
```

Replace with:
```ts
export default function ConfigPanel({
  tweaks, onChangeTweak, voltageArea, onVoltageAreaChange, onClose,
  dataMode, onDataModeChange,
  historicalDate, onHistoricalDateChange,
  historicalStartSp, onHistoricalStartSpChange,
  onLoadHistorical,
}: Props) {
```

- [ ] **Step 6: Add 'data' to the tab button loop**

Find the tab button array (around line 307):
```ts
{(['tweaks', 'scenarios'] as ConfigTab[]).map(t => (
```

Replace with:
```ts
{(['tweaks', 'scenarios', 'data'] as ConfigTab[]).map(t => (
```

- [ ] **Step 7: Add DataTab content block**

Find the two existing tab content blocks (around line 337):
```tsx
{configTab === 'tweaks' && (
  <TweaksTab tweaks={tweaks} onChangeTweak={onChangeTweak} />
)}
{configTab === 'scenarios' && (
  <ScenariosTab voltageArea={voltageArea} onVoltageAreaChange={onVoltageAreaChange} />
)}
```

Replace with:
```tsx
{configTab === 'tweaks' && (
  <TweaksTab tweaks={tweaks} onChangeTweak={onChangeTweak} />
)}
{configTab === 'scenarios' && (
  <ScenariosTab voltageArea={voltageArea} onVoltageAreaChange={onVoltageAreaChange} />
)}
{configTab === 'data' && (
  <DataTab
    dataMode={dataMode}
    onDataModeChange={onDataModeChange}
    historicalDate={historicalDate}
    onHistoricalDateChange={onHistoricalDateChange}
    historicalStartSp={historicalStartSp}
    onHistoricalStartSpChange={onHistoricalStartSpChange}
    onLoadHistorical={onLoadHistorical}
  />
)}
```

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. Fix any before continuing.

- [ ] **Step 9: Smoke test in browser**

```bash
npm run dev
```

1. Open http://localhost:3000
2. Click **⚙ Config** → verify three tabs: `tweaks`, `scenarios`, `data`
3. Click **data** tab → verify mode toggle shows `Real-time | Historical`
4. Switch to **Historical** → verify date picker, start time select, info line, and Load button appear
5. Change date and time → verify info line updates live (e.g. "48 SPs: 14:00 UTC 03/05/2026 → 14:00 UTC 04/05/2026")
6. Click **Load historical data** with no drafts → verify loading spinner appears and data loads
7. Create a draft, then click **Load historical data** → verify ConfirmModal appears with "Loading new data will delete all current drafts. Continue?"
8. Confirm → verify drafts cleared and new data loads
9. Click **Refresh** in sidebar → verify it still loads real-time data (not affected by mode)

- [ ] **Step 10: Commit**

```bash
git add src/components/ConfigPanel.tsx
git commit -m "feat(historical): add Data tab to ConfigPanel with mode toggle and date picker"
```
