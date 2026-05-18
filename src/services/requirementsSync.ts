import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { AreaRequirementRow } from '@/models/types'

const COLLECTION = 'config'
const DOCUMENT   = 'area_requirements'

export async function loadAreaRequirements(): Promise<{
  requirements: Record<string, AreaRequirementRow[]>
  thresholds: Record<string, number>
} | null> {
  if (!db) return null
  try {
    const snap = await getDoc(doc(db, COLLECTION, DOCUMENT))
    if (!snap.exists()) return null
    const { _thresholds, ...requirements } = snap.data()
    return {
      requirements: requirements as Record<string, AreaRequirementRow[]>,
      thresholds: (_thresholds ?? {}) as Record<string, number>,
    }
  } catch (e) {
    console.error('[requirementsSync] load failed:', e)
    return null
  }
}

export async function saveAreaRequirements(
  reqs: Record<string, AreaRequirementRow[]>,
  thresholds: Record<string, number>,
): Promise<void> {
  if (!db) return
  try {
    await setDoc(doc(db, COLLECTION, DOCUMENT), { ...reqs, _thresholds: thresholds })
  } catch (e) {
    console.error('[requirementsSync] save failed:', e)
  }
}
