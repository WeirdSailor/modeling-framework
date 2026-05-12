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
