import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, LogIn, Sparkles, Zap, X, Loader, LogOut as LogOutIcon, UserPlus, UserCheck, UserX, Send, Crown, Rocket, ShieldCheck, AtSign, BellOff, BellRing, ShieldBan } from 'lucide-react'
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
  const [usernameInput, setUsernameInput] = useState('')
  const [socialBusy, setSocialBusy] = useState(false)
  const [socialActionKey, setSocialActionKey] = useState('')
  const {
    enabled: socialEnabled,
    profile: socialProfile,
    friends,
    blockedUsers,
    incomingFriendRequests,
    outgoingFriendRequests,
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
    party,
    invites: incomingPartyInvites,
    busyKey: partyBusyKey,
    isLeader: isPartyLeader,
    myMember: myPartyMember,
    createParty,
    leaveParty,
    setReady: setPartyReady,
    inviteFriend: sendPartyInviteToFriend,
    acceptInvite: acceptPartyInvite,
    declineInvite: declinePartyInvite,
    launchPrivateRoom,
    launchMatchmaking,
    cancelMatchmaking,
  } = useParty()

  // Get player name from auth
  const playerName = user?.displayName || ''

  const queueing = state.phase === 'QUEUING'
  const queueStatus = state.queueStatus
  const activeUsername = socialProfile?.claimedUsername || ''

  useEffect(() => {
    if (!socialEnabled) return
    setUsernameInput((current) => {
      if (current && current !== activeUsername) return current
      return activeUsername || socialProfile?.username || ''
    })
  }, [socialEnabled, activeUsername, socialProfile?.username])

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

  const handleGuestSignIn = () => {
    if (!guestName.trim()) return
    signInAsGuest(guestName.trim())
    toast.success(`Welcome, ${guestName.trim()}!`)
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

  const handleSendFriendRequest = async () => {
    const lookup = friendLookup.trim()
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
      toast.error('Sign in with Google to create a party')
      return
    }
    try {
      await createParty({
        gameType: gameMode,
        targetSize: maxPlayers,
      })
      dispatch({ type: 'SET_GAME_TYPE', payload: gameMode })
      toast.success('Party created')
      navigate('/lobby')
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

  const handleTogglePartyReady = async () => {
    if (!party) return
    try {
      await setPartyReady(!myPartyMember?.ready)
    } catch (error) {
      toast.error(error?.message || 'Unable to update ready status')
    }
  }

  const handleLaunchPartyPrivate = async () => {
    try {
      await launchPrivateRoom()
      toast.success('Launching party match...')
    } catch (error) {
      toast.error(error?.message || 'Unable to launch match')
    }
  }

  const handleLaunchPartyMatchmaking = async () => {
    try {
      const response = await launchMatchmaking()
      if (response?.queued) {
        const position = response?.party?.matchmaking?.position || response?.position || 1
        const total = response?.party?.matchmaking?.total || response?.total || 1
        toast.success(`Party queued for matchmaking (${position}/${total})`)
      } else {
        toast.success('Party matchmaking launched')
      }
    } catch (error) {
      toast.error(error?.message || 'Unable to launch matchmaking')
    }
  }

  const handleCancelPartyMatchmaking = async () => {
    try {
      await cancelMatchmaking()
      toast('Party matchmaking canceled')
    } catch (error) {
      toast.error(error?.message || 'Unable to cancel matchmaking')
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
        navigate('/lobby')
      }
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
  const canPartyLaunch = Boolean(
    party
    && isPartyLeader
    && allConnectedPartyReady
    && connectedPartyMembers.length >= 2
    && !isPartyQueueing
  )

  return (
    <div className="min-h-screen w-full flex items-center justify-center py-8 relative overflow-x-hidden overflow-y-auto"
      style={{
        background: 'radial-gradient(ellipse at center, #0e4a2e 0%, #0A3622 35%, #072818 70%, #051a10 100%)',
      }}
    >
      {/* Decorative suit symbols */}
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

      {/* Main content */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-6 sm:gap-8 w-full max-w-md px-4 sm:px-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Title */}
        <div className="text-center">
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
            className="flex items-center justify-center gap-3 mt-2"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <span className="text-3xl opacity-60" style={{ color: 'var(--card-red)' }}>{'\u2666'}</span>
            <span className="text-3xl opacity-60" style={{ color: 'var(--gold)' }}>{'\u2663'}</span>
          </motion.div>
        </div>

        {/* Rejoin Game Banner */}
        <AnimatePresence>
          {activeGame && user && (
            <motion.div
              className="w-full rounded-xl p-4"
              style={{
                background: 'rgba(212, 175, 55, 0.1)',
                border: '1px solid rgba(212, 175, 55, 0.4)',
              }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <div className="flex items-center justify-between">
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

        {/* Game Mode Tabs */}
        <motion.div
          className="flex rounded-xl overflow-hidden border border-white/10"
          style={{ background: 'rgba(0,0,0,0.3)' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.5 }}
        >
          <button
            onClick={() => setGameMode('callbreak')}
            className={`flex-1 py-2.5 px-4 text-sm font-semibold tracking-wide transition-all duration-300 ${
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
            className={`flex-1 py-2.5 px-4 text-sm font-semibold tracking-wide transition-all duration-300 ${
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

        {/* Auth + Form */}
        <motion.div
          className="w-full flex flex-col gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          {/* Google Sign-In or User Profile */}
          {authLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader size={24} className="animate-spin" style={{ color: 'var(--gold)' }} />
            </div>
          ) : !user ? (
            <>
              <motion.button
                onClick={handleGoogleSignIn}
                disabled={signingIn}
                className="w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl font-semibold
                  text-lg transition-all duration-300 disabled:opacity-50"
                style={{
                  background: 'rgba(255, 255, 255, 0.95)',
                  color: '#333',
                }}
                whileHover={{ scale: 1.02 }}
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
                {signingIn ? 'Signing in...' : 'Sign in with Google'}
              </motion.button>

              {/* Guest mode divider + input */}
              <div className="flex items-center gap-3 opacity-30">
                <div className="flex-1 h-px bg-white/30" />
                <span className="text-xs uppercase tracking-widest">or</span>
                <div className="flex-1 h-px bg-white/30" />
              </div>

              <AnimatePresence>
                {showGuestInput ? (
                  <motion.div
                    className="flex gap-2"
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
                      className="flex-1 px-4 py-3 rounded-xl bg-black/30 text-white placeholder-white/40
                        outline-none text-base border border-white/10 focus:border-[var(--gold)]
                        transition-all duration-300"
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
                    className="w-full py-3 rounded-xl font-semibold text-sm tracking-wide
                      border border-white/20 text-white/70 hover:text-white hover:border-white/40
                      transition-all duration-300"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    Play as Guest
                  </motion.button>
                )}
              </AnimatePresence>
            </>
          ) : (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-3">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt=""
                    className="w-10 h-10 rounded-full border-2 border-[var(--gold)]/40"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-[var(--gold)]/20 flex items-center justify-center text-lg font-bold" style={{ color: 'var(--gold)' }}>
                    {playerName?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
                <div>
                  <p className="text-sm font-semibold text-white">{playerName}</p>
                  <p className="text-[11px] opacity-40">{user.isGuest ? 'Guest' : user.email}</p>
                </div>
              </div>
              <motion.button
                onClick={handleSignOut}
                className="p-2 rounded-lg text-white/40 hover:text-red-400 hover:bg-red-500/10 transition-all"
                whileTap={{ scale: 0.9 }}
                title="Sign out"
              >
                <LogOutIcon size={16} />
              </motion.button>
            </div>
          )}

          {/* Player count selector — only show when signed in */}
          {user && (<>

          {/* Player count selector */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm opacity-50 mr-1">Players:</span>
            {[2, 3, 4, 5].map((n) => (
              <motion.button
                key={n}
                onClick={() => setMaxPlayers(n)}
                className={`w-10 h-10 rounded-lg font-bold text-sm transition-all ${
                  maxPlayers === n
                    ? 'text-black'
                    : 'bg-white/5 text-white/80 hover:bg-white/10 border border-white/10'
                }`}
                style={
                  maxPlayers === n
                    ? { background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }
                    : {}
                }
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {n}
              </motion.button>
            ))}
          </div>

          {/* Quick Play button */}
          <motion.button
            onClick={handleQuickPlay}
            disabled={loading || queueing}
            className="w-full flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-semibold
              text-black text-lg transition-all duration-300 disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
              boxShadow: '0 4px 15px rgba(212, 175, 55, 0.3)',
            }}
            whileHover={{ scale: 1.02, boxShadow: '0 6px 20px rgba(212, 175, 55, 0.4)' }}
            whileTap={{ scale: 0.98 }}
          >
            <Zap size={20} />
            Quick Play
          </motion.button>

          {/* Queue status overlay */}
          <AnimatePresence>
            {queueing && (
              <motion.div
                className="w-full rounded-xl p-4 text-center"
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
                  className="flex items-center justify-center gap-1.5 mx-auto px-4 py-1.5 rounded-lg text-sm
                    text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all"
                  whileTap={{ scale: 0.95 }}
                >
                  <X size={14} />
                  Cancel
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Divider */}
          <div className="flex items-center gap-3 opacity-30">
            <div className="flex-1 h-px bg-white/30" />
            <span className="text-xs uppercase tracking-widest">or</span>
            <div className="flex-1 h-px bg-white/30" />
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <motion.button
              onClick={handleCreateRoom}
              disabled={loading || queueing}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-semibold
                text-lg transition-all duration-300 disabled:opacity-50"
              style={{
                color: 'var(--gold)',
                border: '2px solid var(--gold)',
                background: 'transparent',
              }}
              whileHover={{ scale: 1.02, background: 'rgba(212, 175, 55, 0.1)' }}
              whileTap={{ scale: 0.98 }}
            >
              <Sparkles size={20} />
              Create Room
            </motion.button>

            <motion.button
              onClick={() => setShowJoin(!showJoin)}
              disabled={queueing}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-semibold
                text-lg transition-all duration-300 disabled:opacity-50"
              style={{
                color: 'var(--gold)',
                border: '2px solid var(--gold)',
                background: showJoin ? 'rgba(212, 175, 55, 0.1)' : 'transparent',
              }}
              whileHover={{ scale: 1.02, background: 'rgba(212, 175, 55, 0.1)' }}
              whileTap={{ scale: 0.98 }}
            >
              <LogIn size={20} />
              Join Room
            </motion.button>
          </div>

          {/* Join room input */}
          <AnimatePresence>
            {showJoin && !queueing && (
              <motion.div
                className="flex gap-3"
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
                  className="flex-1 px-5 py-3.5 rounded-xl bg-black/30 text-white placeholder-white/40
                    outline-none text-lg tracking-[0.3em] text-center font-mono uppercase
                    border border-white/10 focus:border-[var(--gold)] focus:shadow-[0_0_20px_rgba(212,175,55,0.15)]
                    transition-all duration-300"
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                  autoFocus
                />
                <motion.button
                  onClick={handleJoinRoom}
                  disabled={loading}
                  className="px-6 py-3.5 rounded-xl font-semibold text-black transition-all duration-300
                    disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Users size={20} />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          {socialEnabled && (
            <motion.div
              className="rounded-xl border border-white/10 bg-black/25 p-4 flex flex-col gap-3"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.35 }}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold" style={{ color: 'var(--gold)' }}>Friends, Party & Invites</p>
                <span className="text-xs opacity-50">{friends.length} friends</span>
              </div>

              {partyEnabled && (
                <div className="rounded-lg border border-[rgba(212,175,55,0.28)] bg-[rgba(212,175,55,0.08)] p-3 space-y-2">
                  {!party ? (
                    <div className="space-y-2">
                      <p className="text-xs opacity-80">
                        Create a party and invite friends before launching a private room or matchmaking.
                      </p>
                      <button
                        type="button"
                        onClick={handleCreateParty}
                        disabled={partyBusyKey === 'party:create'}
                        className="w-full px-3 py-2 rounded-lg text-sm font-semibold text-black disabled:opacity-60 flex items-center justify-center gap-2"
                        style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
                      >
                        <Users size={15} />
                        Create Party
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">
                            Party {party.partyId?.slice(-6) || party.partyId}
                          </p>
                          <p className="text-[11px] opacity-70 truncate">
                            {party.gameType === 'donkey' ? 'Gadha Ladan' : 'Call Break'} • {connectedPartyMembers.length}/{party.targetSize} connected
                            {isPartyQueueing && partyQueue ? ` • queue ${partyQueue.position}/${partyQueue.total}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] uppercase tracking-wide opacity-80">{party.status}</span>
                          <button
                            type="button"
                            onClick={handleLeaveParty}
                            disabled={partyBusyKey === 'party:leave'}
                            className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15 disabled:opacity-60"
                          >
                            Leave
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                        {partyMembers.map((member) => (
                          <div key={member.uid} className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1.5">
                            <div className="min-w-0 flex items-center gap-1.5">
                              {member.role === 'leader' && <Crown size={13} className="text-[var(--gold)] shrink-0" />}
                              <p className="text-xs truncate">{member.name || 'Player'}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`text-[10px] uppercase ${member.connected ? 'text-green-400' : 'opacity-45'}`}>
                                {member.connected ? 'Online' : 'Offline'}
                              </span>
                              <span className={`text-[10px] uppercase ${member.ready ? 'text-[var(--gold)]' : 'opacity-45'}`}>
                                {member.ready ? 'Ready' : 'Not Ready'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={handleTogglePartyReady}
                          disabled={partyBusyKey === 'party:ready' || isPartyQueueing}
                          className="flex-1 min-w-[120px] px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-60"
                          style={myPartyMember?.ready
                            ? { background: 'rgba(33, 150, 83, 0.2)', color: '#86efac', border: '1px solid rgba(134,239,172,0.35)' }
                            : { background: 'rgba(212, 175, 55, 0.2)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.35)' }}
                        >
                          <ShieldCheck size={12} />
                          {myPartyMember?.ready ? 'Ready' : 'Set Ready'}
                        </button>
                        {isPartyLeader && (
                          <>
                            <button
                              type="button"
                              onClick={handleLaunchPartyPrivate}
                              disabled={!canPartyLaunch || partyBusyKey === 'party:launch:private'}
                              className="flex-1 min-w-[120px] px-2.5 py-1.5 rounded-md text-xs font-semibold text-black disabled:opacity-60 flex items-center justify-center gap-1.5"
                              style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
                            >
                              <Rocket size={12} />
                              Launch Private
                            </button>
                            {isPartyQueueing ? (
                              <button
                                type="button"
                                onClick={handleCancelPartyMatchmaking}
                                disabled={partyBusyKey === 'party:matchmaking:cancel'}
                                className="flex-1 min-w-[120px] px-2.5 py-1.5 rounded-md text-xs font-semibold bg-red-500/15 text-red-300 border border-red-400/25 disabled:opacity-60"
                              >
                                Cancel Queue
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={handleLaunchPartyMatchmaking}
                                disabled={!canPartyLaunch || partyBusyKey === 'party:launch:matchmaking'}
                                className="flex-1 min-w-[120px] px-2.5 py-1.5 rounded-md text-xs font-semibold bg-white/10 hover:bg-white/15 disabled:opacity-60"
                              >
                                Matchmaking
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(event) => setUsernameInput(event.target.value)}
                  placeholder="Claim @username"
                  className="flex-1 px-3 py-2 rounded-lg bg-black/30 text-white text-sm
                    placeholder-white/35 border border-white/10 outline-none
                    focus:border-[var(--gold)] transition-colors"
                  onKeyDown={(event) => event.key === 'Enter' && handleClaimUsername()}
                />
                <button
                  type="button"
                  onClick={handleClaimUsername}
                  disabled={socialActionKey === 'claim-username'}
                  className="px-3 py-2 rounded-lg text-black disabled:opacity-50 flex items-center gap-1"
                  style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
                >
                  <AtSign size={15} />
                  Claim
                </button>
              </div>

              <p className="text-[11px] opacity-45">
                Your social username: {activeUsername ? `@${activeUsername}` : 'not claimed yet'}.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={friendLookup}
                  onChange={(event) => setFriendLookup(event.target.value)}
                  placeholder="Find @username, email, or UID"
                  className="flex-1 px-3 py-2 rounded-lg bg-black/30 text-white text-sm
                    placeholder-white/35 border border-white/10 outline-none
                    focus:border-[var(--gold)] transition-colors"
                  onKeyDown={(event) => event.key === 'Enter' && handleSendFriendRequest()}
                />
                <button
                  type="button"
                  onClick={handleSendFriendRequest}
                  disabled={socialBusy}
                  className="px-3 py-2 rounded-lg text-black disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
                >
                  <UserPlus size={16} />
                </button>
              </div>

              <p className="text-[11px] opacity-45">
                Search by claimed username first. Email, exact display name, and Firebase UID remain as fallback.
              </p>

              {incomingFriendRequests.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wider opacity-60">Friend Requests</p>
                  {incomingFriendRequests.map((request) => (
                    <div key={request.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                      <span className="text-xs truncate">{request.fromDisplayName || 'Player'}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleAcceptFriendRequest(request.id)}
                          disabled={socialActionKey === `friend-accept-${request.id}` || socialActionKey === `friend-decline-${request.id}`}
                          className="p-1.5 rounded-md bg-green-500/20 text-green-400 disabled:opacity-50"
                          title="Accept"
                        >
                          <UserCheck size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeclineFriendRequest(request.id)}
                          disabled={socialActionKey === `friend-accept-${request.id}` || socialActionKey === `friend-decline-${request.id}`}
                          className="p-1.5 rounded-md bg-red-500/20 text-red-400 disabled:opacity-50"
                          title="Decline"
                        >
                          <UserX size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {outgoingFriendRequests.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wider opacity-60">Pending Friend Requests</p>
                  {outgoingFriendRequests.map((request) => (
                    <div key={request.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2">
                      <span className="text-xs truncate">Waiting: {request.toDisplayName || 'Player'}</span>
                      <button
                        type="button"
                        onClick={() => handleCancelFriendRequest(request.id)}
                        disabled={socialActionKey === `friend-cancel-${request.id}`}
                        className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {incomingPartyInvites.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wider opacity-60">Party Invites</p>
                  {incomingPartyInvites.map((invite) => (
                    <div key={invite.id} className="rounded-lg border border-[rgba(212,175,55,0.35)] bg-[rgba(212,175,55,0.08)] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">
                            {invite.fromName || 'Player'} invited you
                          </p>
                          <p className="text-[11px] opacity-60 truncate">
                            Party lobby invite
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleAcceptPartyInvite(invite.id)}
                          disabled={socialActionKey === `party-invite-accept-${invite.id}` || socialActionKey === `party-invite-decline-${invite.id}`}
                          className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold text-black disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
                        >
                          Join Party
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeclinePartyInvite(invite.id)}
                          disabled={socialActionKey === `party-invite-accept-${invite.id}` || socialActionKey === `party-invite-decline-${invite.id}`}
                          className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold bg-white/10 hover:bg-white/15 disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="max-h-52 overflow-y-auto space-y-2 pr-1">
                {friends.length === 0 && (
                  <p className="text-xs opacity-45 text-center py-2">
                    Add friends, then send party invites from here.
                  </p>
                )}

                {friends.map((friend) => {
                  const friendInviteKey = `invite-friend-${friend.uid}`
                  const inviteDisabled = queueing || isPartyQueueing || socialActionKey === friendInviteKey || partyBusyKey.startsWith('party:invite:')
                  const inviteBlockedByRole = Boolean(party && !isPartyLeader)

                  return (
                    <div key={friend.uid} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {friend.photoURL ? (
                          <img
                            src={friend.photoURL}
                            alt=""
                            className="w-7 h-7 rounded-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold">
                            {friend.displayName?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-xs truncate">{friend.displayName}</p>
                          <p className={`text-[11px] truncate ${friend.isOnline ? 'text-green-400' : 'opacity-45'}`}>
                            {friend.username ? `@${friend.username} • ` : ''}{friend.isOnline ? `online${friend.currentRoomCode ? ` • room ${friend.currentRoomCode}` : ''}` : `last seen ${formatLastSeen(friend.lastSeenAt)}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleToggleMuted(friend)}
                          disabled={socialActionKey === `friend-mute-${friend.uid}` || friend.isBlocked}
                          className="p-1.5 rounded-md text-xs disabled:opacity-45"
                          style={{ background: 'rgba(255,255,255,0.08)', color: friend.isMuted ? '#fbbf24' : 'rgba(255,255,255,0.7)' }}
                          title={friend.isMuted ? 'Unmute friend' : 'Mute friend'}
                        >
                          {friend.isMuted ? <BellRing size={12} /> : <BellOff size={12} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleBlocked(friend)}
                          disabled={socialActionKey === `friend-block-${friend.uid}`}
                          className="p-1.5 rounded-md text-xs disabled:opacity-45"
                          style={{ background: 'rgba(220,38,38,0.14)', color: '#fca5a5' }}
                          title={friend.isBlocked ? 'Unblock user' : 'Block user'}
                        >
                          <ShieldBan size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleInviteFriend(friend)}
                          disabled={inviteDisabled || inviteBlockedByRole || friend.isBlocked}
                          className="px-2.5 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 disabled:opacity-45"
                          style={
                            inviteBlockedByRole || friend.isBlocked
                              ? { background: 'rgba(255, 255, 255, 0.08)' }
                              : { background: 'rgba(212, 175, 55, 0.16)', color: 'var(--gold)', border: '1px solid rgba(212, 175, 55, 0.35)' }
                          }
                          title={inviteBlockedByRole ? 'Only party leader can invite' : friend.isBlocked ? 'Unblock user to invite' : 'Send party invite'}
                        >
                          <Send size={12} />
                          Invite
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {blockedUsers.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs uppercase tracking-wider opacity-60">Blocked Users</p>
                  {blockedUsers.map((blockedUser) => (
                    <div key={blockedUser.uid} className="flex items-center justify-between gap-2 rounded-lg border border-red-400/15 bg-red-500/5 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs truncate">{blockedUser.displayName}</p>
                        <p className="text-[11px] opacity-50 truncate">
                          {blockedUser.username ? `@${blockedUser.username}` : 'No claimed username'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleBlocked(blockedUser)}
                        disabled={socialActionKey === `friend-block-${blockedUser.uid}`}
                        className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15 disabled:opacity-50"
                      >
                        Unblock
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {user?.isGuest && (
            <p className="text-xs opacity-45 text-center">
              Friends and invites are available when you sign in with Google.
            </p>
          )}

          </>)}
        </motion.div>

        {/* Footer info */}
        <motion.p
          className="text-sm opacity-30 mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          2-5 Players &middot; 5 Rounds &middot; Spades are Trump
        </motion.p>
      </motion.div>
    </div>
  )
}
