import { initializeApp } from 'firebase/app'
import { getAuth, browserLocalPersistence, setPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Validar configuração antes de inicializar
const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
] as const

const missingVars = requiredEnvVars.filter(key => !import.meta.env[key])

if (missingVars.length > 0) {
  const errorMsg = `Firebase: Variáveis de ambiente obrigatórias não encontradas: ${missingVars.join(', ')}`
  console.error(errorMsg)
  console.error('Configure as variáveis no arquivo .env ou .env.production')

  // Em produção, lançar erro para impedir inicialização com config inválida
  if (import.meta.env.PROD) {
    throw new Error(errorMsg)
  }
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

// Initialize Firebase
export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

// Set persistence to local (IndexedDB) to avoid third-party cookie issues
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.warn('[Firebase] Could not set persistence:', error)
})

// Log de confirmação em desenvolvimento
if (import.meta.env.DEV) {
  console.log('[Firebase] Inicializado com projeto:', firebaseConfig.projectId)
}
