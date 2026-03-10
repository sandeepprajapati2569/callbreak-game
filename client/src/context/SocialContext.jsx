import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore'
import toast from 'react-hot-toast'
import { db } from '../firebase'
import { useAuth } from './AuthContext'
import { useGame } from './GameContext'
import { useSocket } from './SocketContext'
import {
  FRIEND_REQUESTS_COLLECTION,
  FRIENDSHIPS_COLLECTION,
  GAME_INVITES_COLLECTION,
  PRESENCE_COLLECTION,
  USERS_COLLECTION,
  acceptFriendRequest,
  acceptGameInvite,
  cancelFriendRequest,
  cancelGameInvite,
  declineFriendRequest,
  declineGameInvite,
  expireInviteIfNeeded,
  isPresenceOnline,
  removeFriend,
  sendFriendRequest,
  sendGameInvite,
  setUserOffline,
  setUserPresence,
  toMillis,
  upsertUserProfile,
} from '../services/social'

const SocialContext = createContext(null)
const SOCIAL_FEATURE_ENABLED = String(import.meta.env.VITE_ENABLE_SOCIAL || 'false').toLowerCase() === 'true'

function sortByNewest(items) {
  return [...items].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt))
}

function createEmptyState() {
  return {
    friendIds: [],
    friendProfiles: {},
    friendPresence: {},
    incomingFriendRequests: [],
    outgoingFriendRequests: [],
    incomingGameInvites: [],
    outgoingGameInvites: [],
  }
}

export function SocialProvider({ children }) {
  const { user } = useAuth()
  const { state } = useGame()
  const { roomCode: socketRoomCode, isConnected } = useSocket()

  const [socialState, setSocialState] = useState(() => createEmptyState())

  const activeUid = user?.uid || null
  const socialEnabled = SOCIAL_FEATURE_ENABLED && Boolean(user && !user.isGuest)
  const listenerUnsubsRef = useRef([])
  const friendListenerUnsubsRef = useRef([])
  const knownInviteIdsRef = useRef(new Set())
  const inviteInitialLoadDoneRef = useRef(false)
  const presencePayloadRef = useRef({})

  const presencePayload = useMemo(() => {
    const native = Boolean(window?.Capacitor?.isNativePlatform?.())
    return {
      currentRoomCode: socketRoomCode || state.roomCode || null,
      currentPhase: state.phase || 'LANDING',
      gameType: state.gameType || null,
      socketConnected: Boolean(isConnected),
      platform: native ? 'android' : 'web',
    }
  }, [socketRoomCode, state.roomCode, state.phase, state.gameType, isConnected])

  useEffect(() => {
    presencePayloadRef.current = presencePayload
  }, [presencePayload])

  const resetState = useCallback(() => {
    setSocialState(createEmptyState())
    knownInviteIdsRef.current = new Set()
    inviteInitialLoadDoneRef.current = false
  }, [])

  const clearListeners = useCallback(() => {
    listenerUnsubsRef.current.forEach((unsubscribe) => {
      try {
        unsubscribe()
      } catch {
        // noop
      }
    })
    listenerUnsubsRef.current = []

    friendListenerUnsubsRef.current.forEach((unsubscribe) => {
      try {
        unsubscribe()
      } catch {
        // noop
      }
    })
    friendListenerUnsubsRef.current = []
  }, [])

  useEffect(() => {
    if (!socialEnabled || !activeUid) {
      clearListeners()
      resetState()
      return
    }

    upsertUserProfile(user).catch((error) => {
      console.error('Failed to upsert social profile:', error)
    })
  }, [socialEnabled, activeUid, user, clearListeners, resetState])

  useEffect(() => {
    if (!socialEnabled || !activeUid) return

    const syncProfile = async () => {
      try {
        await upsertUserProfile(user)
      } catch (error) {
        console.error('Failed to upsert social profile:', error)
      }
    }

    const syncPresence = async () => {
      try {
        await setUserPresence(activeUid, presencePayloadRef.current)
      } catch (error) {
        console.error('Presence sync failed:', error)
      }
    }

    const syncSocialStatus = async () => {
      await syncProfile()
      await syncPresence()
    }

    const markOffline = async () => {
      try {
        await setUserOffline(activeUid)
      } catch (error) {
        console.error('Failed to mark user offline:', error)
      }
    }

    syncSocialStatus()

    const heartbeatId = setInterval(() => {
      syncSocialStatus()
    }, 30000)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncSocialStatus()
      } else {
        markOffline()
      }
    }

    const handleOnline = () => {
      syncSocialStatus()
    }

    const handleOffline = () => {
      markOffline()
    }

    const handleBeforeUnload = () => {
      setUserOffline(activeUid).catch(() => {})
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      clearInterval(heartbeatId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      setUserOffline(activeUid).catch(() => {})
    }
  }, [socialEnabled, activeUid, user])

  useEffect(() => {
    if (!socialEnabled || !activeUid) return

    setUserPresence(activeUid, presencePayload).catch((error) => {
      console.error('Presence update failed:', error)
    })
  }, [socialEnabled, activeUid, presencePayload])

  useEffect(() => {
    if (!socialEnabled || !activeUid) return

    const friendshipsQuery = query(
      collection(db, FRIENDSHIPS_COLLECTION),
      where('users', 'array-contains', activeUid),
    )

    const unsubscribe = onSnapshot(
      friendshipsQuery,
      (snapshot) => {
        const nextIds = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data()
            if (!Array.isArray(data.users)) return null
            return data.users.find((id) => id !== activeUid) || null
          })
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b))

        setSocialState((prev) => ({
          ...prev,
          friendIds: nextIds,
        }))
      },
      (error) => {
        console.error('Friendships listener failed:', error)
      },
    )

    listenerUnsubsRef.current.push(unsubscribe)

    return () => {
      unsubscribe()
      listenerUnsubsRef.current = listenerUnsubsRef.current.filter((fn) => fn !== unsubscribe)
    }
  }, [socialEnabled, activeUid])

  useEffect(() => {
    if (!socialEnabled || !activeUid) return

    const incomingRequestsQuery = query(
      collection(db, FRIEND_REQUESTS_COLLECTION),
      where('toUid', '==', activeUid),
    )
    const outgoingRequestsQuery = query(
      collection(db, FRIEND_REQUESTS_COLLECTION),
      where('fromUid', '==', activeUid),
    )

    const unsubscribeIncoming = onSnapshot(
      incomingRequestsQuery,
      (snapshot) => {
        const requests = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((request) => request.status === 'pending')
        setSocialState((prev) => ({
          ...prev,
          incomingFriendRequests: sortByNewest(requests),
        }))
      },
      (error) => {
        console.error('Incoming friend requests listener failed:', error)
      },
    )

    const unsubscribeOutgoing = onSnapshot(
      outgoingRequestsQuery,
      (snapshot) => {
        const requests = snapshot.docs
          .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
          .filter((request) => request.status === 'pending')
        setSocialState((prev) => ({
          ...prev,
          outgoingFriendRequests: sortByNewest(requests),
        }))
      },
      (error) => {
        console.error('Outgoing friend requests listener failed:', error)
      },
    )

    listenerUnsubsRef.current.push(unsubscribeIncoming, unsubscribeOutgoing)

    return () => {
      unsubscribeIncoming()
      unsubscribeOutgoing()
      listenerUnsubsRef.current = listenerUnsubsRef.current.filter(
        (fn) => fn !== unsubscribeIncoming && fn !== unsubscribeOutgoing,
      )
    }
  }, [socialEnabled, activeUid])

  useEffect(() => {
    if (!socialEnabled || !activeUid) return

    const incomingInvitesQuery = query(
      collection(db, GAME_INVITES_COLLECTION),
      where('toUid', '==', activeUid),
    )
    const outgoingInvitesQuery = query(
      collection(db, GAME_INVITES_COLLECTION),
      where('fromUid', '==', activeUid),
    )

    const unsubscribeIncoming = onSnapshot(
      incomingInvitesQuery,
      (snapshot) => {
        const pendingInvites = []

        snapshot.docs.forEach((docSnap) => {
          const invite = { id: docSnap.id, ...docSnap.data() }
          if (invite.status !== 'pending') return

          const expiresAtMs = toMillis(invite.expiresAt)
          if (expiresAtMs && Date.now() > expiresAtMs) {
            expireInviteIfNeeded(invite.id, invite).catch(() => {})
            return
          }

          pendingInvites.push(invite)
        })

        setSocialState((prev) => ({
          ...prev,
          incomingGameInvites: sortByNewest(pendingInvites),
        }))
      },
      (error) => {
        console.error('Incoming game invites listener failed:', error)
      },
    )

    const unsubscribeOutgoing = onSnapshot(
      outgoingInvitesQuery,
      (snapshot) => {
        const pendingInvites = []

        snapshot.docs.forEach((docSnap) => {
          const invite = { id: docSnap.id, ...docSnap.data() }
          if (invite.status !== 'pending') return

          const expiresAtMs = toMillis(invite.expiresAt)
          if (expiresAtMs && Date.now() > expiresAtMs) {
            expireInviteIfNeeded(invite.id, invite).catch(() => {})
            return
          }

          pendingInvites.push(invite)
        })

        setSocialState((prev) => ({
          ...prev,
          outgoingGameInvites: sortByNewest(pendingInvites),
        }))
      },
      (error) => {
        console.error('Outgoing game invites listener failed:', error)
      },
    )

    listenerUnsubsRef.current.push(unsubscribeIncoming, unsubscribeOutgoing)

    return () => {
      unsubscribeIncoming()
      unsubscribeOutgoing()
      listenerUnsubsRef.current = listenerUnsubsRef.current.filter(
        (fn) => fn !== unsubscribeIncoming && fn !== unsubscribeOutgoing,
      )
    }
  }, [socialEnabled, activeUid])

  useEffect(() => {
    friendListenerUnsubsRef.current.forEach((unsubscribe) => {
      try {
        unsubscribe()
      } catch {
        // noop
      }
    })
    friendListenerUnsubsRef.current = []

    if (!socialEnabled || socialState.friendIds.length === 0) {
      setSocialState((prev) => ({
        ...prev,
        friendProfiles: {},
        friendPresence: {},
      }))
      return
    }

    const keepMapForCurrentFriends = (map) => {
      const next = {}
      socialState.friendIds.forEach((id) => {
        if (map[id]) next[id] = map[id]
      })
      return next
    }

    setSocialState((prev) => ({
      ...prev,
      friendProfiles: keepMapForCurrentFriends(prev.friendProfiles),
      friendPresence: keepMapForCurrentFriends(prev.friendPresence),
    }))

    const unsubs = []

    socialState.friendIds.forEach((friendUid) => {
      const profileRef = doc(db, USERS_COLLECTION, friendUid)
      const presenceRef = doc(db, PRESENCE_COLLECTION, friendUid)

      const unsubscribeProfile = onSnapshot(profileRef, (snapshot) => {
        setSocialState((prev) => {
          const nextProfiles = { ...prev.friendProfiles }
          if (snapshot.exists()) {
            nextProfiles[friendUid] = { uid: friendUid, ...snapshot.data() }
          } else {
            nextProfiles[friendUid] = { uid: friendUid, displayName: 'Player' }
          }
          return {
            ...prev,
            friendProfiles: nextProfiles,
          }
        })
      })

      const unsubscribePresence = onSnapshot(presenceRef, (snapshot) => {
        setSocialState((prev) => {
          const nextPresence = { ...prev.friendPresence }
          if (snapshot.exists()) {
            nextPresence[friendUid] = snapshot.data()
          } else {
            delete nextPresence[friendUid]
          }
          return {
            ...prev,
            friendPresence: nextPresence,
          }
        })
      })

      unsubs.push(unsubscribeProfile, unsubscribePresence)
    })

    friendListenerUnsubsRef.current = unsubs

    return () => {
      unsubs.forEach((unsubscribe) => {
        try {
          unsubscribe()
        } catch {
          // noop
        }
      })
      friendListenerUnsubsRef.current = []
    }
  }, [socialEnabled, socialState.friendIds])

  useEffect(() => {
    if (!socialEnabled || !activeUid) {
      knownInviteIdsRef.current = new Set()
      inviteInitialLoadDoneRef.current = false
      return
    }

    const currentIds = new Set(socialState.incomingGameInvites.map((invite) => invite.id))

    if (!inviteInitialLoadDoneRef.current) {
      // First snapshot after sign-in: populate known IDs without toasting.
      // Show a single summary if there are already-pending invites.
      inviteInitialLoadDoneRef.current = true
      if (socialState.incomingGameInvites.length > 0) {
        const count = socialState.incomingGameInvites.length
        toast(`You have ${count} pending game invite${count > 1 ? 's' : ''}`)
      }
    } else {
      socialState.incomingGameInvites.forEach((invite) => {
        if (knownInviteIdsRef.current.has(invite.id)) return
        toast(`${invite.fromDisplayName || 'Friend'} invited you to ${invite.gameType === 'donkey' ? 'Gadha Ladan' : 'Call Break'}`)
      })
    }

    knownInviteIdsRef.current = currentIds
  }, [socialEnabled, activeUid, socialState.incomingGameInvites])

  useEffect(() => {
    return () => {
      clearListeners()
    }
  }, [clearListeners])

  const friends = useMemo(() => {
    return socialState.friendIds
      .map((friendUid) => {
        const profile = socialState.friendProfiles[friendUid] || { uid: friendUid, displayName: 'Player' }
        const presence = socialState.friendPresence[friendUid] || null

        return {
          uid: friendUid,
          displayName: profile.displayName || 'Player',
          email: profile.email || null,
          photoURL: profile.photoURL || null,
          isOnline: isPresenceOnline(presence),
          lastSeenAt: presence?.lastSeen || null,
          currentRoomCode: presence?.currentRoomCode || null,
          currentPhase: presence?.currentPhase || null,
          gameType: presence?.gameType || null,
        }
      })
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) {
          return a.isOnline ? -1 : 1
        }
        return a.displayName.localeCompare(b.displayName)
      })
  }, [socialState.friendIds, socialState.friendProfiles, socialState.friendPresence])

  const sendFriendRequestAction = useCallback(
    async (targetLookup) => {
      if (!socialEnabled || !activeUid) {
        throw new Error('Sign in with Google to use friends.')
      }

      return sendFriendRequest({
        fromUser: user,
        targetLookup,
      })
    },
    [socialEnabled, activeUid, user],
  )

  const acceptFriendRequestAction = useCallback(
    async (requestId) => {
      if (!socialEnabled || !activeUid) {
        throw new Error('Sign in with Google to use friends.')
      }

      return acceptFriendRequest({
        requestId,
        currentUid: activeUid,
      })
    },
    [socialEnabled, activeUid],
  )

  const declineFriendRequestAction = useCallback(
    async (requestId) => {
      if (!socialEnabled || !activeUid) {
        throw new Error('Sign in with Google to use friends.')
      }

      return declineFriendRequest({
        requestId,
        currentUid: activeUid,
      })
    },
    [socialEnabled, activeUid],
  )

  const cancelFriendRequestAction = useCallback(
    async (requestId) => {
      if (!socialEnabled || !activeUid) {
        throw new Error('Sign in with Google to use friends.')
      }

      return cancelFriendRequest({
        requestId,
        currentUid: activeUid,
      })
    },
    [socialEnabled, activeUid],
  )

  const removeFriendAction = useCallback(
    async (friendUid) => {
      if (!socialEnabled || !activeUid) {
        throw new Error('Sign in with Google to use friends.')
      }

      return removeFriend({
        uid: activeUid,
        friendUid,
      })
    },
    [socialEnabled, activeUid],
  )

  const sendGameInviteAction = useCallback(
    async ({ toUid, roomCode, gameType, maxPlayers, message }) => {
      if (!socialEnabled || !activeUid) {
        throw new Error('Sign in with Google to use friends.')
      }

      return sendGameInvite({
        fromUser: user,
        toUid,
        roomCode,
        gameType,
        maxPlayers,
        message,
      })
    },
    [socialEnabled, activeUid, user],
  )

  const acceptGameInviteAction = useCallback(
    async (inviteId) => {
      if (!socialEnabled || !activeUid) {
        throw new Error('Sign in with Google to use friends.')
      }

      return acceptGameInvite({
        inviteId,
        currentUid: activeUid,
      })
    },
    [socialEnabled, activeUid],
  )

  const declineGameInviteAction = useCallback(
    async (inviteId) => {
      if (!socialEnabled || !activeUid) {
        throw new Error('Sign in with Google to use friends.')
      }

      return declineGameInvite({
        inviteId,
        currentUid: activeUid,
      })
    },
    [socialEnabled, activeUid],
  )

  const cancelGameInviteAction = useCallback(
    async (inviteId) => {
      if (!socialEnabled || !activeUid) {
        throw new Error('Sign in with Google to use friends.')
      }

      return cancelGameInvite({
        inviteId,
        currentUid: activeUid,
      })
    },
    [socialEnabled, activeUid],
  )

  const value = useMemo(
    () => ({
      enabled: socialEnabled,
      friends,
      incomingFriendRequests: socialState.incomingFriendRequests,
      outgoingFriendRequests: socialState.outgoingFriendRequests,
      incomingGameInvites: socialState.incomingGameInvites,
      outgoingGameInvites: socialState.outgoingGameInvites,
      sendFriendRequest: sendFriendRequestAction,
      acceptFriendRequest: acceptFriendRequestAction,
      declineFriendRequest: declineFriendRequestAction,
      cancelFriendRequest: cancelFriendRequestAction,
      removeFriend: removeFriendAction,
      sendGameInvite: sendGameInviteAction,
      acceptGameInvite: acceptGameInviteAction,
      declineGameInvite: declineGameInviteAction,
      cancelGameInvite: cancelGameInviteAction,
    }),
    [
      socialEnabled,
      friends,
      socialState.incomingFriendRequests,
      socialState.outgoingFriendRequests,
      socialState.incomingGameInvites,
      socialState.outgoingGameInvites,
      sendFriendRequestAction,
      acceptFriendRequestAction,
      declineFriendRequestAction,
      cancelFriendRequestAction,
      removeFriendAction,
      sendGameInviteAction,
      acceptGameInviteAction,
      declineGameInviteAction,
      cancelGameInviteAction,
    ],
  )

  return (
    <SocialContext.Provider value={value}>
      {children}
    </SocialContext.Provider>
  )
}

export function useSocial() {
  const context = useContext(SocialContext)
  if (!context) {
    throw new Error('useSocial must be used within a SocialProvider')
  }
  return context
}
