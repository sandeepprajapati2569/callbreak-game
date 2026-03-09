import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, initializeFirestore, memoryLocalCache } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const firestoreSettings = {
  // Most stable mode across mobile WebView and restrictive networks/proxies.
  experimentalForceLongPolling: true,
  useFetchStreams: false,
  localCache: memoryLocalCache(),
}

let db
try {
  db = initializeFirestore(app, firestoreSettings)
} catch {
  // Firestore may already be initialized during HMR/dev reloads.
  db = getFirestore(app)
}
const googleProvider = new GoogleAuthProvider()

export { auth, db, googleProvider }
