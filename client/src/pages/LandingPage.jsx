import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, LogIn, Sparkles, Zap, X, Loader, LogOut as LogOutIcon, UserPlus, UserCheck, UserX, Send, Crown, AtSign, BellOff, BellRing, ShieldBan } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { useGame } from '../context/GameContext'
import { useAuth } from '../context/AuthContext'
import { useSocial } from '../context/SocialContext'
import { useParty } from '../context/PartyContext'
import toast from 'react-hot-toast'
import { APP_NAME, APP_TAGLINE } from '../config/app'

const suitSymbols = [
  { symbol: '\u2660', color: '#1a1a2e', x: '10%', y: '15%', size: '4rem', rotate: -15 },
  { symbol: '\u2665', color: '#DC2626', x: '85%', y: '10%', size: '3.5rem', rotate: 12 },
  { symbol: '\u2666', color: '#DC2626', x: '8%', y: '75%', size: '3rem', rotate: 20 },
  { symbol: '\u2663', color: '#1a1a2e', x: '90%', y: '70%', size: '3.5rem', rotate: -10 },
  { symbol: '\u2660', color: '#D4AF37', x: '50%', y: '5%', size: '2.5rem', rotate: 0, opacity: 0.3 },
  { symbol: '\u2665', color: '#D4AF37', x: '20%', y: '90%', size: '2rem', rotate: 30, opacity: 0.25 },
  { symbol: '\u2666', color: '#D4AF37', x: '75%', y: '88%', size: '2.5rem', rotate: -20, opacity: 0.3 },
]

function LoadingBlock({ className = '', rounded = 'rounded-xl' }) {
  return (
    <div className={`relative overflow-hidden bg-white/8 ${rounded} ${className}`}>
      <motion.div
        className="absolute inset-y-0 -left-1/2 w-1/2"
        style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.18), rgba(255,255,255,0))' }}
        animate={{ x: ['-120%', '240%'] }}
        transition={{ duration: 1.45, repeat: Infinity, ease: 'easeInOut' }}
      />
    </div>
  )
}

export default function LandingPage() {
  const navigate = useNavigate()
  const { socket, activeGame, rejoinGame } = useSocket()
  const { state, dispatch } = useGame()
  const { user, loading: authLoading, signInWithGoogle, signInAsGuest, signOut } = useAuth()
  const [showJoin, setShowJoin] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(4)
  const [gameMode, setGameMode] = useState('callbreak') // 'callbreak' | 'donkey'
  const [signingIn, setSigningIn] = useState(false)
  const [showGuestInput, setShowGuestInput] = useState(false)
  const [guestName, setGuestName] = useState('')
  const [friendLookup, setFriendLookup] = useState('')
  const [friendSearchResult, setFriendSearchResult] = useState(null)
  const [friendSearchState, setFriendSearchState] = useState('idle')
  const [usernameInput, setUsernameInput] = useState('')
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState('friends')
  const [socialBusy, setSocialBusy] = useState(false)
  const [socialActionKey, setSocialActionKey] = useState('')
  const workspaceTabTouchedRef = useRef(false)
  const friendSearchRequestRef = useRef(0)
  const {
    enabled: socialEnabled,
    loading: socialLoading,
    profile: socialProfile,
    friends,
    blockedUsers,
    incomingFriendRequests,
    outgoingFriendRequests,
    findUserByLookup,
    claimUsername,
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,
    setUserMuted,
    setUserBlocked,
  } = useSocial()
  const {
    enabled: partyEnabled,
    loading: partyLoading,
    party,
    invites: incomingPartyInvites,
    busyKey: partyBusyKey,
    isLeader: isPartyLeader,
    createParty,
    leaveParty,
    inviteFriend: sendPartyInviteToFriend,
    acceptInvite: acceptPartyInvite,
    declineInvite: declinePartyInvite,
  } = useParty()

  // Get player name from auth
  const playerName = user?.displayName || ''

  const queueing = state.phase === 'QUEUING'
  const queueStatus = state.queueStatus
  const activeUsername = socialProfile?.claimedUsername || ''
  const usernameClaimed = Boolean(activeUsername)
  const visibleUsername = activeUsername || socialProfile?.username || ''
  const onlineFriendsCount = friends.filter((friend) => friend.isOnline).length
  const inboxCount = incomingFriendRequests.length + outgoingFriendRequests.length + incomingPartyInvites.length
  const partyInviteCount = incomingPartyInvites.length
  const workspaceLoading = Boolean(user && socialEnabled && (socialLoading || partyLoading))
  const identityLoading = Boolean(user && socialEnabled && socialLoading && !visibleUsername)
  const friendSearchUid = friendSearchResult?.uid || ''
  const friendSearchIsSelf = Boolean(friendSearchUid && friendSearchUid === user?.uid)
  const friendSearchIsFriend = Boolean(friendSearchUid && friends.some((friend) => friend.uid === friendSearchUid))
  const friendSearchHasOutgoingRequest = Boolean(friendSearchUid && outgoingFriendRequests.some((request) => request.toUid === friendSearchUid))
  const friendSearchHasIncomingRequest = Boolean(friendSearchUid && incomingFriendRequests.some((request) => request.fromUid === friendSearchUid))
  const friendSearchIsBlocked = Boolean(friendSearchUid && blockedUsers.some((blockedUser) => blockedUser.uid === friendSearchUid))
  const friendSearchActionLookup = friendSearchResult?.username || friendSearchResult?.email || friendSearchResult?.uid || ''

  useEffect(() => {
    if (!socialEnabled) return
    setUsernameInput((current) => {
      if (current && current !== activeUsername) return current
      return activeUsername || socialProfile?.username || ''
    })
  }, [socialEnabled, activeUsername, socialProfile?.username])

  useEffect(() => {
    if (!socialEnabled || workspaceTabTouchedRef.current) return

    if (incomingPartyInvites.length > 0 || incomingFriendRequests.length > 0) {
      setActiveWorkspaceTab('inbox')
      return
    }

    if (party) {
      setActiveWorkspaceTab('party')
      return
    }

    setActiveWorkspaceTab('friends')
  }, [socialEnabled, incomingPartyInvites.length, incomingFriendRequests.length, party])

  useEffect(() => {
    if (!socialEnabled) {
      setFriendSearchResult(null)
      setFriendSearchState('idle')
      return
    }

    const lookup = friendLookup.trim()
    if (lookup.length < 2) {
      setFriendSearchResult(null)
      setFriendSearchState('idle')
      return
    }

    const requestId = friendSearchRequestRef.current + 1
    friendSearchRequestRef.current = requestId
    setFriendSearchState('loading')

    const timeoutId = window.setTimeout(async () => {
      try {
        const result = await findUserByLookup(lookup)
        if (friendSearchRequestRef.current !== requestId) return
        setFriendSearchResult(result)
        setFriendSearchState(result ? 'found' : 'empty')
      } catch {
        if (friendSearchRequestRef.current !== requestId) return
        setFriendSearchResult(null)
        setFriendSearchState('error')
      }
    }, 280)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [friendLookup, socialEnabled, findUserByLookup])

  // Navigate based on phase (handles initial load, match found, and rejoin)
  useEffect(() => {
    if (state.phase === 'LOBBY') {
      navigate('/lobby')
    }
    if (state.phase === 'BIDDING' || state.phase === 'PLAYING' || state.phase === 'GAME_STARTING' || state.phase === 'ROUND_END' || state.phase === 'GAME_OVER') {
      navigate('/game')
    }
    if (state.phase === 'DONKEY_PLAYING' || state.phase === 'DONKEY_GAME_OVER' || state.phase === 'DONKEY_ROUND_RESULT') {
      navigate('/donkey-game')
    }
  }, [state.phase, navigate])

  const handleGoogleSignIn = async () => {
    setSigningIn(true)
    try {
      await signInWithGoogle()
      toast.success('Signed in successfully!')
    } catch (error) {
      if (error.code !== 'auth/popup-closed-by-user') {
        toast.error('Sign-in failed. Please try again.')
      }
    } finally {
      setSigningIn(false)
    }
  }

  const handleGuestSignIn = async () => {
    if (!guestName.trim()) return
    setSigningIn(true)
    try {
      const guestSession = await signInAsGuest(guestName.trim())
      if (guestSession?.authMode === 'local') {
        toast.success(`Welcome, ${guestName.trim()}!`)
        toast('Guest social features need Firebase Anonymous Auth enabled.')
      } else {
        toast.success(`Welcome, ${guestName.trim()}!`)
      }
    } catch {
      toast.error('Guest sign-in failed. Please try again.')
    } finally {
      setSigningIn(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      dispatch({ type: 'RESET' })
      toast('Signed out')
    } catch {
      toast.error('Sign-out failed')
    }
  }

  const createRoomForInvite = async () => {
    if (!socket) {
      throw new Error('Connecting to server...')
    }

    dispatch({ type: 'SET_PLAYER_NAME', payload: playerName })
    dispatch({ type: 'SET_GAME_TYPE', payload: gameMode })

    return new Promise((resolve, reject) => {
      socket.emit(
        'create-room',
        { playerName, maxPlayers, gameType: gameMode, photoURL: user?.photoURL || null },
        (response) => {
          if (response?.error) {
            reject(new Error(response.error))
            return
          }
          resolve(response)
        },
      )
    })
  }

  const handleCreateRoom = async () => {
    if (!user) {
      toast.error('Please sign in first')
      return
    }
    try {
      setLoading(true)
      await createRoomForInvite()
      navigate('/lobby')
    } catch (error) {
      toast.error(error?.message || 'Unable to create room')
    } finally {
      setLoading(false)
    }
  }

  const handleJoinRoom = () => {
    if (!user) {
      toast.error('Please sign in first')
      return
    }
    if (!roomCode.trim() || roomCode.trim().length < 4) {
      toast.error('Please enter a valid room code')
      return
    }
    if (!socket) {
      toast.error('Connecting to server...')
      return
    }
    setLoading(true)
    dispatch({ type: 'SET_PLAYER_NAME', payload: playerName })
    socket.emit(
      'join-room',
      { playerName, roomCode: roomCode.trim().toUpperCase(), photoURL: user?.photoURL || null },
      (response) => {
        setLoading(false)
        if (response?.error) {
          toast.error(response.error)
        } else {
          navigate('/lobby')
        }
      }
    )
  }

  const handleQuickPlay = () => {
    if (!user) {
      toast.error('Please sign in first')
      return
    }
    if (!socket) {
      toast.error('Connecting to server...')
      return
    }
    dispatch({ type: 'SET_PLAYER_NAME', payload: playerName })
    dispatch({ type: 'SET_GAME_TYPE', payload: gameMode })
    socket.emit('join-queue', { playerName, maxPlayers, gameType: gameMode, photoURL: user?.photoURL || null }, (response) => {
      if (response?.error) {
        toast.error(response.error)
      } else {
        dispatch({
          type: 'QUEUE_JOINED',
          payload: { position: response.position, total: response.total, maxPlayers: response.maxPlayers },
        })
      }
    })
  }

  const handleLeaveQueue = () => {
    if (!socket) return
    socket.emit('leave-queue', () => {
      dispatch({ type: 'QUEUE_LEFT' })
    })
  }

  const handleRejoinGame = () => {
    if (!activeGame?.roomCode) return
    rejoinGame(activeGame.roomCode)
  }

  const handleSendFriendRequest = async (overrideLookup = '') => {
    const lookup = String(overrideLookup || friendLookup).trim()
    if (!lookup) {
      toast.error('Enter friend username, email, or ID')
      return
    }

    try {
      setSocialBusy(true)
      const result = await sendFriendRequest(lookup)
      if (result?.mode === 'auto-accepted') {
        toast.success(`${result?.targetUser?.displayName || 'Friend'} added to your list`)
      } else {
        toast.success('Friend request sent')
      }
      setFriendLookup('')
      setFriendSearchResult(null)
      setFriendSearchState('idle')
    } catch (error) {
      toast.error(error?.message || 'Unable to send friend request')
    } finally {
      setSocialBusy(false)
    }
  }

  const handleClaimUsername = async () => {
    const nextUsername = usernameInput.trim()
    if (!nextUsername) {
      toast.error('Enter a username first')
      return
    }

    try {
      setSocialActionKey('claim-username')
      const result = await claimUsername(nextUsername)
      setUsernameInput(result?.claimedUsername || result?.username || nextUsername)
      toast.success(`Username claimed: @${result?.claimedUsername || result?.username || nextUsername}`)
    } catch (error) {
      toast.error(error?.message || 'Unable to claim username')
    } finally {
      setSocialActionKey('')
    }
  }

  const handleAcceptFriendRequest = async (requestId) => {
    try {
      setSocialActionKey(`friend-accept-${requestId}`)
      await acceptFriendRequest(requestId)
      toast.success('Friend request accepted')
    } catch (error) {
      toast.error(error?.message || 'Unable to accept request')
    } finally {
      setSocialActionKey('')
    }
  }

  const handleDeclineFriendRequest = async (requestId) => {
    try {
      setSocialActionKey(`friend-decline-${requestId}`)
      await declineFriendRequest(requestId)
      toast('Friend request declined')
    } catch (error) {
      toast.error(error?.message || 'Unable to decline request')
    } finally {
      setSocialActionKey('')
    }
  }

  const handleCancelFriendRequest = async (requestId) => {
    try {
      setSocialActionKey(`friend-cancel-${requestId}`)
      await cancelFriendRequest(requestId)
      toast('Friend request canceled')
    } catch (error) {
      toast.error(error?.message || 'Unable to cancel request')
    } finally {
      setSocialActionKey('')
    }
  }

  const handleCreateParty = async () => {
    if (!partyEnabled) {
      toast.error('Sign in to create a party')
      return
    }
    try {
      await createParty({
        gameType: gameMode,
        targetSize: maxPlayers,
      })
      dispatch({ type: 'SET_GAME_TYPE', payload: gameMode })
      workspaceTabTouchedRef.current = true
      setActiveWorkspaceTab('friends')
      toast.success('Party created. Invite friends to continue.')
    } catch (error) {
      toast.error(error?.message || 'Unable to create party')
    }
  }

  const handleLeaveParty = async () => {
    try {
      await leaveParty()
      toast('You left the party')
    } catch (error) {
      toast.error(error?.message || 'Unable to leave party')
    }
  }

  const handleInviteFriend = async (friend) => {
    if (!friend?.uid) return
    if (!partyEnabled) {
      toast.error('Enable social sign-in before inviting friends')
      return
    }
    if (queueing) {
      toast.error('Leave quick play queue before using party invites')
      return
    }

    const key = `invite-friend-${friend.uid}`
    setSocialActionKey(key)

    try {
      let activeParty = party
      let createdPartyThisAction = false
      if (!party) {
        activeParty = await createParty({
          gameType: gameMode,
          targetSize: maxPlayers,
        })
        createdPartyThisAction = true
      }

      if (activeParty && activeParty.leaderUid !== user?.uid) {
        throw new Error('Only party leader can send invites')
      }

      await sendPartyInviteToFriend(friend)

      toast.success(`Party invite sent to ${friend.displayName || 'friend'}`)
      if (createdPartyThisAction || !party) {
        dispatch({ type: 'SET_GAME_TYPE', payload: gameMode })
      }
      workspaceTabTouchedRef.current = true
      setActiveWorkspaceTab('party')
    } catch (error) {
      toast.error(error?.message || 'Unable to send invite')
    } finally {
      setSocialActionKey('')
    }
  }

  const handleAcceptPartyInvite = async (inviteId) => {
    setSocialActionKey(`party-invite-accept-${inviteId}`)
    try {
      const joinedParty = await acceptPartyInvite(inviteId)
      if (joinedParty?.gameType) {
        dispatch({ type: 'SET_GAME_TYPE', payload: joinedParty.gameType })
      }
      toast.success('Joined party')
      navigate('/lobby')
    } catch (error) {
      toast.error(error?.message || 'Unable to accept invite')
    } finally {
      setSocialActionKey('')
    }
  }

  const handleDeclinePartyInvite = async (inviteId) => {
    try {
      setSocialActionKey(`party-invite-decline-${inviteId}`)
      await declinePartyInvite(inviteId)
      toast('Invite declined')
    } catch (error) {
      toast.error(error?.message || 'Unable to decline invite')
    } finally {
      setSocialActionKey('')
    }
  }

  const handleOpenPartyLobby = () => {
    if (party?.gameType) {
      dispatch({ type: 'SET_GAME_TYPE', payload: party.gameType })
    }
    navigate('/lobby')
  }

  const handleSelectWorkspaceTab = (tab) => {
    workspaceTabTouchedRef.current = true
    setActiveWorkspaceTab(tab)
  }

  const handleToggleMuted = async (friend) => {
    if (!friend?.uid) return
    try {
      setSocialActionKey(`friend-mute-${friend.uid}`)
      await setUserMuted(friend, !friend.isMuted)
      toast(friend.isMuted ? 'Friend unmuted' : 'Friend muted')
    } catch (error) {
      toast.error(error?.message || 'Unable to update mute state')
    } finally {
      setSocialActionKey('')
    }
  }

  const handleToggleBlocked = async (friend) => {
    if (!friend?.uid) return
    try {
      setSocialActionKey(`friend-block-${friend.uid}`)
      await setUserBlocked(friend, !friend.isBlocked)
      toast(friend.isBlocked ? 'User unblocked' : 'User blocked')
    } catch (error) {
      toast.error(error?.message || 'Unable to update block state')
    } finally {
      setSocialActionKey('')
    }
  }

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'offline'
    const value = typeof timestamp?.toMillis === 'function' ? timestamp.toMillis() : Number(timestamp) || 0
    if (!value) return 'offline'
    const ageMs = Date.now() - value
    if (ageMs < 60_000) return 'just now'
    if (ageMs < 3_600_000) return `${Math.max(1, Math.floor(ageMs / 60_000))}m ago`
    return `${Math.max(1, Math.floor(ageMs / 3_600_000))}h ago`
  }

  const partyMembers = party?.members || []
  const connectedPartyMembers = partyMembers.filter((member) => member.connected)
  const isPartyQueueing = party?.status === 'queueing'
  const partyQueue = party?.matchmaking || null
  const allConnectedPartyReady = connectedPartyMembers.length > 0 && connectedPartyMembers.every((member) => member.ready)

  const renderPartyWorkspace = () => (
    <div className="space-y-4">
      {partyInviteCount > 0 && !party && (
        <div className="rounded-2xl border border-[rgba(212,175,55,0.35)] bg-[rgba(212,175,55,0.1)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold" style={{ color: 'var(--gold)' }}>
                You have {partyInviteCount} pending party invite{partyInviteCount > 1 ? 's' : ''}
              </p>
              <p className="text-xs opacity-65 mt-1">
                Open your inbox to join a party or clear the invite.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleSelectWorkspaceTab('inbox')}
              className="w-full sm:w-auto px-3 py-2 rounded-lg text-sm font-semibold text-black shrink-0"
              style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
            >
              Open Inbox
            </button>
          </div>
        </div>
      )}

      {!party ? (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] opacity-45">Party Lobby</p>
            <h3 className="text-lg font-semibold mt-2">Create a party first, then invite friends</h3>
            <p className="text-sm opacity-65 mt-1">
              Keep the multiplayer flow simple: create a party, invite from the Friends tab, then open the party lobby to launch together.
            </p>
          </div>

          <div className="grid gap-2 md:grid-cols-3">
            {[
              { step: '1', title: 'Create', text: 'Start a party for the current game mode and table size.' },
              { step: '2', title: 'Invite', text: 'Send party invites from your friends list.' },
              { step: '3', title: 'Launch', text: 'Open the party lobby and start when everyone is ready.' },
            ].map((item) => (
              <div
                key={item.step}
                className="rounded-xl border border-white/8 bg-white/5 px-3 py-3"
              >
                <p className="text-[10px] uppercase tracking-[0.22em] opacity-45">Step {item.step}</p>
                <p className="text-sm font-semibold mt-1">{item.title}</p>
                <p className="text-xs opacity-60 mt-1 leading-5">{item.text}</p>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleCreateParty}
            disabled={partyBusyKey === 'party:create'}
            className="w-full px-4 py-3 rounded-xl text-sm font-semibold text-black disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
          >
            <Users size={16} />
            Create Party Lobby
          </button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-[rgba(212,175,55,0.28)] bg-[rgba(212,175,55,0.08)] p-4 sm:p-5 space-y-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-[0.24em] opacity-55">Active Party</p>
                <h3 className="text-lg font-semibold mt-2 truncate">
                  Party {party.partyId?.slice(-6) || party.partyId}
                </h3>
                <p className="text-sm opacity-70 mt-1">
                  {party.gameType === 'donkey' ? 'Gadha Ladan' : 'Call Break'} • {connectedPartyMembers.length}/{party.targetSize} connected • {party.status}
                  {isPartyQueueing && partyQueue ? ` • Queue ${partyQueue.position}/${partyQueue.total}` : ''}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleOpenPartyLobby}
                  className="px-3.5 py-2 rounded-lg text-sm font-semibold text-black"
                  style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
                >
                  Open Lobby
                </button>
                <button
                  type="button"
                  onClick={handleLeaveParty}
                  disabled={partyBusyKey === 'party:leave'}
                  className="px-3.5 py-2 rounded-lg text-sm font-semibold bg-white/10 hover:bg-white/15 disabled:opacity-60"
                >
                  Leave Party
                </button>
              </div>
            </div>

            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.22em] opacity-45">Leader</p>
                <p className="text-sm font-semibold mt-1">{isPartyLeader ? 'You lead this party' : 'Follow the leader'}</p>
                <p className="text-xs opacity-60 mt-1 leading-5">
                  {isPartyLeader ? 'Invite friends and open the party lobby when ready.' : 'Wait for the leader to invite or launch the match.'}
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.22em] opacity-45">Ready Status</p>
                <p className="text-sm font-semibold mt-1">{allConnectedPartyReady ? 'Everyone ready' : 'Waiting on players'}</p>
                <p className="text-xs opacity-60 mt-1 leading-5">
                  Manage ready state and matchmaking inside the party lobby.
                </p>
              </div>
              <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                <p className="text-[10px] uppercase tracking-[0.22em] opacity-45">Next Step</p>
                <p className="text-sm font-semibold mt-1">{friends.length > 0 ? 'Invite or launch' : 'Add friends first'}</p>
                <p className="text-xs opacity-60 mt-1 leading-5">
                  Use Friends to send invites, then open the party lobby to launch together.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] opacity-45">Party Members</p>
            <div className="grid gap-2">
              {partyMembers.map((member) => (
                <div
                  key={member.uid}
                  className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold">
                      {member.name?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {member.uid === party.leaderUid && <Crown size={13} className="text-[var(--gold)] shrink-0" />}
                        <p className="text-sm font-medium truncate">{member.name || 'Player'}</p>
                      </div>
                      <p className="text-xs opacity-55 truncate">{member.uid === user?.uid ? 'You' : 'Party member'}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-wide ${member.connected ? 'bg-green-500/15 text-green-300' : 'bg-white/8 text-white/45'}`}>
                      {member.connected ? 'Online' : 'Offline'}
                    </span>
                    <span className={`px-2 py-1 rounded-full text-[10px] uppercase tracking-wide ${member.ready ? 'bg-[rgba(212,175,55,0.15)] text-[var(--gold)]' : 'bg-white/8 text-white/45'}`}>
                      {member.ready ? 'Ready' : 'Not Ready'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )

  const renderFriendsWorkspace = () => (
    <div className="space-y-4">
      <div className="grid gap-3">
        {!usernameClaimed && (
          <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.24em] opacity-45">Your Identity</p>
            <h3 className="text-lg font-semibold mt-2">Claim a username</h3>
            <p className="text-sm opacity-65 mt-1">
              Use one short username so friends can find you quickly.
            </p>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={usernameInput}
                onChange={(event) => setUsernameInput(event.target.value)}
                placeholder="Claim @username"
                className="flex-1 px-3 py-2.5 rounded-xl bg-black/30 text-white text-sm placeholder-white/35 border border-white/10 outline-none focus:border-[var(--gold)] transition-colors"
                onKeyDown={(event) => event.key === 'Enter' && handleClaimUsername()}
              />
              <button
                type="button"
                onClick={handleClaimUsername}
                disabled={socialActionKey === 'claim-username'}
                className="w-full sm:w-auto px-3 py-2.5 rounded-xl text-black disabled:opacity-50 flex items-center justify-center gap-1.5"
                style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
              >
                <AtSign size={15} />
                Claim
              </button>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
          <p className="text-xs uppercase tracking-[0.24em] opacity-45">Add Friends</p>
          <h3 className="text-lg font-semibold mt-2">Find a friend</h3>
          <p className="text-sm opacity-65 mt-1">
            Search by username first. Email and UID still work as fallback.
          </p>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              value={friendLookup}
              onChange={(event) => setFriendLookup(event.target.value)}
              placeholder="Find @username, email, or UID"
              className="flex-1 px-3 py-2.5 rounded-xl bg-black/30 text-white text-sm placeholder-white/35 border border-white/10 outline-none focus:border-[var(--gold)] transition-colors"
              onKeyDown={(event) => event.key === 'Enter' && handleSendFriendRequest()}
            />
            <button
              type="button"
              onClick={handleSendFriendRequest}
              disabled={socialBusy}
              className="w-full sm:w-auto px-3 py-2.5 rounded-xl text-black disabled:opacity-50 flex items-center justify-center gap-1.5"
              style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
            >
              <UserPlus size={16} />
              Add
            </button>
          </div>

          {friendLookup.trim().length >= 2 && (
            <div className="mt-3">
              {friendSearchState === 'loading' && (
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/70 flex items-center gap-2">
                  <Loader size={14} className="animate-spin" />
                  Searching...
                </div>
              )}

              {friendSearchState === 'error' && (
                <div className="rounded-xl border border-red-400/15 bg-red-500/6 px-3 py-3 text-sm text-red-200">
                  Unable to search right now.
                </div>
              )}

              {friendSearchState === 'empty' && (
                <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm text-white/55">
                  No user found for this search.
                </div>
              )}

              {friendSearchState === 'found' && friendSearchResult && (
                <div className="rounded-xl border border-[rgba(212,175,55,0.2)] bg-black/20 px-3 py-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      {friendSearchResult.photoURL ? (
                        <img
                          src={friendSearchResult.photoURL}
                          alt=""
                          className="w-10 h-10 rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold">
                          {friendSearchResult.displayName?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}

                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{friendSearchResult.displayName || 'Player'}</p>
                        <p className="text-xs opacity-60 truncate">
                          {friendSearchResult.username ? `@${friendSearchResult.username}` : friendSearchResult.email || friendSearchResult.uid}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {friendSearchIsSelf ? (
                        <span className="px-3 py-2 rounded-lg text-xs bg-white/8 text-white/55">This is you</span>
                      ) : friendSearchIsFriend ? (
                        <span className="px-3 py-2 rounded-lg text-xs bg-green-500/12 text-green-300">Already friends</span>
                      ) : friendSearchHasOutgoingRequest ? (
                        <span className="px-3 py-2 rounded-lg text-xs bg-white/8 text-white/60">Request sent</span>
                      ) : friendSearchHasIncomingRequest ? (
                        <span className="px-3 py-2 rounded-lg text-xs bg-[rgba(212,175,55,0.12)]" style={{ color: 'var(--gold)' }}>Check inbox</span>
                      ) : friendSearchIsBlocked ? (
                        <span className="px-3 py-2 rounded-lg text-xs bg-red-500/12 text-red-200">Blocked</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleSendFriendRequest(friendSearchActionLookup)}
                          disabled={socialBusy || !friendSearchActionLookup}
                          className="px-3 py-2 rounded-lg text-xs font-semibold text-black disabled:opacity-50 flex items-center justify-center gap-1.5"
                          style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
                        >
                          <UserPlus size={14} />
                          Add Friend
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] opacity-45">Friends List</p>
            <h3 className="text-lg font-semibold mt-2">Friends</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="px-2.5 py-1 rounded-full bg-white/8 text-xs text-white/70">
              {friends.length} total
            </span>
            <span className="px-2.5 py-1 rounded-full bg-green-500/12 text-xs text-green-300">
              {onlineFriendsCount} online
            </span>
          </div>
        </div>

        <div className="mt-4 max-h-[320px] overflow-y-auto space-y-2 pr-1">
          {friends.length === 0 && (
            <div className="rounded-xl border border-dashed border-white/12 bg-white/5 px-4 py-6 text-center">
              <p className="text-sm font-medium">Your friends list is empty</p>
              <p className="text-xs opacity-55 mt-1">
                Claim a username, search for a friend, and send your first request.
              </p>
            </div>
          )}

          {friends.map((friend) => {
            const friendInviteKey = `invite-friend-${friend.uid}`
            const inviteDisabled = queueing || isPartyQueueing || socialActionKey === friendInviteKey || partyBusyKey.startsWith('party:invite:')
            const inviteBlockedByRole = Boolean(party && !isPartyLeader)

            return (
              <div
                key={friend.uid}
                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 lg:flex-row lg:items-center lg:justify-between"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {friend.photoURL ? (
                    <img
                      src={friend.photoURL}
                      alt=""
                      className="w-10 h-10 rounded-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-sm font-semibold">
                      {friend.displayName?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}

                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{friend.displayName}</p>
                    <p className={`text-xs truncate ${friend.isOnline ? 'text-green-300' : 'opacity-50'}`}>
                      {friend.username ? `@${friend.username} • ` : ''}{friend.isOnline ? `online${friend.currentRoomCode ? ` • room ${friend.currentRoomCode}` : ''}` : `last seen ${formatLastSeen(friend.lastSeenAt)}`}
                    </p>
                  </div>
                </div>

                <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:flex sm:flex-wrap sm:items-center">
                  <button
                    type="button"
                    onClick={() => handleInviteFriend(friend)}
                    disabled={inviteDisabled || inviteBlockedByRole || friend.isBlocked}
                    className="col-span-2 sm:col-span-1 px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-45"
                    style={
                      inviteBlockedByRole || friend.isBlocked
                        ? { background: 'rgba(255,255,255,0.08)' }
                        : { background: 'rgba(212, 175, 55, 0.16)', color: 'var(--gold)', border: '1px solid rgba(212, 175, 55, 0.35)' }
                    }
                    title={inviteBlockedByRole ? 'Only party leader can invite' : friend.isBlocked ? 'Unblock user to invite' : 'Send party invite'}
                  >
                    <Send size={12} />
                    Invite to Party
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleMuted(friend)}
                    disabled={socialActionKey === `friend-mute-${friend.uid}` || friend.isBlocked}
                    className="p-2 rounded-lg text-xs disabled:opacity-45 flex items-center justify-center"
                    style={{ background: 'rgba(255,255,255,0.08)', color: friend.isMuted ? '#fbbf24' : 'rgba(255,255,255,0.7)' }}
                    title={friend.isMuted ? 'Unmute friend' : 'Mute friend'}
                  >
                    {friend.isMuted ? <BellRing size={12} /> : <BellOff size={12} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggleBlocked(friend)}
                    disabled={socialActionKey === `friend-block-${friend.uid}`}
                    className="p-2 rounded-lg text-xs disabled:opacity-45 flex items-center justify-center"
                    style={{ background: 'rgba(220,38,38,0.14)', color: '#fca5a5' }}
                    title={friend.isBlocked ? 'Unblock user' : 'Block user'}
                  >
                    <ShieldBan size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {blockedUsers.length > 0 && (
        <div className="rounded-2xl border border-red-400/15 bg-red-500/5 p-4 space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] opacity-45">Blocked Users</p>
          {blockedUsers.map((blockedUser) => (
            <div key={blockedUser.uid} className="flex flex-col gap-3 rounded-xl border border-red-400/12 bg-black/15 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm truncate">{blockedUser.displayName}</p>
                <p className="text-xs opacity-55 truncate">
                  {blockedUser.username ? `@${blockedUser.username}` : 'No claimed username'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleBlocked(blockedUser)}
                disabled={socialActionKey === `friend-block-${blockedUser.uid}`}
                className="w-full sm:w-auto px-3 py-1.5 rounded-lg text-xs bg-white/10 hover:bg-white/15 disabled:opacity-50"
              >
                Unblock
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderInboxWorkspace = () => (
    <div className="space-y-4">
      {inboxCount === 0 && (
        <div className="rounded-2xl border border-dashed border-white/12 bg-white/5 px-4 py-6 text-center">
          <p className="text-sm font-medium">Nothing needs your attention right now</p>
          <p className="text-xs opacity-55 mt-1">
            New friend requests and party invites will appear here.
          </p>
        </div>
      )}

      {incomingPartyInvites.length > 0 && (
        <div className="rounded-2xl border border-[rgba(212,175,55,0.32)] bg-[rgba(212,175,55,0.08)] p-4 space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] opacity-45">Party Invites</p>
          {incomingPartyInvites.map((invite) => (
            <div key={invite.id} className="rounded-xl border border-[rgba(212,175,55,0.22)] bg-black/20 px-3 py-3">
              <p className="text-sm font-semibold">{invite.fromName || 'Player'} invited you to a party</p>
              <p className="text-xs opacity-60 mt-1">Join the party lobby to get ready with the team.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => handleAcceptPartyInvite(invite.id)}
                  disabled={socialActionKey === `party-invite-accept-${invite.id}` || socialActionKey === `party-invite-decline-${invite.id}`}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold text-black disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
                >
                  Join Party
                </button>
                <button
                  type="button"
                  onClick={() => handleDeclinePartyInvite(invite.id)}
                  disabled={socialActionKey === `party-invite-accept-${invite.id}` || socialActionKey === `party-invite-decline-${invite.id}`}
                  className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold bg-white/10 hover:bg-white/15 disabled:opacity-50"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {incomingFriendRequests.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] opacity-45">Friend Requests</p>
          {incomingFriendRequests.map((request) => (
            <div key={request.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{request.fromDisplayName || 'Player'}</p>
                <p className="text-xs opacity-55 mt-1">Wants to add you as a friend.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={() => handleAcceptFriendRequest(request.id)}
                  disabled={socialActionKey === `friend-accept-${request.id}` || socialActionKey === `friend-decline-${request.id}`}
                  className="px-3 py-2 rounded-lg text-sm font-semibold bg-green-500/18 text-green-300 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <UserCheck size={14} />
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => handleDeclineFriendRequest(request.id)}
                  disabled={socialActionKey === `friend-accept-${request.id}` || socialActionKey === `friend-decline-${request.id}`}
                  className="px-3 py-2 rounded-lg text-sm font-semibold bg-red-500/18 text-red-300 disabled:opacity-50 flex items-center gap-1.5"
                >
                  <UserX size={14} />
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {outgoingFriendRequests.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-black/25 p-4 space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] opacity-45">Pending Requests</p>
          {outgoingFriendRequests.map((request) => (
            <div key={request.id} className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{request.toDisplayName || 'Player'}</p>
                <p className="text-xs opacity-55 mt-1">Waiting for them to accept.</p>
              </div>
              <button
                type="button"
                onClick={() => handleCancelFriendRequest(request.id)}
                disabled={socialActionKey === `friend-cancel-${request.id}`}
                className="w-full sm:w-auto px-3 py-2 rounded-lg text-sm font-semibold bg-white/10 hover:bg-white/15 disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderSocialLockedWorkspace = () => (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-black/25 p-5 sm:p-6">
        <p className="text-xs uppercase tracking-[0.24em] opacity-45">Social Hub</p>
        <h3 className="text-xl font-semibold mt-2">Keep party, friends, and invites in one place</h3>
        <p className="text-sm opacity-65 mt-2 leading-6">
          This side of the app is now dedicated to the multiplayer social loop. Sign in first, then use one clear flow:
          add friends, create a party, invite them, and open the lobby when everyone is ready.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        {[
          { label: 'Friends', title: 'Search by username', text: 'Use a simple username instead of room codes when you want to connect with someone again.' },
          { label: 'Party', title: 'Create before launching', text: 'The party stays separate from the game setup so users know who is coming before they start.' },
          { label: 'Inbox', title: 'Handle pending actions once', text: 'All requests and invites land in one inbox instead of being scattered across the page.' },
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"
          >
            <p className="text-[10px] uppercase tracking-[0.24em] opacity-45">{item.label}</p>
            <p className="text-sm font-semibold mt-2">{item.title}</p>
            <p className="text-xs opacity-60 mt-2 leading-5">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  )

  const renderSocialWorkspaceLoading = () => (
    <div className="mt-5 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((index) => (
          <div key={index} className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
            <LoadingBlock className="h-3 w-16" />
            <LoadingBlock className="mt-3 h-7 w-10 rounded-lg" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((index) => (
          <LoadingBlock key={index} className="h-10 w-full rounded-xl" />
        ))}
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <LoadingBlock className="h-3 w-20" />
            <LoadingBlock className="h-6 w-40" />
          </div>
          <LoadingBlock className="h-9 w-full sm:w-28 rounded-xl" />
        </div>

        <div className="mt-4 space-y-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"
            >
              <div className="flex items-center gap-3">
                <LoadingBlock className="h-10 w-10 rounded-full shrink-0" />
                <div className="min-w-0 flex-1 space-y-2">
                  <LoadingBlock className="h-4 w-28" />
                  <LoadingBlock className="h-3 w-20" />
                </div>
                <LoadingBlock className="h-8 w-20 rounded-lg shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const workspaceTabs = [
    {
      id: 'friends',
      label: 'Friends',
      count: friends.length,
    },
    {
      id: 'party',
      label: 'Party',
      count: party ? partyMembers.length : partyInviteCount,
    },
    {
      id: 'inbox',
      label: 'Inbox',
      count: inboxCount,
    },
  ]

  const activeWorkspaceContent = activeWorkspaceTab === 'party'
    ? renderPartyWorkspace()
    : activeWorkspaceTab === 'inbox'
      ? renderInboxWorkspace()
      : renderFriendsWorkspace()

  return (
    <div
      className="min-h-screen w-full py-6 sm:py-8 relative overflow-x-hidden overflow-y-auto"
      style={{
        background: 'radial-gradient(ellipse at center, #0e4a2e 0%, #0A3622 35%, #072818 70%, #051a10 100%)',
      }}
    >
      {suitSymbols.map((s, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none select-none"
          style={{
            left: s.x,
            top: s.y,
            fontSize: s.size,
            color: s.color,
            opacity: s.opacity ?? 0.15,
          }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{
            opacity: s.opacity ?? 0.15,
            scale: 1,
            rotate: s.rotate,
            y: [0, -8, 0],
          }}
          transition={{
            duration: 4,
            delay: i * 0.2,
            y: { repeat: Infinity, duration: 3 + i * 0.5, ease: 'easeInOut' },
          }}
        >
          {s.symbol}
        </motion.div>
      ))}

      <motion.div
        className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        <div className="space-y-6">
          <div className="text-center max-w-3xl mx-auto">
            <motion.div
              className="flex items-center justify-center gap-3 mb-2"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2, duration: 0.6 }}
            >
              <span className="text-3xl opacity-60" style={{ color: 'var(--gold)' }}>{'\u2660'}</span>
              <span className="text-3xl opacity-60" style={{ color: 'var(--card-red)' }}>{'\u2665'}</span>
            </motion.div>

            <motion.h1
              className="text-4xl sm:text-6xl font-bold tracking-wider mb-3"
              style={{
                color: 'var(--gold)',
                textShadow: '0 2px 20px rgba(212, 175, 55, 0.3), 0 1px 5px rgba(0,0,0,0.5)',
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
            >
              {APP_NAME}
            </motion.h1>

            <motion.p
              className="text-lg opacity-70 tracking-wide"
              style={{ color: '#b8c4bc' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              transition={{ delay: 0.5, duration: 0.6 }}
            >
              {APP_TAGLINE}
            </motion.p>

            <motion.div
              className="flex items-center justify-center gap-3 mt-3"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, duration: 0.6 }}
            >
              <span className="text-3xl opacity-60" style={{ color: 'var(--card-red)' }}>{'\u2666'}</span>
              <span className="text-3xl opacity-60" style={{ color: 'var(--gold)' }}>{'\u2663'}</span>
            </motion.div>
          </div>

          <AnimatePresence>
            {activeGame && user && (
              <motion.div
                className="w-full rounded-2xl p-4 sm:p-5"
                style={{
                  background: 'rgba(212, 175, 55, 0.1)',
                  border: '1px solid rgba(212, 175, 55, 0.4)',
                }}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--gold)' }}>
                      Game in Progress
                    </p>
                    <p className="text-xs opacity-60 mt-0.5">
                      Room: {activeGame.roomCode} &middot; {activeGame.gameType === 'donkey' ? 'Gadha Ladan' : 'Call Break'}
                    </p>
                  </div>
                  <motion.button
                    onClick={handleRejoinGame}
                    className="px-4 py-2 rounded-lg font-semibold text-sm text-black"
                    style={{
                      background: 'linear-gradient(135deg, var(--gold), var(--gold-light))',
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    Rejoin
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.22fr)_minmax(320px,0.78fr)] 2xl:grid-cols-[minmax(0,1.18fr)_minmax(360px,0.82fr)] items-start">
            <motion.div
              className="min-w-0 space-y-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.6 }}
            >
              <div
                className="rounded-[30px] border p-4 sm:p-6 backdrop-blur-sm shadow-[0_24px_80px_rgba(0,0,0,0.32)]"
                style={{
                  borderColor: 'rgba(212, 175, 55, 0.24)',
                  background: 'linear-gradient(180deg, rgba(212, 175, 55, 0.09) 0%, rgba(3,12,8,0.64) 28%, rgba(3,12,8,0.74) 100%)',
                }}
              >
                <p className="text-xs uppercase tracking-[0.24em] opacity-45">Play</p>
                <div className="mt-2">
                  <h2 className="text-2xl sm:text-3xl font-semibold">Start a match</h2>
                  <p className="text-sm opacity-65 mt-2 max-w-2xl">
                    Choose the game, pick table size, and start with quick play or a private room.
                  </p>
                </div>

                <div className="mt-5 border-t border-white/10 pt-5">
                  {authLoading ? (
                    <div className="rounded-[24px] bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(0,0,0,0.14))] px-4 py-4">
                      <LoadingBlock className="h-3 w-16" />
                      <div className="mt-3 flex items-center gap-3">
                        <LoadingBlock className="h-12 w-12 rounded-full shrink-0" />
                        <div className="min-w-0 flex-1 space-y-2">
                          <LoadingBlock className="h-5 w-32" />
                          <LoadingBlock className="h-4 w-40" />
                        </div>
                      </div>
                      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                        <LoadingBlock className="h-14 w-full rounded-2xl" />
                        <LoadingBlock className="h-14 w-full rounded-2xl" />
                      </div>
                    </div>
                  ) : !user ? (
                    <div className="space-y-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.24em] opacity-45">Player</p>
                        <p className="text-sm opacity-65 mt-2">
                          Sign in once to unlock quick play, private rooms, and social features.
                        </p>
                      </div>

                      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                        <motion.button
                          onClick={handleGoogleSignIn}
                          disabled={signingIn}
                          className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-2xl font-semibold text-base transition-all duration-300 disabled:opacity-50"
                          style={{
                            background: 'rgba(255, 255, 255, 0.95)',
                            color: '#333',
                          }}
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          {signingIn ? (
                            <Loader size={20} className="animate-spin" />
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 48 48">
                              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                            </svg>
                          )}
                          {signingIn ? 'Signing in...' : 'Continue with Google'}
                        </motion.button>

                        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4">
                          <div className="flex items-center gap-3 opacity-30">
                            <div className="flex-1 h-px bg-white/30" />
                            <span className="text-xs uppercase tracking-widest">guest</span>
                            <div className="flex-1 h-px bg-white/30" />
                          </div>

                          <AnimatePresence>
                            {showGuestInput ? (
                              <motion.div
                                className="mt-3 flex flex-col sm:flex-row gap-2"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={{ duration: 0.3 }}
                              >
                                <input
                                  type="text"
                                  placeholder="Your Name"
                                  value={guestName}
                                  onChange={(e) => setGuestName(e.target.value.slice(0, 20))}
                                  maxLength={20}
                                  className="flex-1 px-4 py-3 rounded-xl bg-black/30 text-white placeholder-white/40 outline-none text-base border border-white/10 focus:border-[var(--gold)] transition-all duration-300"
                                  onKeyDown={(e) => e.key === 'Enter' && guestName.trim() && handleGuestSignIn()}
                                  autoFocus
                                />
                                <motion.button
                                  onClick={handleGuestSignIn}
                                  disabled={!guestName.trim()}
                                  className="px-5 py-3 rounded-xl font-semibold text-black disabled:opacity-50"
                                  style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
                                  whileTap={{ scale: 0.95 }}
                                >
                                  Play
                                </motion.button>
                              </motion.div>
                            ) : (
                              <motion.button
                                onClick={() => setShowGuestInput(true)}
                                className="mt-3 w-full py-3 rounded-xl font-semibold text-sm tracking-wide border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-all duration-300"
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                              >
                                Play as Guest
                              </motion.button>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-[24px] bg-[linear-gradient(135deg,rgba(255,255,255,0.07),rgba(0,0,0,0.14))] px-4 py-4">
                      <p className="text-[11px] uppercase tracking-[0.24em] opacity-45">Player</p>
                      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {user.photoURL ? (
                            <img
                              src={user.photoURL}
                              alt=""
                              className="w-12 h-12 rounded-full border-2 border-[var(--gold)]/40 object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-full bg-[var(--gold)]/20 flex items-center justify-center text-lg font-bold shrink-0" style={{ color: 'var(--gold)' }}>
                              {playerName?.[0]?.toUpperCase() || '?'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p className="text-base font-semibold text-white truncate">{playerName}</p>
                              {visibleUsername && (
                                <p className="text-sm font-medium truncate" style={{ color: 'var(--gold)' }}>
                                  Username: @{visibleUsername}
                                </p>
                              )}
                            </div>
                            {!visibleUsername && identityLoading && (
                              <LoadingBlock className="mt-1 h-4 w-36 rounded-lg" />
                            )}
                            <p className="text-xs opacity-40 truncate">{user.isGuest ? 'Guest account' : user.email}</p>
                          </div>
                        </div>

                        <motion.button
                          onClick={handleSignOut}
                          className="px-3 py-2 rounded-xl text-sm text-white/50 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0 self-start sm:self-auto"
                          whileTap={{ scale: 0.96 }}
                          title="Sign out"
                        >
                          <span className="inline-flex items-center gap-2">
                            <LogOutIcon size={15} />
                            Sign Out
                          </span>
                        </motion.button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px] mt-5">
                  <div>
                    <p className="text-sm opacity-55 mb-3">Game</p>
                    <motion.div
                      className="flex flex-col sm:flex-row rounded-2xl overflow-hidden border border-white/10"
                      style={{ background: 'rgba(0,0,0,0.28)' }}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.55, duration: 0.5 }}
                    >
                      <button
                        onClick={() => setGameMode('callbreak')}
                        className={`flex-1 py-3 px-4 text-sm font-semibold tracking-wide transition-all duration-300 ${
                          gameMode === 'callbreak'
                            ? 'text-black'
                            : 'text-white/60 hover:text-white/80'
                        }`}
                        style={
                          gameMode === 'callbreak'
                            ? { background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }
                            : {}
                        }
                      >
                        ♠ Call Break
                      </button>
                      <button
                        onClick={() => setGameMode('donkey')}
                        className={`flex-1 py-3 px-4 text-sm font-semibold tracking-wide transition-all duration-300 ${
                          gameMode === 'donkey'
                            ? 'text-black'
                            : 'text-white/60 hover:text-white/80'
                        }`}
                        style={
                          gameMode === 'donkey'
                            ? { background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }
                            : {}
                        }
                      >
                        🫏 Gadha Ladan
                      </button>
                    </motion.div>
                  </div>

                  <div>
                    <p className="text-sm opacity-55 mb-3">Seats</p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
                      {[2, 3, 4, 5].map((n) => (
                        <motion.button
                          key={n}
                          onClick={() => setMaxPlayers(n)}
                          className={`h-12 rounded-xl font-bold text-sm transition-all ${
                            maxPlayers === n
                              ? 'text-black'
                              : 'bg-white/5 text-white/80 hover:bg-white/10 border border-white/10'
                          }`}
                          style={
                            maxPlayers === n
                              ? { background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }
                              : {}
                          }
                          whileHover={{ scale: 1.04 }}
                          whileTap={{ scale: 0.96 }}
                        >
                          {n}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>

                {user ? (
                  <div className="space-y-4 mt-5">
                    <motion.button
                      onClick={handleQuickPlay}
                      disabled={loading || queueing}
                      className="w-full flex items-center justify-center gap-2 px-5 py-4 rounded-2xl font-semibold text-black text-lg transition-all duration-300 disabled:opacity-50"
                      style={{
                        background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
                        boxShadow: '0 8px 22px rgba(212, 175, 55, 0.28)',
                      }}
                      whileHover={{ scale: 1.015, boxShadow: '0 10px 28px rgba(212, 175, 55, 0.36)' }}
                      whileTap={{ scale: 0.985 }}
                    >
                      <Zap size={20} />
                      Quick Play
                    </motion.button>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <motion.button
                        onClick={handleCreateRoom}
                        disabled={loading || queueing}
                        className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl font-semibold text-base transition-all duration-300 disabled:opacity-50"
                        style={{
                          color: 'var(--gold)',
                          border: '1px solid rgba(212, 175, 55, 0.45)',
                          background: 'rgba(212, 175, 55, 0.06)',
                        }}
                        whileHover={{ scale: 1.02, background: 'rgba(212, 175, 55, 0.12)' }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Sparkles size={18} />
                        Create Private Room
                      </motion.button>

                      <motion.button
                        onClick={() => setShowJoin(!showJoin)}
                        disabled={queueing}
                        className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl font-semibold text-base transition-all duration-300 disabled:opacity-50"
                        style={{
                          color: showJoin ? 'var(--gold)' : 'rgba(255,255,255,0.8)',
                          border: showJoin ? '1px solid rgba(212, 175, 55, 0.45)' : '1px solid rgba(255,255,255,0.14)',
                          background: showJoin ? 'rgba(212, 175, 55, 0.08)' : 'rgba(255,255,255,0.04)',
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <LogIn size={18} />
                        {showJoin ? 'Hide Join Form' : 'Join With Code'}
                      </motion.button>
                    </div>

                    <AnimatePresence>
                      {queueing && (
                        <motion.div
                          className="rounded-2xl p-4 text-center"
                          style={{
                            background: 'rgba(0, 0, 0, 0.4)',
                            border: '1px solid rgba(212, 175, 55, 0.3)',
                          }}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <motion.div
                            className="flex items-center justify-center gap-2 mb-2"
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                          >
                            <Loader size={16} className="animate-spin" style={{ color: 'var(--gold)' }} />
                            <span className="text-sm font-medium" style={{ color: 'var(--gold)' }}>
                              Searching for players...
                            </span>
                          </motion.div>
                          {queueStatus && (
                            <p className="text-xs opacity-60 mb-3">
                              {queueStatus.total}/{queueStatus.maxPlayers} players in queue
                            </p>
                          )}
                          <motion.button
                            onClick={handleLeaveQueue}
                            className="flex items-center justify-center gap-1.5 mx-auto px-4 py-1.5 rounded-lg text-sm text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all"
                            whileTap={{ scale: 0.95 }}
                          >
                            <X size={14} />
                            Cancel
                          </motion.button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {showJoin && !queueing && (
                        <motion.div
                          className="flex flex-col sm:flex-row gap-3"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.3 }}
                        >
                          <input
                            type="text"
                            placeholder="Room Code"
                            value={roomCode}
                            onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
                            maxLength={6}
                            className="flex-1 px-5 py-3.5 rounded-2xl bg-black/30 text-white placeholder-white/40 outline-none text-lg tracking-[0.3em] text-center font-mono uppercase border border-white/10 focus:border-[var(--gold)] focus:shadow-[0_0_20px_rgba(212,175,55,0.15)] transition-all duration-300"
                            onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                            autoFocus
                          />
                          <motion.button
                            onClick={handleJoinRoom}
                            disabled={loading}
                            className="px-6 py-3.5 rounded-2xl font-semibold text-black transition-all duration-300 disabled:opacity-50"
                            style={{
                              background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
                            }}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                          >
                            Enter Room
                          </motion.button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ) : null}
              </div>
            </motion.div>

            <motion.div
              className="min-w-0 space-y-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.68, duration: 0.6 }}
            >
              <div className="min-w-0 overflow-hidden rounded-[28px] border border-white/8 bg-[rgba(3,12,8,0.42)] p-4 sm:p-5 backdrop-blur-sm shadow-[0_16px_48px_rgba(0,0,0,0.22)]">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <p className="text-xs uppercase tracking-[0.24em] opacity-45">Social Workspace</p>
                  </div>

                  {user && (
                    <div className="grid w-full grid-cols-3 gap-2 xl:w-auto xl:min-w-[280px]">
                      {workspaceLoading ? (
                        [0, 1, 2].map((index) => (
                          <div key={index} className="rounded-xl border border-white/8 bg-black/20 px-3 py-3">
                            <LoadingBlock className="mx-auto h-3 w-12" />
                            <LoadingBlock className="mx-auto mt-3 h-7 w-8 rounded-lg" />
                          </div>
                        ))
                      ) : (
                        <>
                          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-center">
                            <p className="text-[10px] uppercase tracking-[0.22em] opacity-45">Friends</p>
                            <p className="text-lg font-semibold mt-1">{friends.length}</p>
                          </div>
                          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-center">
                            <p className="text-[10px] uppercase tracking-[0.22em] opacity-45">Online</p>
                            <p className="text-lg font-semibold mt-1">{onlineFriendsCount}</p>
                          </div>
                          <div className="rounded-xl border border-white/8 bg-black/20 px-3 py-3 text-center">
                            <p className="text-[10px] uppercase tracking-[0.22em] opacity-45">Inbox</p>
                            <p className="text-lg font-semibold mt-1">{inboxCount}</p>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {user && socialEnabled ? (
                  workspaceLoading ? renderSocialWorkspaceLoading() : (
                    <div className="mt-5 space-y-4">
                      <div className="grid grid-cols-3 gap-2">
                        {workspaceTabs.map((tab) => {
                          const isActive = activeWorkspaceTab === tab.id
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => handleSelectWorkspaceTab(tab.id)}
                              className={`w-full px-2.5 sm:px-3.5 py-2 rounded-xl text-sm font-semibold transition-all duration-200 flex items-center justify-center gap-1.5 sm:gap-2 ${
                                isActive ? 'text-black' : 'text-white/70 hover:text-white'
                              }`}
                              style={
                                isActive
                                  ? { background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }
                                  : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }
                              }
                            >
                              <span>{tab.label}</span>
                              {tab.count > 0 && (
                                <span
                                  className={`min-w-[22px] h-[22px] rounded-full px-1.5 text-[11px] flex items-center justify-center ${
                                    isActive ? 'bg-black/15 text-black' : 'bg-white/10 text-white/70'
                                  }`}
                                >
                                  {tab.count}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>

                      {activeWorkspaceContent}
                    </div>
                  )
                ) : (
                  <div className="mt-5">
                    {renderSocialLockedWorkspace()}
                  </div>
                )}
              </div>

              {user?.isGuest && !socialEnabled && (
                <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-4">
                  <p className="text-sm font-medium">Guest mode is active with limited social sync</p>
                  <p className="text-xs opacity-55 mt-1 leading-5">
                    If party or friends are unavailable here, check that guest Firebase auth is fully connected in this session.
                  </p>
                </div>
              )}
            </motion.div>
          </div>

          <motion.p
            className="text-sm opacity-30 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.3 }}
            transition={{ delay: 1, duration: 0.6 }}
          >
            2-5 Players &middot; 5 Rounds &middot; Spades are Trump
          </motion.p>
        </div>
      </motion.div>
    </div>
  )
}
