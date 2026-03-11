import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useAuth } from './AuthContext'
import { useGame } from './GameContext'
import { useSocket } from './SocketContext'
import {
  acceptFriendRequest,
  acceptGameInvite,
  cancelFriendRequest,
  cancelGameInvite,
  claimUsername,
  declineFriendRequest,
  declineGameInvite,
  findUserByLookup,
  markSocialOffline,
  removeFriend,
  sendFriendRequest,
  sendGameInvite,
  setSocialEdge,
  syncSocialState,
} from '../services/social'

const SocialContext = createContext(null)
const SOCIAL_FEATURE_ENABLED = String(import.meta.env.VITE_ENABLE_SOCIAL || 'true').toLowerCase() === 'true'
const SOCIAL_SYNC_INTERVAL_MS = 5000

function createEmptyState() {
  return {
    profile: null,
    friends: [],
    blockedUsers: [],
    incomingFriendRequests: [],
    outgoingFriendRequests: [],
    incomingGameInvites: [],
    outgoingGameInvites: [],
  }
}

export function SocialProvider({ children }) {
  const { user, idToken } = useAuth()
  const { state } = useGame()
  const { roomCode: socketRoomCode, isConnected, socket } = useSocket()
  const [socialState, setSocialState] = useState(() => createEmptyState())
  const [loading, setLoading] = useState(false)

  const knownInviteIdsRef = useRef(new Set())
  const inviteInitialLoadDoneRef = useRef(false)
  const syncPromiseRef = useRef(null)
  const initialLoadDoneRef = useRef(false)

  const activeUid = user?.uid || null
  const socialEnabled = SOCIAL_FEATURE_ENABLED && Boolean(user && idToken)

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

  const resetState = useCallback(() => {
    setSocialState(createEmptyState())
    setLoading(false)
    knownInviteIdsRef.current = new Set()
    inviteInitialLoadDoneRef.current = false
    initialLoadDoneRef.current = false
  }, [])

  const refreshState = useCallback(async ({ quiet = false, showLoading = false } = {}) => {
    if (!socialEnabled || !activeUid || !user) {
      resetState()
      return null
    }

    if (syncPromiseRef.current) {
      return syncPromiseRef.current
    }

    if (showLoading && !initialLoadDoneRef.current) {
      setLoading(true)
    }

    const promise = syncSocialState({
      user,
      presence: presencePayload,
    })
      .then((nextState) => {
        setSocialState(nextState || createEmptyState())
        initialLoadDoneRef.current = true
        setLoading(false)
        return nextState
      })
      .catch((error) => {
        setLoading(false)
        if (!quiet) {
          console.error('Social sync failed:', error)
        }
        throw error
      })
      .finally(() => {
        if (syncPromiseRef.current === promise) {
          syncPromiseRef.current = null
        }
      })

    syncPromiseRef.current = promise
    return promise
  }, [socialEnabled, activeUid, user, presencePayload, resetState])

  useEffect(() => {
    if (!socialEnabled || !activeUid) {
      resetState()
      return undefined
    }

    refreshState({ quiet: true, showLoading: !initialLoadDoneRef.current }).catch(() => {})
    const intervalId = window.setInterval(() => {
      refreshState({ quiet: true }).catch(() => {})
    }, SOCIAL_SYNC_INTERVAL_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [socialEnabled, activeUid, refreshState, resetState])

  useEffect(() => {
    if (!socialEnabled || !activeUid) return
    refreshState({ quiet: true }).catch(() => {})
  }, [socialEnabled, activeUid, presencePayload, refreshState])

  useEffect(() => {
    if (!socialEnabled || !activeUid || !socket) return

    const handleConnect = () => {
      refreshState({ quiet: true }).catch(() => {})
    }

    socket.on('connect', handleConnect)
    socket.on('party:invite', handleConnect)
    socket.on('party:invite:updated', handleConnect)

    return () => {
      socket.off('connect', handleConnect)
      socket.off('party:invite', handleConnect)
      socket.off('party:invite:updated', handleConnect)
    }
  }, [socialEnabled, activeUid, socket, refreshState])

  useEffect(() => {
    if (!socialEnabled || !activeUid) return undefined

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshState({ quiet: true }).catch(() => {})
      } else {
        markSocialOffline().catch(() => {})
      }
    }

    const handleOnline = () => {
      refreshState({ quiet: true }).catch(() => {})
    }

    const handleOffline = () => {
      markSocialOffline().catch(() => {})
    }

    const handleBeforeUnload = () => {
      markSocialOffline().catch(() => {})
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('beforeunload', handleBeforeUnload)
      markSocialOffline().catch(() => {})
    }
  }, [socialEnabled, activeUid, refreshState])

  useEffect(() => {
    if (!socialEnabled || !activeUid) {
      knownInviteIdsRef.current = new Set()
      inviteInitialLoadDoneRef.current = false
      return
    }

    const mutedSenderIds = new Set([
      ...socialState.friends.filter((friend) => friend.isMuted).map((friend) => friend.uid),
      ...socialState.blockedUsers.filter((userEntry) => userEntry.isMuted).map((userEntry) => userEntry.uid),
    ])
    const currentIds = new Set(socialState.incomingGameInvites.map((invite) => invite.id))

    if (!inviteInitialLoadDoneRef.current) {
      inviteInitialLoadDoneRef.current = true
      const visibleInviteCount = socialState.incomingGameInvites.filter((invite) => !mutedSenderIds.has(invite.fromUid)).length
      if (visibleInviteCount > 0) {
        toast(`You have ${visibleInviteCount} pending game invite${visibleInviteCount > 1 ? 's' : ''}`)
      }
    } else {
      socialState.incomingGameInvites.forEach((invite) => {
        if (knownInviteIdsRef.current.has(invite.id)) return
        if (mutedSenderIds.has(invite.fromUid)) return
        toast(`${invite.fromDisplayName || 'Friend'} invited you to ${invite.gameType === 'donkey' ? 'Gadha Ladan' : 'Call Break'}`)
      })
    }

    knownInviteIdsRef.current = currentIds
  }, [socialEnabled, activeUid, socialState.incomingGameInvites, socialState.friends, socialState.blockedUsers])

  const runAction = useCallback(async (action, { refresh = true } = {}) => {
    const result = await action()
    if (refresh) {
      await refreshState({ quiet: true }).catch(() => {})
    }
    return result
  }, [refreshState])

  const sendFriendRequestAction = useCallback(async (targetLookup) => {
    if (!socialEnabled || !user) {
      throw new Error('Sign in to use friends.')
    }
    return runAction(() => sendFriendRequest({ fromUser: user, targetLookup }))
  }, [socialEnabled, user, runAction])

  const claimUsernameAction = useCallback(async (nextUsername) => {
    if (!socialEnabled || !user) {
      throw new Error('Sign in to claim a username.')
    }
    return runAction(() => claimUsername({ user, username: nextUsername }))
  }, [socialEnabled, user, runAction])

  const acceptFriendRequestAction = useCallback(async (requestId) => {
    if (!socialEnabled || !activeUid) {
      throw new Error('Sign in to use friends.')
    }
    return runAction(() => acceptFriendRequest({ requestId }))
  }, [socialEnabled, activeUid, runAction])

  const declineFriendRequestAction = useCallback(async (requestId) => {
    if (!socialEnabled || !activeUid) {
      throw new Error('Sign in to use friends.')
    }
    return runAction(() => declineFriendRequest({ requestId }))
  }, [socialEnabled, activeUid, runAction])

  const cancelFriendRequestAction = useCallback(async (requestId) => {
    if (!socialEnabled || !activeUid) {
      throw new Error('Sign in to use friends.')
    }
    return runAction(() => cancelFriendRequest({ requestId }))
  }, [socialEnabled, activeUid, runAction])

  const removeFriendAction = useCallback(async (friendUid) => {
    if (!socialEnabled || !activeUid) {
      throw new Error('Sign in to use friends.')
    }
    return runAction(() => removeFriend({ friendUid }))
  }, [socialEnabled, activeUid, runAction])

  const sendGameInviteAction = useCallback(async ({ toUid, roomCode, gameType, maxPlayers, message }) => {
    if (!socialEnabled || !user) {
      throw new Error('Sign in to use friends.')
    }
    return runAction(() => sendGameInvite({ fromUser: user, toUid, roomCode, gameType, maxPlayers, message }))
  }, [socialEnabled, user, runAction])

  const acceptGameInviteAction = useCallback(async (inviteId) => {
    if (!socialEnabled || !activeUid) {
      throw new Error('Sign in to use friends.')
    }
    return runAction(() => acceptGameInvite({ inviteId }))
  }, [socialEnabled, activeUid, runAction])

  const declineGameInviteAction = useCallback(async (inviteId) => {
    if (!socialEnabled || !activeUid) {
      throw new Error('Sign in to use friends.')
    }
    return runAction(() => declineGameInvite({ inviteId }))
  }, [socialEnabled, activeUid, runAction])

  const cancelGameInviteAction = useCallback(async (inviteId) => {
    if (!socialEnabled || !activeUid) {
      throw new Error('Sign in to use friends.')
    }
    return runAction(() => cancelGameInvite({ inviteId }))
  }, [socialEnabled, activeUid, runAction])

  const setUserMutedAction = useCallback(async (targetUser, muted) => {
    if (!socialEnabled || !activeUid) {
      throw new Error('Sign in to use social controls.')
    }
    const friendEntry = socialState.friends.find((friend) => friend.uid === targetUser?.uid)
    return runAction(() => setSocialEdge({
      targetUser,
      blocked: Boolean(friendEntry?.isBlocked || targetUser?.isBlocked),
      muted,
    }))
  }, [socialEnabled, activeUid, socialState.friends, runAction])

  const setUserBlockedAction = useCallback(async (targetUser, blocked) => {
    if (!socialEnabled || !activeUid) {
      throw new Error('Sign in to use social controls.')
    }
    const friendEntry = socialState.friends.find((friend) => friend.uid === targetUser?.uid)
    return runAction(() => setSocialEdge({
      targetUser,
      blocked,
      muted: blocked ? true : Boolean(friendEntry?.isMuted || targetUser?.isMuted),
    }))
  }, [socialEnabled, activeUid, socialState.friends, runAction])

  const value = useMemo(() => ({
    enabled: socialEnabled,
    loading,
    profile: socialState.profile,
    friends: socialState.friends,
    blockedUsers: socialState.blockedUsers,
    incomingFriendRequests: socialState.incomingFriendRequests,
    outgoingFriendRequests: socialState.outgoingFriendRequests,
    incomingGameInvites: socialState.incomingGameInvites,
    outgoingGameInvites: socialState.outgoingGameInvites,
    refresh: refreshState,
    findUserByLookup,
    claimUsername: claimUsernameAction,
    sendFriendRequest: sendFriendRequestAction,
    acceptFriendRequest: acceptFriendRequestAction,
    declineFriendRequest: declineFriendRequestAction,
    cancelFriendRequest: cancelFriendRequestAction,
    removeFriend: removeFriendAction,
    sendGameInvite: sendGameInviteAction,
    acceptGameInvite: acceptGameInviteAction,
    declineGameInvite: declineGameInviteAction,
    cancelGameInvite: cancelGameInviteAction,
    setUserMuted: setUserMutedAction,
    setUserBlocked: setUserBlockedAction,
  }), [
    socialEnabled,
    loading,
    socialState.profile,
    socialState.friends,
    socialState.blockedUsers,
    socialState.incomingFriendRequests,
    socialState.outgoingFriendRequests,
    socialState.incomingGameInvites,
    socialState.outgoingGameInvites,
    refreshState,
    claimUsernameAction,
    sendFriendRequestAction,
    acceptFriendRequestAction,
    declineFriendRequestAction,
    cancelFriendRequestAction,
    removeFriendAction,
    sendGameInviteAction,
    acceptGameInviteAction,
    declineGameInviteAction,
    cancelGameInviteAction,
    setUserMutedAction,
    setUserBlockedAction,
  ])

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
