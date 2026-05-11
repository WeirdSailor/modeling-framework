# Historical Data Mode — Design Spec

**Date:** 2026-05-11  
**Status:** Approved

---

## Problem

The Elexon Insights API only returns confirmed PN data after gate closure (~1 hour before delivery). At any given moment, only the next 1–2 SPs have live PN; everything beyond is zero. This makes the prototype unusable for a full 24-hour planning session with real data.

**Solution:** Allow users to load a full historical 24-hour window from a past date. All 48 SPs on a past date have confirmed PN data, giving operators a realistic dataset to model against.

---

## Goals

- Load a complete 48-SP window anchored to any historical date and start time
- Keep the real-time fetch path completely untouched
- Minimum-effort implementation with no core architecture changes
- Warn before clearing drafts

---

## Out of Scope

- Variable-length windows (not 48 SPs) — deferred
- Historical dynamic parameters (NDZ/MZT/MNZT/SEL relative to the historical date) — deferred; current values used
- Persisting mode/date selection across page reloads

---

## Architecture

### Fetch Layer (`src/services/elexon.ts`)

New exported function, `fetchAllData()` untouched:

```ts
export async function fetchHistoricalData(
  startDate: string,  // YYYY-MM-DD
  startSp: number,    // 1–48
): Promise<{ units: BMUnit[]; settlementPeriods: SettlementPeriodData[] }>
```

**Slot plan** — identical logic to `fetchAllData` but anchored to `startDate`/`startSp` instead of `now`:

```ts
const nextDate = dateToSettlementDate(new Date(parseDate(startDate).getTime() + 24 * 60 * 60 * 1000))
// slots startSp..48 on startDate, then 1..(startSp-1) on nextDate
```

**Fetches (parallel):**
- `fetchBmUnits()` — dynamic params as today (no change)
- `fetchDemandForecast(startDate)` + `fetchDemandForecast(nextDate)`
- `fetchMELS(startDate)` + `fetchMELS(nextDate)`
- `fetchMILS(startDate)` + `fetchMILS(nextDate)`
- 48× `fetchSinglePN(date, sp)` — one per slot

**Differences from `fetchAllData`:**
- No `yesterdayPN` fetch (D-1 proxy not needed)
- `hasConfirmedPn = true` for all slots
- `proxyEmx = 0`, `proxyEol = 0` for all slots
- Same mock fallback guard: if all 48 PN slots return empty, fall back to `buildMockPN`

### State (`src/app/page.tsx`)

Three new `useState` values:

| State | Type | Default |
|-------|------|---------|
| `dataMode` | `'real' \| 'historical'` | `'real'` |
| `historicalDate` | `string` (YYYY-MM-DD) | today's date |
| `historicalStartSp` | `number` (1–48) | current SP at page load |

New `loadHistoricalData(date, startSp)` callback alongside existing `loadData`:

1. If any drafts exist → show `ConfirmModal`: *"Loading new data will delete all current drafts. Continue?"*
2. On confirm: `clearAllDrafts()`, `setLoading(true)`, `setError(null)`
3. Call `fetchHistoricalData(date, startSp)`
4. `setUnits(units)`, `setSPs(settlementPeriods)`

**Sidebar Refresh button** continues to call `loadData` (real-time) regardless of mode. Historical re-fetch is done via the Load button in the Config panel.

### UI — ConfigPanel (`src/components/ConfigPanel.tsx`)

New tab `'data'` added to `ConfigTab = 'tweaks' | 'scenarios' | 'data'`.

New `DataTab` component (inline, same pattern as `TweaksTab`):

```
Mode        [ Real  |  Historical ]     ← SegControl

── Historical mode only ────────────────

Date        [ 2026-05-03 ]              ← <input type="date"> capped at max=yesterday
                                          (future dates return empty PN from API)

Start time  [ 14:00 ▾ ]                ← <select> 48 options (00:00…23:30)

            [ Load historical data ]    ← button → triggers loadHistoricalData

Info line:  "48 SPs from 14:00 UTC 03/05/2026 → 14:00 UTC 04/05/2026"
            (updates live as date/time change)
```

New props on `ConfigPanel`:

```ts
dataMode: 'real' | 'historical'
onDataModeChange: (mode: 'real' | 'historical') => void
historicalDate: string
onHistoricalDateChange: (date: string) => void
historicalStartSp: number
onHistoricalStartSpChange: (sp: number) => void
onLoadHistorical: (date: string, startSp: number) => void
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/services/elexon.ts` | Add `fetchHistoricalData` export |
| `src/app/page.tsx` | Add 3 state vars, `loadHistoricalData` callback, pass new props to ConfigPanel |
| `src/components/ConfigPanel.tsx` | Add `'data'` tab, `DataTab` component, new props |

**Untouched:** `fetchAllData`, store, MarginChart, AvailableTable, SelectedTable, CommittedTab, RedeclareTab, DraftSidebar, settlements.ts, margin.ts

---

## Data Flow

```
User picks date + time in Config panel → Data tab
  → clicks "Load historical data"
  → ConfirmModal (if drafts exist)
  → loadHistoricalData(date, startSp) in page.tsx
  → fetchHistoricalData(date, startSp) in elexon.ts
  → 48× fetchSinglePN + demand + MELS/MILS + fetchBmUnits (parallel)
  → setUnits + setSPs in store
  → UI re-renders with historical data
```

---

## Key Invariants Preserved

- `fetchAllData()` not modified — real-time path completely intact
- `computeAggregates` iterates `sp.pn` directly — no change
- `refreshAggregates` called via `setSPs` — no change
- `settlementPeriod` in `SettlementPeriodData` remains slot index 1–48 — no change
- `ownerId` on every draft — no change
