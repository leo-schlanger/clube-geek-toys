import { initializeApp } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Validate config
if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  console.error('[Firebase] Missing configuration. Check environment variables.')
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Initialize Firestore with long polling (avoids WebSocket issues)
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() })
})

// Set persistence
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn('[Firebase] Could not set persistence:', error.message)
})

console.log('[Firebase] Initialized with project:', firebaseConfig.projectId)
