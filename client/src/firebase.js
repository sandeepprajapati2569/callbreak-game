import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
import { getFirestore, initializeFirestore, memoryLocalCache } from 'firebase/firestore'
import { Capacitor } from '@capacitor/core'

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

function isNativeRuntime() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return Boolean(globalThis?.Capacitor?.isNativePlatform?.())
  }
}

const firestoreSettings = isNativeRuntime()
  ? {
      // Android WebView is more stable with long-polling transport.
      experimentalForceLongPolling: true,
      useFetchStreams: false,
      localCache: memoryLocalCache(),
    }
  : {
      // On desktop/mobile browsers prefer default transport for better reliability.
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
