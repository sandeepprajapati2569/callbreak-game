import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext'
import { useSocket } from './SocketContext'
import { useSocial } from './SocialContext'

const PartyContext = createContext(null)
const PARTY_FEATURE_ENABLED = String(import.meta.env.VITE_ENABLE_PARTY || 'true').toLowerCase() !== 'false'

function now() {
  return Date.now()
}

function randomActionId(scope = 'party') {
  const seed = globalThis?.crypto?.randomUUID?.() || `${Date.now()}_${Math.random()}`
  return `${scope}_${String(seed).replace(/[^a-zA-Z0-9_-]/g, '')}`
}

function sortInvites(invites = []) {
  return [...invites].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}

function isInviteLive(invite) {
  if (!invite || invite.status !== 'pending') return false
  if (!invite.expiresAt) return true
  return Number(invite.expiresAt) > now()
}

function mergeInviteList(current, nextInvite) {
  if (!nextInvite?.id) return current
  const next = current.filter((invite) => invite.id !== nextInvite.id)
  if (isInviteLive(nextInvite)) {
    next.unshift(nextInvite)
  }
  return sortInvites(next)
}

function normalizeInvitePayload(payload) {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.invites)) return payload.invites
  return []
}

export function PartyProvider({ children }) {
  const { user } = useAuth()
  const { socket, isConnected } = useSocket()
  const { enabled: socialEnabled } = useSocial()

  const [party, setParty] = useState(null)
  const [invites, setInvites] = useState([])
  const [busyKey, setBusyKey] = useState('')

  const enabled = PARTY_FEATURE_ENABLED && socialEnabled && Boolean(user)

  const resetState = useCallback(() => {
    setParty(null)
    setInvites([])
    setBusyKey('')
  }, [])

  const emitWithAck = useCallback((eventName, payload = {}) => {
    return new Promise((resolve, reject) => {
      if (!socket) {
        reject(new Error('Socket is not connected'))
        return
      }
      socket.emit(eventName, payload, (response) => {
        if (!response) {
          resolve({})
          return
        }
        if (response.success === false || response.error) {
          reject(new Error(response.error || 'Request failed'))
          return
        }
        resolve(response)
      })
    })
  }, [socket])

  const recoverPartyState = useCallback(async () => {
    if (!enabled || !socket || !isConnected) return
    try {
      const [partyResponse, invitesResponse] = await Promise.all([
        emitWithAck('party:recover', {}),
        emitWithAck('party:invite:list', {}),
      ])
      setParty(partyResponse.party || null)
      setInvites(sortInvites(normalizeInvitePayload(invitesResponse).filter(isInviteLive)))
    } catch {
      // ignored - socket listeners still keep state synced after recovery attempts
    }
  }, [enabled, socket, isConnected, emitWithAck])

  useEffect(() => {
    if (!socket) return

    const handlePartySync = (payload) => {
      setParty(payload || null)
    }

    const handlePartyInvite = (invite) => {
      if (!invite) return
      setInvites((prev) => mergeInviteList(prev, invite))
    }

    const handlePartyInviteUpdated = (invite) => {
      if (!invite) return
      setInvites((prev) => mergeInviteList(prev, invite))
    }

    const handlePartyInviteList = (payload) => {
      const nextInvites = normalizeInvitePayload(payload).filter(isInviteLive)
      setInvites(sortInvites(nextInvites))
    }

    const handleKicked = () => {
      setParty(null)
    }

    socket.on('party:state:sync', handlePartySync)
    socket.on('party:invite', handlePartyInvite)
    socket.on('party:invite:updated', handlePartyInviteUpdated)
    socket.on('party:invite:list', handlePartyInviteList)
    socket.on('party:kicked', handleKicked)

    return () => {
      socket.off('party:state:sync', handlePartySync)
      socket.off('party:invite', handlePartyInvite)
      socket.off('party:invite:updated', handlePartyInviteUpdated)
      socket.off('party:invite:list', handlePartyInviteList)
      socket.off('party:kicked', handleKicked)
    }
  }, [socket])

  useEffect(() => {
    if (!enabled) {
      resetState()
      return
    }
    if (!socket || !isConnected) return
    recoverPartyState()
  }, [enabled, socket, isConnected, recoverPartyState, resetState, user?.uid])

  const createParty = useCallback(async ({ gameType = 'callbreak', targetSize = 4 } = {}) => {
    if (!enabled) throw new Error('Sign in to create a party.')
    setBusyKey('party:create')
    try {
      const response = await emitWithAck('party:create', {
        gameType,
        targetSize,
        actionId: randomActionId('party_create'),
      })
      setParty(response.party || null)
      return response.party || null
    } finally {
      setBusyKey('')
    }
  }, [enabled, emitWithAck])

  const leaveParty = useCallback(async () => {
    setBusyKey('party:leave')
    try {
      const response = await emitWithAck('party:leave', {
        actionId: randomActionId('party_leave'),
      })
      if (!response?.party || response.party.status === 'disbanded') {
        setParty(null)
      } else {
        setParty(response.party)
      }
      return response.party || null
    } finally {
      setBusyKey('')
    }
  }, [emitWithAck])

  const setReady = useCallback(async (ready) => {
    setBusyKey('party:ready')
    try {
      const response = await emitWithAck('party:ready:set', {
        ready: Boolean(ready),
      })
      if (response.party) setParty(response.party)
      return response
    } finally {
      setBusyKey('')
    }
  }, [emitWithAck])

  const inviteFriend = useCallback(async (friend) => {
    const toUid = friend?.uid
    if (!toUid) throw new Error('Friend not selected')
    setBusyKey(`party:invite:${toUid}`)
    try {
      const response = await emitWithAck('party:invite', {
        toUid,
        toName: friend.displayName || 'Player',
        actionId: randomActionId('party_invite'),
      })
      return response.invite || null
    } finally {
      setBusyKey('')
    }
  }, [emitWithAck])

  const acceptInvite = useCallback(async (inviteId) => {
    if (!inviteId) throw new Error('Invite not selected')
    setBusyKey(`party:accept:${inviteId}`)
    try {
      const response = await emitWithAck('party:invite:accept', {
        inviteId,
        actionId: randomActionId('party_invite_accept'),
      })
      setParty(response.party || null)
      setInvites((prev) => prev.filter((invite) => invite.id !== inviteId))
      return response.party || null
    } finally {
      setBusyKey('')
    }
  }, [emitWithAck])

  const declineInvite = useCallback(async (inviteId) => {
    if (!inviteId) throw new Error('Invite not selected')
    setBusyKey(`party:decline:${inviteId}`)
    try {
      await emitWithAck('party:invite:decline', {
        inviteId,
        actionId: randomActionId('party_invite_decline'),
      })
      setInvites((prev) => prev.filter((invite) => invite.id !== inviteId))
    } finally {
      setBusyKey('')
    }
  }, [emitWithAck])

  const launchPrivateRoom = useCallback(async () => {
    setBusyKey('party:launch:private')
    try {
      return await emitWithAck('party:launch:private-room', {
        actionId: randomActionId('party_launch_private'),
      })
    } finally {
      setBusyKey('')
    }
  }, [emitWithAck])

  const launchMatchmaking = useCallback(async () => {
    setBusyKey('party:launch:matchmaking')
    try {
      return await emitWithAck('party:launch:matchmaking', {
        actionId: randomActionId('party_launch_matchmaking'),
      })
    } finally {
      setBusyKey('')
    }
  }, [emitWithAck])

  const cancelMatchmaking = useCallback(async () => {
    setBusyKey('party:matchmaking:cancel')
    try {
      const response = await emitWithAck('party:matchmaking:cancel', {
        actionId: randomActionId('party_matchmaking_cancel'),
      })
      if (response.party) setParty(response.party)
      return response.party || null
    } finally {
      setBusyKey('')
    }
  }, [emitWithAck])

  const promoteLeader = useCallback(async (targetUid) => {
    if (!targetUid) throw new Error('Member not selected')
    setBusyKey(`party:promote:${targetUid}`)
    try {
      const response = await emitWithAck('party:leader:promote', { targetUid })
      if (response.party) setParty(response.party)
      return response.party || null
    } finally {
      setBusyKey('')
    }
  }, [emitWithAck])

  const kickMember = useCallback(async (targetUid) => {
    if (!targetUid) throw new Error('Member not selected')
    setBusyKey(`party:kick:${targetUid}`)
    try {
      const response = await emitWithAck('party:member:kick', { targetUid })
      if (response.party) setParty(response.party)
      return response.party || null
    } finally {
      setBusyKey('')
    }
  }, [emitWithAck])

  const myMember = useMemo(() => (
    party?.members?.find((member) => member.uid === user?.uid) || null
  ), [party, user?.uid])

  const value = useMemo(() => ({
    enabled,
    party,
    invites,
    busyKey,
    isLeader: Boolean(party && user?.uid && party.leaderUid === user.uid),
    myMember,
    createParty,
    recoverPartyState,
    leaveParty,
    setReady,
    inviteFriend,
    acceptInvite,
    declineInvite,
    launchPrivateRoom,
    launchMatchmaking,
    cancelMatchmaking,
    promoteLeader,
    kickMember,
  }), [
    enabled,
    party,
    invites,
    busyKey,
    user?.uid,
    myMember,
    createParty,
    recoverPartyState,
    leaveParty,
    setReady,
    inviteFriend,
    acceptInvite,
    declineInvite,
    launchPrivateRoom,
    launchMatchmaking,
    cancelMatchmaking,
    promoteLeader,
    kickMember,
  ])

  return (
    <PartyContext.Provider value={value}>
      {children}
    </PartyContext.Provider>
  )
}

export function useParty() {
  const context = useContext(PartyContext)
  if (!context) {
    throw new Error('useParty must be used within a PartyProvider')
  }
  return context
}
