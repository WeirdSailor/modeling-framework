import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { AreaRequirementRow } from '@/models/types'

const COLLECTION = 'config'
const DOCUMENT   = 'area_requirements'

export async function loadAreaRequirements(): Promise<Record<string, AreaRequirementRow[]> | null> {
  if (!db) return null
  try {
    const snap = await getDoc(doc(db, COLLECTION, DOCUMENT))
    if (!snap.exists()) return null
    return snap.data() as Record<string, AreaRequirementRow[]>
  } catch (e) {
    console.error('[requirementsSync] load failed:', e)
    return null
  }
}

export async function saveAreaRequirements(reqs: Record<string, AreaRequirementRow[]>): Promise<void> {
  if (!db) return
  try {
    await setDoc(doc(db, COLLECTION, DOCUMENT), reqs)
  } catch (e) {
    console.error('[requirementsSync] save failed:', e)
  }
}
