import { createContext, useContext, useEffect, useState } from 'react'
import { GoogleAuthProvider, onAuthStateChanged, signInWithCredential, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth'
import { FirebaseAuthentication } from '@capacitor-firebase/authentication'
import { auth, googleProvider } from '../firebase'

const AuthContext = createContext(null)

function createGuestId() {
  // Some Android WebView versions may not support crypto.randomUUID().
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

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        // Real Firebase user — clear any guest session
        localStorage.removeItem('callbreak_guest')
        setUser({
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName || 'Player',
          email: firebaseUser.email,
          photoURL: firebaseUser.photoURL,
        })
      } else {
        // No Firebase user — check for saved guest session
        const savedGuest = localStorage.getItem('callbreak_guest')
        if (savedGuest) {
          try {
            setUser(JSON.parse(savedGuest))
          } catch {
            setUser(null)
          }
        } else {
          setUser(null)
        }
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const signInWithGoogle = async () => {
    try {
      const isNativePlatform = Boolean(window?.Capacitor?.isNativePlatform?.())

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

  const signInAsGuest = (guestName) => {
    const guestId = createGuestId()
    const guestUser = {
      uid: guestId,
      displayName: guestName || 'Guest',
      email: null,
      photoURL: null,
      isGuest: true,
    }
    setUser(guestUser)
    localStorage.setItem('callbreak_guest', JSON.stringify(guestUser))
  }

  const signOut = async () => {
    if (user?.isGuest) {
      setUser(null)
      localStorage.removeItem('callbreak_guest')
      return
    }
    try {
      await firebaseSignOut(auth)
      if (window?.Capacitor?.isNativePlatform?.()) {
        await FirebaseAuthentication.signOut()
      }
    } catch (error) {
      console.error('Sign-out error:', error)
      throw error
    }
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInWithGoogle, signInAsGuest, signOut }}>
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
