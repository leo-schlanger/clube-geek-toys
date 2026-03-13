import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

// =============================================================================
// Configuration
// =============================================================================

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// =============================================================================
// Validation
// =============================================================================

const missingVars: string[] = []

if (!firebaseConfig.apiKey) missingVars.push('VITE_FIREBASE_API_KEY')
if (!firebaseConfig.authDomain) missingVars.push('VITE_FIREBASE_AUTH_DOMAIN')
if (!firebaseConfig.projectId) missingVars.push('VITE_FIREBASE_PROJECT_ID')

if (missingVars.length > 0) {
  const errorMsg = `[Firebase] Missing required environment variables: ${missingVars.join(', ')}`
  console.error(errorMsg)

  // In development, show a more helpful error
  if (import.meta.env.DEV) {
    console.error('[Firebase] Make sure you have a .env file with the required variables.')
    console.error('[Firebase] See .env.example for reference.')
  }
}

// =============================================================================
// Initialize Firebase
// =============================================================================

let app: FirebaseApp
let auth: Auth
let db: Firestore

try {
  app = initializeApp(firebaseConfig)
  auth = getAuth(app)
  db = getFirestore(app)

  // Log successful initialization in development
  if (import.meta.env.DEV) {
    console.log('[Firebase] Initialized successfully')
    console.log('[Firebase] Project:', firebaseConfig.projectId)
    console.log('[Firebase] Auth Domain:', firebaseConfig.authDomain)
  }
} catch (error) {
  console.error('[Firebase] Failed to initialize:', error)
  throw error
}

export { app, auth, db }
