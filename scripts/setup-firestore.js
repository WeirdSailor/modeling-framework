const admin = require('firebase-admin')
const serviceAccount = require('../serviceAccountKey.json')

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
})

const db = admin.firestore()

async function setup() {
  await db.collection('sync_metadata').doc('config').set({
    backfillComplete: false,
    backfillFrom: '',
    lastSyncedTo: '',
  })
  console.log('Created sync_metadata/config')

  // Create a placeholder in standing_data so the collection exists
  // Real unit documents will be written during backfill
  await db.collection('standing_data').doc('_placeholder').set({
    _placeholder: true,
  })
  console.log('Created standing_data collection (placeholder)')

  console.log('Firestore setup complete.')
  process.exit(0)
}

setup().catch((err) => {
  console.error('Setup failed:', err)
  process.exit(1)
})
