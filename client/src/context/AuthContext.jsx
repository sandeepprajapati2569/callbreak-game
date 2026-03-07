import { createContext, useContext, useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth'
import { auth, googleProvider } from '../firebase'

const AuthContext = createContext(null)

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
      const result = await signInWithPopup(auth, googleProvider)
      return result.user
    } catch (error) {
      console.error('Google sign-in error:', error)
      throw error
    }
  }

  const signInAsGuest = (guestName) => {
    const guestId = 'guest_' + crypto.randomUUID().slice(0, 12)
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
