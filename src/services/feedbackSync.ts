import { collection, addDoc, getDocs, orderBy, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { FeedbackItem } from '@/components/FeedbackModal'

const COLLECTION = 'feedback'

export async function loadFeedbackItems(): Promise<FeedbackItem[]> {
  if (!db) return []
  try {
    const q = query(collection(db, COLLECTION), orderBy('date', 'desc'))
    const snap = await getDocs(q)
    return snap.docs.map(d => ({ id: d.id, ...d.data() } as FeedbackItem))
  } catch (e) {
    console.error('[feedbackSync] load failed:', e)
    return []
  }
}

export async function saveFeedbackItem(item: Omit<FeedbackItem, 'id'>): Promise<string | null> {
  if (!db) return null
  try {
    const ref = await addDoc(collection(db, COLLECTION), item)
    return ref.id
  } catch (e) {
    console.error('[feedbackSync] save failed:', e)
    return null
  }
}
