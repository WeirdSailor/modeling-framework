import { initializeApp, getApps } from 'firebase/app'
import { initializeFirestore, getFirestore, memoryLocalCache } from 'firebase/firestore'

const firebaseConfig = {
  apiKey:            process.env.NEXT_PUBLIC_FIREBASE_API_KEY!,
  authDomain:        process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
  projectId:         process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
  storageBucket:     process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
  appId:             process.env.NEXT_PUBLIC_FIREBASE_APP_ID!,
}

function createDb() {
  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]
  try {
    return initializeFirestore(app, {
      localCache: memoryLocalCache(),
      // Force HTTP long-polling instead of WebSocket — fixes "client is offline"
      // in environments where WebSocket connections to firestore.googleapis.com are blocked.
      experimentalForceLongPolling: true,
    })
  } catch {
    return getFirestore(app)
  }
}

export const db = typeof window !== 'undefined' ? createDb() : null!
