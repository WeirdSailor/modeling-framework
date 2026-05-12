# Standing Data Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the last-known NDZ, MZT, MNZT, and SEL values for every BM unit in Firestore so they always appear in the Available table, regardless of how long ago the unit last submitted standing data to Elexon.

**Architecture:** A new `standingDataSync` service handles all Firestore reads/writes and backfill/sync logic. `fetchBmUnits` in `elexon.ts` loads the Firestore cache in parallel with its existing 84-day live fetch, then merges: live fetch wins where present, Firestore fills gaps. A new Standing Data tab in ConfigPanel exposes a one-time backfill button and an incremental sync button.

**Tech Stack:** Firebase Web SDK v10 (Firestore), Next.js 15 client components, Zustand store (read-only for unit list in the tab component).

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `.env.local` | Create | Firebase web SDK config env vars |
| `src/lib/firebase.ts` | Create | Initialise Firebase app + export `db` (Firestore) |
| `src/services/standingDataSync.ts` | Create | All sync logic: types, Firestore CRUD, backfill, incremental sync |
| `src/services/elexon.ts` | Modify | Load Firestore cache in parallel in `fetchBmUnits`; merge into unit records |
| `src/components/StandingDataTab.tsx` | Create | Standing Data tab UI: status banner, progress, coverage row |
| `src/components/ConfigPanel.tsx` | Modify | Add 4th "standing" tab; import + render `StandingDataTab` |

---

## Task 1: Install firebase SDK, create .env.local, create src/lib/firebase.ts

**Files:**
- Create: `.env.local`
- Create: `src/lib/firebase.ts`

The app already has `firebase-admin` as a dev dependency (used for admin scripts). The browser-side Firebase web SDK is a separate package.

- [ ] **Step 1: Install the firebase web SDK**

```bash
npm install firebase
```

Expected: `firebase` appears in `dependencies` in `package.json`.

- [ ] **Step 2: Create .env.local with Firebase config**

Create `.env.local` in the project root:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDhTMY_wXd_T__U9tvAKqfkonNsRrCoUtU
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=so-scheduling.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=so-scheduling
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=so-scheduling.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=285205300257
NEXT_PUBLIC_FIREBASE_APP_ID=1:285205300257:web:f23f4e38ee2a578453cf60
```

- [ ] **Step 3: Create src/lib/firebase.ts**

```ts
import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
export const db = getFirestore(app)
```

The `getApps().length === 0` guard prevents "Firebase app already initialized" errors from Next.js hot-reloading.

- [ ] **Step 4: Verify the build passes**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add .env.local src/lib/firebase.ts package.json package-lock.json
git commit -m "feat: add firebase web SDK and Firestore client initialisation"
```

---

## Task 2: Create standingDataSync.ts — types, Firestore CRUD, and coverage utility

**Files:**
- Create: `src/services/standingDataSync.ts`

This task creates the foundation of the sync service: the types, the Firestore read/write functions, and the coverage counter used by the UI tab. The backfill and sync logic (which is heavier) comes in Task 3.

- [ ] **Step 1: Create src/services/standingDataSync.ts with types and CRUD**

```ts
import {
  collection, doc, getDocs, getDoc, setDoc, writeBatch,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachedStandingData {
  ndz?: number
  mzt?: number
  mnzt?: number
  sel?: number
  ndzAt?: string   // ISO date the value was effective from, e.g. "2024-03-15"
  mztAt?: string
  mnztAt?: string
  selAt?: string
}

export interface SyncMetadata {
  backfillComplete: boolean
  backfillFrom: string    // e.g. "2020-01-01"
  lastSyncedTo: string    // e.g. "2026-05-12"
}

// Raw shape returned by Elexon dynamic param endpoints
interface RawParamEntry {
  bmUnit: string
  level?: number      // SEL
  notice?: number     // NDZ (minutes)
  periodMin?: number  // MZT / MNZT (minutes)
  time?: string       // ISO datetime, effective-from
  settlementDate?: string
}

// ---------------------------------------------------------------------------
// Firestore reads
// ---------------------------------------------------------------------------

export async function loadStandingDataCache(): Promise<Map<string, CachedStandingData>> {
  const snapshot = await getDocs(collection(db, 'standing_data'))
  const cache = new Map<string, CachedStandingData>()
  for (const docSnap of snapshot.docs) {
    if (docSnap.id === '_placeholder') continue
    cache.set(docSnap.id, docSnap.data() as CachedStandingData)
  }
  return cache
}

export async function getSyncMetadata(): Promise<SyncMetadata> {
  const snap = await getDoc(doc(db, 'sync_metadata', 'config'))
  if (!snap.exists()) return { backfillComplete: false, backfillFrom: '', lastSyncedTo: '' }
  return snap.data() as SyncMetadata
}

// ---------------------------------------------------------------------------
// Firestore writes
// ---------------------------------------------------------------------------

export async function updateSyncMetadata(partial: Partial<SyncMetadata>): Promise<void> {
  await setDoc(doc(db, 'sync_metadata', 'config'), partial, { merge: true })
}

// Writes a subset of the cache to Firestore. Firestore caps batches at 500 ops — chunk at 400.
export async function writeStandingDataBatch(updates: Map<string, CachedStandingData>): Promise<void> {
  const entries = [...updates.entries()].filter(([id]) => id !== '_placeholder')
  const CHUNK = 400
  for (let i = 0; i < entries.length; i += CHUNK) {
    const batch = writeBatch(db)
    for (const [bmUnitId, data] of entries.slice(i, i + CHUNK)) {
      batch.set(doc(db, 'standing_data', bmUnitId), data, { merge: true })
    }
    await batch.commit()
  }
}

// ---------------------------------------------------------------------------
// Coverage utility (exported — used by StandingDataTab)
// ---------------------------------------------------------------------------

export function computeCoverage(
  cache: Map<string, CachedStandingData>,
  knownUnitIds: string[],
): { ndz: number; mzt: number; mnzt: number; sel: number } {
  let ndz = 0, mzt = 0, mnzt = 0, sel = 0
  for (const id of knownUnitIds) {
    const e = cache.get(id)
    if (!e) continue
    if (e.ndz !== undefined) ndz++
    if (e.mzt !== undefined) mzt++
    if (e.mnzt !== undefined) mnzt++
    if (e.sel !== undefined) sel++
  }
  return { ndz, mzt, mnzt, sel }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/services/standingDataSync.ts
git commit -m "feat: standing data sync service — types, Firestore CRUD, coverage utility"
```

---

## Task 3: Add backfill and incremental sync to standingDataSync.ts

**Files:**
- Modify: `src/services/standingDataSync.ts`

This task adds the heavy logic: building date windows, fetching from the Elexon proxy, applying the merge rule, and orchestrating the yearly backfill loop and incremental sync.

**Context on the Elexon proxy:** `next.config.ts` rewrites `/api/elexon/:path*` to `https://data.elexon.co.uk/bmrs/api/v1/:path*`. The dynamic param endpoints (`/api/elexon/datasets/NDZ?from=...&to=...`) accept ISO datetime strings and return `{ data: RawParamEntry[] }`. Max window: 7 days.

- [ ] **Step 1: Append helper functions to standingDataSync.ts**

Add these functions after the last export in `src/services/standingDataSync.ts`:

```ts
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildWeeklyWindows(start: Date, end: Date): Array<{ from: string; to: string }> {
  const windows: Array<{ from: string; to: string }> = []
  const cursor = new Date(start)
  while (cursor < end) {
    const from = cursor.toISOString()
    cursor.setDate(cursor.getDate() + 7)
    const to = cursor < end ? cursor.toISOString() : end.toISOString()
    windows.push({ from, to })
  }
  return windows
}

async function fetchParamWindow(
  param: 'NDZ' | 'MZT' | 'MNZT' | 'SEL',
  from: string,
  to: string,
): Promise<RawParamEntry[]> {
  try {
    const url = `/api/elexon/datasets/${param}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    return data?.data ?? []
  } catch {
    return []
  }
}

function mergeEntries(
  cacheKey: 'ndz' | 'mzt' | 'mnzt' | 'sel',
  dateKey: 'ndzAt' | 'mztAt' | 'mnztAt' | 'selAt',
  valueField: 'notice' | 'periodMin' | 'level',
  entries: RawParamEntry[],
  cache: Map<string, CachedStandingData>,
  modified: Set<string>,
): void {
  for (const entry of entries) {
    const value = entry[valueField]
    if (value === undefined) continue
    const effectiveDate = entry.time?.split('T')[0] ?? entry.settlementDate ?? ''
    if (!effectiveDate) continue
    const existing = cache.get(entry.bmUnit) ?? {}
    const storedDate = existing[dateKey]
    if (!storedDate || effectiveDate > storedDate) {
      cache.set(entry.bmUnit, { ...existing, [cacheKey]: value, [dateKey]: effectiveDate })
      modified.add(entry.bmUnit)
    }
  }
}

async function fetchAndMergeWindows(
  windows: Array<{ from: string; to: string }>,
  cache: Map<string, CachedStandingData>,
  modified: Set<string>,
  signal: AbortSignal,
): Promise<void> {
  const PARAMS = [
    { key: 'NDZ'  as const, valueField: 'notice'    as const, cacheKey: 'ndz'  as const, dateKey: 'ndzAt'  as const },
    { key: 'MZT'  as const, valueField: 'periodMin' as const, cacheKey: 'mzt'  as const, dateKey: 'mztAt'  as const },
    { key: 'MNZT' as const, valueField: 'periodMin' as const, cacheKey: 'mnzt' as const, dateKey: 'mnztAt' as const },
    { key: 'SEL'  as const, valueField: 'level'     as const, cacheKey: 'sel'  as const, dateKey: 'selAt'  as const },
  ]
  const tasks = PARAMS.flatMap(p => windows.map(w => ({ ...p, ...w })))
  const BATCH = 20
  for (let i = 0; i < tasks.length; i += BATCH) {
    if (signal.aborted) return
    const slice = tasks.slice(i, i + BATCH)
    const results = await Promise.all(slice.map(t => fetchParamWindow(t.key, t.from, t.to)))
    for (let j = 0; j < slice.length; j++) {
      const { cacheKey, dateKey, valueField } = slice[j]
      mergeEntries(cacheKey, dateKey, valueField, results[j], cache, modified)
    }
  }
}
```

- [ ] **Step 2: Append the two exported sync functions**

```ts
// ---------------------------------------------------------------------------
// Public API: backfill
// ---------------------------------------------------------------------------

export async function runBackfill(
  knownUnitIds: string[],
  onProgress: (message: string, covered: number, total: number) => void,
  signal: AbortSignal,
): Promise<void> {
  const cache = await loadStandingDataCache()
  const total = knownUnitIds.length
  const now = new Date()
  const MAX_YEARS = 6
  let earliestDate = now.toISOString().split('T')[0]

  for (let yearOffset = 0; yearOffset < MAX_YEARS; yearOffset++) {
    if (signal.aborted) return

    const yearEnd = new Date(now)
    yearEnd.setFullYear(yearEnd.getFullYear() - yearOffset)
    const yearStart = new Date(now)
    yearStart.setFullYear(yearStart.getFullYear() - yearOffset - 1)

    const { ndz: covered } = computeCoverage(cache, knownUnitIds)
    onProgress(`Searching ${yearEnd.getFullYear()}...`, covered, total)

    const windows = buildWeeklyWindows(yearStart, yearEnd)
    const modified = new Set<string>()
    await fetchAndMergeWindows(windows, cache, modified, signal)

    if (modified.size > 0) {
      const updates = new Map([...modified].map(id => [id, cache.get(id)!]))
      await writeStandingDataBatch(updates)
    }

    earliestDate = yearStart.toISOString().split('T')[0]
    await updateSyncMetadata({ lastSyncedTo: now.toISOString().split('T')[0] })

    // Stop if no new data was found — nothing further back will help
    if (modified.size === 0) break
  }

  await updateSyncMetadata({
    backfillComplete: true,
    backfillFrom: earliestDate,
    lastSyncedTo: now.toISOString().split('T')[0],
  })
}

// ---------------------------------------------------------------------------
// Public API: incremental sync
// ---------------------------------------------------------------------------

export async function runIncrementalSync(): Promise<void> {
  const metadata = await getSyncMetadata()
  if (!metadata.lastSyncedTo) return

  const from = new Date(metadata.lastSyncedTo)
  from.setDate(from.getDate() + 1)
  const to = new Date()
  if (from >= to) return

  const cache = await loadStandingDataCache()
  const windows = buildWeeklyWindows(from, to)
  const modified = new Set<string>()
  const controller = new AbortController()
  await fetchAndMergeWindows(windows, cache, modified, controller.signal)

  if (modified.size > 0) {
    const updates = new Map([...modified].map(id => [id, cache.get(id)!]))
    await writeStandingDataBatch(updates)
  }

  await updateSyncMetadata({ lastSyncedTo: to.toISOString().split('T')[0] })
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/standingDataSync.ts
git commit -m "feat: backfill and incremental sync logic in standingDataSync"
```

---

## Task 4: Integrate Firestore cache into fetchBmUnits

**Files:**
- Modify: `src/services/elexon.ts`

`fetchBmUnits` currently fetches NDZ/MZT/MNZT/SEL from the last 84 days of Elexon data. This task adds a parallel Firestore cache load and merges: live-fetched values win (they are always most recent); Firestore fills any `undefined` gaps.

- [ ] **Step 1: Add the import at the top of elexon.ts**

After the existing imports, add:

```ts
import { loadStandingDataCache } from '@/services/standingDataSync'
```

- [ ] **Step 2: Replace the parallel fetch block in fetchBmUnits**

Find this block (around line 267):

```ts
const [refRaw, selEntries, silEntries, ndzEntries, mnztEntries, mztEntries] = await Promise.all([
  safeFetch<RawBmUnitRef[] | null>('/api/elexon/reference/bmunits/all', null),
  fetchDynParam('datasets/SEL'),
  fetchDynParam('datasets/SIL'),
  fetchDynParam('datasets/NDZ'),
  fetchDynParam('datasets/MNZT'),
  fetchDynParam('datasets/MZT'),
])
```

Replace with:

```ts
const [refRaw, selEntries, silEntries, ndzEntries, mnztEntries, mztEntries, firestoreCache] = await Promise.all([
  safeFetch<RawBmUnitRef[] | null>('/api/elexon/reference/bmunits/all', null),
  fetchDynParam('datasets/SEL'),
  fetchDynParam('datasets/SIL'),
  fetchDynParam('datasets/NDZ'),
  fetchDynParam('datasets/MNZT'),
  fetchDynParam('datasets/MZT'),
  loadStandingDataCache().catch(() => new Map()),
])
```

- [ ] **Step 3: Update the unit push block to merge Firestore fallbacks**

Find the `units.push({...})` block (around line 312). Replace the `sel`, `ndz`, `mnzt`, `mzt` lines:

```ts
    const cached = firestoreCache.get(bmUnitId) ?? firestoreCache.get(raw.nationalGridBmUnit)

    units.push({
      bmUnitId,
      nationalGridBmUnit: raw.nationalGridBmUnit,
      fuelType: raw.fuelType,
      registeredCapacity: Math.round(cap),
      gspGroup: raw.gspGroupId,
      // Live fetch wins; Firestore fills gaps for units inactive in the last 84 days
      sel:  selEntry?.level   !== undefined ? selEntry.level   : cached?.sel,
      sil:  silEntry?.level   !== undefined ? silEntry.level   : undefined,
      ndz:  ndzEntry?.notice  !== undefined ? ndzEntry.notice  : cached?.ndz,
      mnzt: mnztEntry?.periodMin !== undefined ? mnztEntry.periodMin : cached?.mnzt,
      mzt:  mztEntry?.periodMin  !== undefined ? mztEntry.periodMin  : cached?.mzt,
      ...fakePriceTiers(
        selEntry?.level !== undefined || cached?.sel !== undefined
      ),
    })
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/services/elexon.ts
git commit -m "feat: merge Firestore standing data cache into fetchBmUnits"
```

---

## Task 5: Create StandingDataTab component

**Files:**
- Create: `src/components/StandingDataTab.tsx`

This is a self-contained client component. It reads units from the Zustand store (for knowing the total unit count), loads sync metadata and coverage from Firestore, and provides the backfill/sync controls.

- [ ] **Step 1: Create src/components/StandingDataTab.tsx**

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useModellingStore } from '@/store/useModellingStore'
import {
  loadStandingDataCache,
  getSyncMetadata,
  runBackfill,
  runIncrementalSync,
  computeCoverage,
  type SyncMetadata,
} from '@/services/standingDataSync'

export default function StandingDataTab() {
  const units = useModellingStore(s => s.units)
  const knownIds = units.map(u => u.bmUnitId)
  const total = knownIds.length

  const [metadata, setMetadata] = useState<SyncMetadata | null>(null)
  const [coverage, setCoverage] = useState<{ ndz: number; mzt: number; mnzt: number; sel: number } | null>(null)
  const [running, setRunning] = useState<'backfill' | 'sync' | null>(null)
  const [progress, setProgress] = useState<{ message: string; covered: number; total: number } | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function refresh() {
    const [meta, cache] = await Promise.all([getSyncMetadata(), loadStandingDataCache()])
    setMetadata(meta)
    if (knownIds.length > 0) setCoverage(computeCoverage(cache, knownIds))
  }

  useEffect(() => { refresh() }, [total])

  async function handleBackfill() {
    setRunning('backfill')
    abortRef.current = new AbortController()
    try {
      await runBackfill(
        knownIds,
        (message, covered, t) => setProgress({ message, covered, total: t }),
        abortRef.current.signal,
      )
    } finally {
      setRunning(null)
      abortRef.current = null
      setProgress(null)
      refresh()
    }
  }

  async function handleSyncRecent() {
    setRunning('sync')
    try {
      await runIncrementalSync()
    } finally {
      setRunning(null)
      refresh()
    }
  }

  function handleCancel() {
    abortRef.current?.abort()
  }

  const isComplete = metadata?.backfillComplete ?? false

  return (
    <div className="twk-body">
      {/* Status banner */}
      <div style={{ padding: '8px 0 4px' }}>
        {running === 'backfill' ? (
          <>
            <p style={{ fontSize: 12, color: 'var(--text)', margin: '0 0 8px' }}>
              {progress?.message ?? 'Starting backfill...'}{' '}
              {progress && `(${progress.covered}/${progress.total} units)`}
            </p>
            {progress && (
              <div style={{
                height: 4, borderRadius: 2,
                background: 'var(--border)', overflow: 'hidden', marginBottom: 8,
              }}>
                <div style={{
                  height: '100%',
                  width: `${Math.round((progress.covered / Math.max(progress.total, 1)) * 100)}%`,
                  background: 'var(--accent)',
                  transition: 'width 0.3s',
                }} />
              </div>
            )}
            <button onClick={handleCancel} className="btn" style={{ fontSize: 12 }}>
              Cancel
            </button>
          </>
        ) : !isComplete ? (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-soft)', margin: '0 0 8px', lineHeight: 1.5 }}>
              Standing data cache is empty. Run backfill to populate NDZ, MZT, MNZT and SEL
              for all units by searching up to 6 years of Elexon history.
            </p>
            <button
              onClick={handleBackfill}
              disabled={running !== null || total === 0}
              className="btn btn-primary"
              style={{ fontSize: 12 }}
            >
              Run Backfill
            </button>
            {total === 0 && (
              <p style={{ fontSize: 11, color: 'var(--text-faint)', margin: '6px 0 0' }}>
                Load unit data first (click Refresh in the sidebar).
              </p>
            )}
          </>
        ) : (
          <>
            <p style={{ fontSize: 12, color: 'var(--text-soft)', margin: '0 0 8px', lineHeight: 1.5 }}>
              Backfill complete (back to {metadata.backfillFrom}).
              {metadata.lastSyncedTo && ` Last synced: ${metadata.lastSyncedTo}.`}
            </p>
            <button
              onClick={handleSyncRecent}
              disabled={running !== null}
              className="btn btn-primary"
              style={{ fontSize: 12 }}
            >
              {running === 'sync' ? 'Syncing...' : 'Sync Recent'}
            </button>
          </>
        )}
      </div>

      {/* Coverage summary */}
      {coverage && total > 0 && (
        <>
          <div className="twk-sect">Coverage</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['ndz', 'mzt', 'mnzt', 'sel'] as const).map(key => (
              <div key={key} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                padding: '6px 10px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-row-alt)',
                minWidth: 60,
              }}>
                <span style={{
                  fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '.06em', color: 'var(--text-faint)', marginBottom: 2,
                }}>
                  {key.toUpperCase()}
                </span>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                  {coverage[key]}/{total}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/StandingDataTab.tsx
git commit -m "feat: StandingDataTab component with backfill controls and coverage summary"
```

---

## Task 6: Wire StandingDataTab into ConfigPanel

**Files:**
- Modify: `src/components/ConfigPanel.tsx`

ConfigPanel currently has three tabs: `tweaks`, `scenarios`, `data`. This task adds a fourth: `standing`.

- [ ] **Step 1: Add the import at the top of ConfigPanel.tsx**

After the existing imports, add:

```ts
import StandingDataTab from '@/components/StandingDataTab'
```

- [ ] **Step 2: Extend the ConfigTab type**

Find:
```ts
type ConfigTab = 'tweaks' | 'scenarios' | 'data'
```

Replace with:
```ts
type ConfigTab = 'tweaks' | 'scenarios' | 'data' | 'standing'
```

- [ ] **Step 3: Add 'standing' to the tab buttons array**

Find:
```ts
{(['tweaks', 'scenarios', 'data'] as ConfigTab[]).map(t => (
```

Replace with:
```ts
{(['tweaks', 'scenarios', 'data', 'standing'] as ConfigTab[]).map(t => (
```

- [ ] **Step 4: Add the tab content render**

Find:
```ts
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

Add immediately after it:
```ts
      {configTab === 'standing' && <StandingDataTab />}
```

- [ ] **Step 5: Type-check and build**

```bash
npx tsc --noEmit && npm run build
```

Expected: no errors or warnings.

- [ ] **Step 6: Commit**

```bash
git add src/components/ConfigPanel.tsx
git commit -m "feat: add Standing Data tab to ConfigPanel"
```

---

## Task 7: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

Open `http://localhost:3000`.

- [ ] **Step 2: Verify the tab appears**

Click the ⚙ config button. Confirm four tabs appear: `tweaks`, `scenarios`, `data`, `standing`. Click "standing" — the status banner should read "Standing data cache is empty. Run backfill to populate..."

- [ ] **Step 3: Verify units must load first**

Before the sidebar Refresh, the "Run Backfill" button should be disabled with the note "Load unit data first." After clicking Refresh in the sidebar (which loads units), the button should become enabled.

- [ ] **Step 4: Run the backfill**

Click "Run Backfill". The progress message should update as each year is searched. In the Firebase Console → Firestore → `standing_data`, documents should start appearing with `ndz`, `mzt`, `mnzt`, `sel` fields and corresponding `*At` dates.

- [ ] **Step 5: Verify coverage row**

After backfill completes, the coverage row should show e.g. `NDZ: 198/210  MZT: 201/210  MNZT: 200/210  SEL: 195/210`. Units not covered are genuinely absent from Elexon history.

- [ ] **Step 6: Verify Available table is now populated**

In the Available table, units that previously showed `—` for NDZ/MZT/MNZT/SEL should now show values. Confirm by checking a unit you know had missing data before (e.g. CNQPS-2 was mentioned in CLAUDE.md as needing the 84-day extension fix).

- [ ] **Step 7: Verify incremental sync**

Click "Sync Recent" — it should complete quickly (only fetching from last sync date to today) and update `lastSyncedTo` in `sync_metadata/config` in Firestore.
