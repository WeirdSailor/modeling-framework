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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildWeeklyWindows(start: Date, end: Date): Array<{ from: string; to: string }> {
  const windows: Array<{ from: string; to: string }> = []
  const cursor = new Date(start)
  while (cursor < end) {
    const from = cursor.toISOString()
    cursor.setUTCDate(cursor.getUTCDate() + 7)
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
  from.setUTCDate(from.getUTCDate() + 1)
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
