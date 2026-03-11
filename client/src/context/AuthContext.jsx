import { createContext, useContext, useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  onIdTokenChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signOut as firebaseSignOut,
  updateProfile,
} from 'firebase/auth'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { Capacitor } from '@capacitor/core'
import { auth, googleProvider } from '../firebase'

const AuthContext = createContext(null)

function createGuestId() {
  if (globalThis?.crypto?.randomUUID) {
    return `guest_${globalThis.crypto.randomUUID().slice(0, 12)}`
  }

  if (globalThis?.crypto?.getRandomValues) {
    const bytes = new Uint8Array(12)
    globalThis.crypto.getRandomValues(bytes)
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `guest_${hex.slice(0, 12)}`
  }

  const fallback = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `guest_${fallback.slice(0, 12)}`
}

function isNativeRuntime() {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return Boolean(globalThis?.Capacitor?.isNativePlatform?.())
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [idToken, setIdToken] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const migrateLegacyGuest = async () => {
      const savedGuest = localStorage.getItem('callbreak_guest')
      if (!savedGuest) {
        setUser(null)
        setIdToken(null)
        setLoading(false)
        return
      }

      try {
        const parsedGuest = JSON.parse(savedGuest)
        const result = await signInAnonymously(auth)
        if (parsedGuest?.displayName) {
          await updateProfile(result.user, { displayName: parsedGuest.displayName.trim().slice(0, 24) || 'Guest' })
        }
        localStorage.removeItem('callbreak_guest')
      } catch {
        setUser(null)
        setIdToken(null)
        setLoading(false)
      }
    }

    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        localStorage.removeItem('callbreak_guest')
        const nextDisplayName = firebaseUser.displayName || (firebaseUser.isAnonymous ? 'Guest' : 'Player')
        setUser({
          uid: firebaseUser.uid,
          displayName: nextDisplayName,
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
          isGuest: Boolean(firebaseUser.isAnonymous),
        })
        try {
          const nextIdToken = await firebaseUser.getIdToken()
          setIdToken(nextIdToken || null)
        } catch {
          setIdToken(null)
        }
        setLoading(false)
      } else {
        await migrateLegacyGuest()
      }
    })

    return () => unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    try {
      const isNativePlatform = isNativeRuntime()

      if (isNativePlatform) {
        // Native Google sign-in avoids webview redirect/sessionStorage issues in APK.
        const nativeResult = await FirebaseAuthentication.signInWithGoogle({
          skipNativeAuth: true,
        })

        const idToken = nativeResult?.credential?.idToken
        const accessToken = nativeResult?.credential?.accessToken

        if (!idToken) {
          throw new Error('Google sign-in did not return an ID token.')
        }

        const credential = GoogleAuthProvider.credential(idToken, accessToken)
        const firebaseResult = await signInWithCredential(auth, credential)
        return firebaseResult.user
      }

      const result = await signInWithPopup(auth, googleProvider)
      return result.user
    } catch (error) {
      console.error('Google sign-in error:', error)
      throw error
    }
  }

  const signInAsGuest = async (guestName) => {
    const normalizedName = String(guestName || '').trim() || 'Guest'
    try {
      let firebaseUser = auth.currentUser

      if (!firebaseUser || !firebaseUser.isAnonymous) {
        const result = await signInAnonymously(auth)
        firebaseUser = result.user
      }

      if (firebaseUser.displayName !== normalizedName) {
        await updateProfile(firebaseUser, {
          displayName: normalizedName,
        })
      }

      const nextIdToken = await firebaseUser.getIdToken(true)
      setIdToken(nextIdToken || null)
      setUser({
        uid: firebaseUser.uid,
        displayName: normalizedName,
        email: null,
        photoURL: null,
        isGuest: true,
      })
      localStorage.removeItem('callbreak_guest')
      return firebaseUser
    } catch (error) {
      const code = String(error?.code || '').toLowerCase()
      const message = String(error?.message || '').toLowerCase()
      const anonymousAuthDisabled = code.includes('operation-not-allowed')
        || code.includes('admin-restricted-operation')
        || message.includes('admin_only_operation')
        || message.includes('operation-not-allowed')

      if (!anonymousAuthDisabled) {
        throw error
      }

      const guestUser = {
        uid: createGuestId(),
        displayName: normalizedName,
        email: null,
        photoURL: null,
        isGuest: true,
        authMode: 'local',
      }
      setIdToken(null)
      setUser(guestUser)
      localStorage.setItem('callbreak_guest', JSON.stringify(guestUser))
      return guestUser
    }
  }

  const signOut = async () => {
    if (!auth.currentUser && user?.isGuest) {
      setIdToken(null)
      setUser(null)
      localStorage.removeItem('callbreak_guest')
      return
    }

    try {
      await firebaseSignOut(auth)
      if (isNativeRuntime() && !user?.isGuest) {
        await FirebaseAuthentication.signOut()
      }
      setIdToken(null)
      setUser(null)
      localStorage.removeItem('callbreak_guest')
    } catch (error) {
      console.error('Sign-out error:', error)
      throw error
    }
  }

  return (
    <AuthContext.Provider value={{ user, idToken, loading, signInWithGoogle, signInAsGuest, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
