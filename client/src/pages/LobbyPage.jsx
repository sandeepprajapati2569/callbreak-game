import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Copy, Check, Crown, MessageCircle, Send, X, LogOut, UserPlus, Clock3 } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { useGame } from '../context/GameContext'
import { useAuth } from '../context/AuthContext'
import { useSocial } from '../context/SocialContext'
import { useVoiceChatContext } from '../context/VoiceChatContext'
import { useOrientation } from '../hooks/useOrientation'
import VoiceChat from '../components/game/VoiceChat'
import toast from 'react-hot-toast'

export default function LobbyPage() {
  const navigate = useNavigate()
  const { socket, setPlayerId, setRoomCode } = useSocket()
  const { state, dispatch } = useGame()
  const { user } = useAuth()
  const {
    enabled: socialEnabled,
    friends,
    incomingGameInvites,
    outgoingGameInvites,
    sendGameInvite,
    acceptGameInvite,
    declineGameInvite,
    cancelGameInvite,
  } = useSocial()
  const voiceChat = useVoiceChatContext()
  const [copied, setCopied] = useState(false)
  const [countdown, setCountdown] = useState(null)
  const [chatInput, setChatInput] = useState('')
  const [showChat, setShowChat] = useState(false)
  const [socialActionKey, setSocialActionKey] = useState('')
  const chatEndRef = useRef(null)

  const { roomCode, players, playerId, messages, maxPlayers } = state

  // Navigate to landing if no room
  useEffect(() => {
    if (!roomCode && state.phase === 'LANDING') {
      navigate('/')
    }
  }, [roomCode, state.phase, navigate])

  // Navigate to game when starting
  useEffect(() => {
    if (state.phase === 'GAME_STARTING' || state.phase === 'BIDDING' || state.phase === 'PLAYING') {
      navigate('/game')
    }
    if (state.phase === 'DONKEY_PLAYING' || state.phase === 'DONKEY_GAME_OVER' || state.phase === 'DONKEY_ROUND_RESULT') {
      navigate('/donkey-game')
    }
  }, [state.phase, navigate])

  // Countdown when all players ready
  useEffect(() => {
    const allReady = players.length === maxPlayers && players.every((p) => p.isReady)
    if (allReady) {
      setCountdown(3)
    } else {
      setCountdown(null)
    }
  }, [players])

  useEffect(() => {
    if (countdown === null) return
    if (countdown <= 0) return
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000)
    return () => clearTimeout(timer)
  }, [countdown])

  // Scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleCopyCode = () => {
    if (roomCode) {
      navigator.clipboard.writeText(roomCode)
      setCopied(true)
      toast.success('Room code copied!')
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleToggleReady = () => {
    if (!socket) return
    socket.emit('player-ready')
  }

  const handleSendChat = () => {
    if (!chatInput.trim() || !socket) return
    socket.emit('send-chat', { message: chatInput.trim() })
    setChatInput('')
  }

  const handleKickPlayer = (targetPlayerId) => {
    if (!socket) return
    socket.emit('kick-player', { targetPlayerId }, (response) => {
      if (response?.error) {
        toast.error(response.error)
      }
    })
  }

  const handleLeaveRoom = () => {
    if (!socket) return
    socket.emit('leave-room')
    dispatch({ type: 'RESET' })
    setPlayerId(null)
    setRoomCode(null)
    navigate('/')
  }

  const handleInviteFriend = async (friend) => {
    if (!friend?.uid) return
    if (!friend.isOnline) {
      toast.error(`${friend.displayName || 'Friend'} is offline`)
      return
    }
    if (!roomCode) {
      toast.error('Create room first')
      return
    }

    const key = `invite-friend-${friend.uid}`
    setSocialActionKey(key)

    try {
      await sendGameInvite({
        toUid: friend.uid,
        roomCode,
        gameType: state.gameType || 'callbreak',
        maxPlayers: state.maxPlayers || maxPlayers,
      })
      toast.success(`Invite sent to ${friend.displayName || 'friend'}`)
    } catch (error) {
      toast.error(error?.message || 'Unable to send invite')
    } finally {
      setSocialActionKey('')
    }
  }

  const handleAcceptInvite = async (inviteId) => {
    if (!socket) {
      toast.error('Connecting to server...')
      return
    }

    const key = `invite-accept-${inviteId}`
    setSocialActionKey(key)

    try {
      const invite = await acceptGameInvite(inviteId)
      const playerName = user?.displayName || myPlayer?.name || state.playerName

      if (!playerName) {
        throw new Error('Please sign in before joining invite')
      }

      if (roomCode && roomCode !== invite.roomCode) {
        socket.emit('leave-room')
      }

      dispatch({ type: 'SET_PLAYER_NAME', payload: playerName })
      dispatch({ type: 'SET_GAME_TYPE', payload: invite.gameType || 'callbreak' })

      await new Promise((resolve, reject) => {
        socket.emit(
          'join-room',
          { playerName, roomCode: invite.roomCode, photoURL: user?.photoURL || null },
          (response) => {
            if (response?.error) {
              reject(new Error(response.error))
              return
            }
            resolve(response)
          },
        )
      })

      toast.success(`Joined room ${invite.roomCode}`)
      navigate('/lobby')
    } catch (error) {
      toast.error(error?.message || 'Unable to join invite')
    } finally {
      setSocialActionKey('')
    }
  }

  const handleDeclineInvite = async (inviteId) => {
    try {
      setSocialActionKey(`invite-decline-${inviteId}`)
      await declineGameInvite(inviteId)
      toast('Invite declined')
    } catch (error) {
      toast.error(error?.message || 'Unable to decline invite')
    } finally {
      setSocialActionKey('')
    }
  }

  const handleCancelInvite = async (inviteId) => {
    try {
      setSocialActionKey(`invite-cancel-${inviteId}`)
      await cancelGameInvite(inviteId)
      toast('Invite canceled')
    } catch (error) {
      toast.error(error?.message || 'Unable to cancel invite')
    } finally {
      setSocialActionKey('')
    }
  }

  const { isLandscapeMobile } = useOrientation()

  const myPlayer = players.find((p) => p.id === playerId)
  const isReady = myPlayer?.isReady || false
  const isHost = myPlayer?.seatIndex === 0

  const seatSlots = Array.from({ length: maxPlayers }, (_, i) => i)
  const gridClass = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-2', 5: 'grid-cols-3' }[maxPlayers] || 'grid-cols-2'
  const landscapeGridClass = { 2: 'grid-cols-2', 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' }[maxPlayers] || 'grid-cols-4'
  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'offline'
    const value = typeof timestamp?.toMillis === 'function' ? timestamp.toMillis() : Number(timestamp) || 0
    if (!value) return 'offline'
    const ageMs = Date.now() - value
    if (ageMs < 60_000) return 'just now'
    if (ageMs < 3_600_000) return `${Math.max(1, Math.floor(ageMs / 60_000))}m ago`
    return `${Math.max(1, Math.floor(ageMs / 3_600_000))}h ago`
  }

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center overflow-auto"
      style={{
        background: 'radial-gradient(ellipse at center, #0e4a2e 0%, #0A3622 35%, #072818 70%, #051a10 100%)',
      }}
    >
      <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 max-w-5xl w-full px-4 sm:px-6 py-4 sm:py-8">
        {/* Main lobby panel */}
        <motion.div
          className="flex-1 glass-panel p-4 sm:p-8 flex flex-col items-center gap-4 sm:gap-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Room Code */}
          <div className="text-center">
            <p className="text-sm uppercase tracking-widest opacity-50 mb-1">
              {state.gameType === 'donkey' ? '🫏 Gadha Ladan' : '♠ Call Break'} — Room Code
            </p>
            <div className="flex items-center gap-3">
              <motion.span
                className="text-2xl sm:text-4xl font-mono font-bold tracking-[0.3em] sm:tracking-[0.4em]"
                style={{ color: 'var(--gold)' }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                {roomCode || '------'}
              </motion.span>
              <motion.button
                onClick={handleCopyCode}
                className="p-2 rounded-lg transition-colors hover:bg-white/10"
                whileTap={{ scale: 0.9 }}
              >
                {copied ? (
                  <Check size={20} style={{ color: 'var(--gold)' }} />
                ) : (
                  <Copy size={20} className="opacity-50 hover:opacity-100" />
                )}
              </motion.button>
            </div>
          </div>

          {/* Player seats grid */}
          <div className={`grid ${isLandscapeMobile ? landscapeGridClass : gridClass} ${isLandscapeMobile ? 'gap-2' : 'gap-4'} w-full ${isLandscapeMobile ? 'max-w-2xl' : 'max-w-sm'}`}>
            {seatSlots.map((idx) => {
              const player = players[idx]
              const isSelf = player?.id === playerId

              return (
                <motion.div
                  key={idx}
                  className={`rounded-xl ${isLandscapeMobile ? 'p-2' : 'p-4'} flex flex-col items-center ${isLandscapeMobile ? 'gap-1' : 'gap-2'} transition-all duration-300 ${
                    player
                      ? player.isReady
                        ? 'gold-border bg-black/30'
                        : 'border border-white/10 bg-black/20'
                      : 'border border-dashed border-white/10 bg-black/10'
                  }`}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 * idx }}
                >
                  {player ? (
                    <>
                      {/* Avatar */}
                      {player.photoURL ? (
                        <img
                          src={player.photoURL}
                          alt=""
                          className={`${isLandscapeMobile ? 'w-9 h-9' : 'w-12 h-12'} rounded-full object-cover ${
                            player.isReady ? 'ring-2 ring-[var(--gold)]' : ''
                          }`}
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          className={`${isLandscapeMobile ? 'w-9 h-9 text-base' : 'w-12 h-12 text-xl'} rounded-full flex items-center justify-center font-bold ${
                            player.isReady ? 'text-black' : 'text-white bg-white/10'
                          }`}
                          style={
                            player.isReady
                              ? {
                                  background: 'linear-gradient(135deg, var(--gold), var(--gold-light))',
                                }
                              : {}
                          }
                        >
                          {player.name?.charAt(0).toUpperCase()}
                        </div>
                      )}

                      {/* Name */}
                      <span className={`font-medium ${isLandscapeMobile ? 'text-xs' : 'text-sm'} truncate max-w-full`}>
                        {player.name}
                        {isSelf && (
                          <span className="opacity-40 ml-1">(You)</span>
                        )}
                      </span>

                      {/* Ready status */}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          player.isReady
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-white/5 text-white/40'
                        }`}
                      >
                        {player.isReady ? 'Ready' : 'Not Ready'}
                      </span>

                      {!isLandscapeMobile && (
                        <div className="flex items-center gap-2">
                          {idx === 0 && (
                            <Crown size={14} style={{ color: 'var(--gold)' }} className="opacity-50" />
                          )}
                          {isHost && !isSelf && (
                            <button
                              onClick={() => handleKickPlayer(player.id)}
                              className="p-1 rounded-full hover:bg-red-500/20 transition-colors group"
                              title={`Kick ${player.name}`}
                            >
                              <X size={14} className="text-red-400/50 group-hover:text-red-400" />
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className={`${isLandscapeMobile ? 'w-9 h-9' : 'w-12 h-12'} rounded-full border border-dashed border-white/20 flex items-center justify-center`}>
                        <span className={`text-white/20 ${isLandscapeMobile ? 'text-lg' : 'text-2xl'}`}>?</span>
                      </div>
                      <span className={`text-white/30 ${isLandscapeMobile ? 'text-xs' : 'text-sm'}`}>Waiting...</span>
                    </>
                  )}
                </motion.div>
              )
            })}
          </div>

          {/* Ready button */}
          <motion.button
            onClick={handleToggleReady}
            className={`${isLandscapeMobile ? 'px-6 py-2 text-base' : 'px-8 py-3 text-lg'} rounded-xl font-semibold transition-all duration-300 ${
              isReady ? 'text-white border-2' : 'text-black'
            }`}
            style={
              isReady
                ? {
                    borderColor: 'var(--gold)',
                    background: 'transparent',
                    color: 'var(--gold)',
                  }
                : {
                    background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
                    boxShadow: '0 4px 15px rgba(212, 175, 55, 0.3)',
                  }
            }
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            {isReady ? 'Cancel Ready' : "I'm Ready"}
          </motion.button>

          {/* Countdown */}
          <AnimatePresence>
            {countdown !== null && countdown > 0 && (
              <motion.div
                className="text-center"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
              >
                <p className="text-sm opacity-60 mb-1">Game starting in</p>
                <motion.span
                  key={countdown}
                  className={`${isLandscapeMobile ? 'text-3xl' : 'text-5xl'} font-bold`}
                  style={{ color: 'var(--gold)' }}
                  initial={{ opacity: 0, scale: 1.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3 }}
                >
                  {countdown}
                </motion.span>
              </motion.div>
            )}
          </AnimatePresence>

          {socialEnabled && (
            <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-black/25 p-3 sm:p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-xs sm:text-sm font-semibold" style={{ color: 'var(--gold)' }}>
                  Invite Friends
                </p>
                <p className="text-[11px] sm:text-xs opacity-50">{friends.length} friends</p>
              </div>

              {incomingGameInvites.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wider opacity-60">Incoming Invites</p>
                  {incomingGameInvites.map((invite) => (
                    <div key={invite.id} className="rounded-lg border border-[rgba(212,175,55,0.35)] bg-[rgba(212,175,55,0.08)] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold truncate">{invite.fromDisplayName || 'Player'} invited you</p>
                          <p className="text-[11px] opacity-55 truncate">
                            {invite.gameType === 'donkey' ? 'Gadha Ladan' : 'Call Break'} • Room {invite.roomCode}
                          </p>
                        </div>
                        <Clock3 size={14} className="opacity-45 shrink-0" />
                      </div>
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleAcceptInvite(invite.id)}
                          disabled={socialActionKey === `invite-accept-${invite.id}` || socialActionKey === `invite-decline-${invite.id}`}
                          className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold text-black disabled:opacity-50"
                          style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
                        >
                          Join
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeclineInvite(invite.id)}
                          disabled={socialActionKey === `invite-accept-${invite.id}` || socialActionKey === `invite-decline-${invite.id}`}
                          className="flex-1 px-2 py-1.5 rounded-md text-xs font-semibold bg-white/10 hover:bg-white/15 disabled:opacity-50"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {outgoingGameInvites.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wider opacity-60">Sent Invites</p>
                  {outgoingGameInvites.map((invite) => (
                    <div key={invite.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-xs truncate">
                          To: {friends.find((friend) => friend.uid === invite.toUid)?.displayName || 'Friend'}
                        </p>
                        <p className="text-[11px] opacity-55 truncate">Room {invite.roomCode}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCancelInvite(invite.id)}
                        disabled={socialActionKey === `invite-cancel-${invite.id}`}
                        className="px-2 py-1 rounded-md text-xs bg-white/10 hover:bg-white/15 disabled:opacity-50"
                      >
                        Cancel
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                {friends.length === 0 && (
                  <p className="text-xs opacity-45 text-center py-2">
                    Add friends from the home screen and invite them here.
                  </p>
                )}
                {friends.map((friend) => {
                  const inviteKey = `invite-friend-${friend.uid}`
                  const inviteDisabled = !friend.isOnline || socialActionKey === inviteKey

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
                            {friend.isOnline ? `online${friend.currentRoomCode ? ` • room ${friend.currentRoomCode}` : ''}` : `last seen ${formatLastSeen(friend.lastSeenAt)}`}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleInviteFriend(friend)}
                        disabled={inviteDisabled}
                        className="px-2 py-1.5 rounded-md text-xs font-semibold flex items-center gap-1 disabled:opacity-45"
                        style={
                          friend.isOnline
                            ? { background: 'rgba(212, 175, 55, 0.16)', color: 'var(--gold)', border: '1px solid rgba(212, 175, 55, 0.35)' }
                            : { background: 'rgba(255, 255, 255, 0.08)' }
                        }
                      >
                        <UserPlus size={12} />
                        Invite
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Player count + Voice mic */}
          <div className="flex items-center gap-3">
            <p className="text-sm opacity-40">
              {players.length}/{maxPlayers} Players
            </p>
            <VoiceChat voiceChat={voiceChat} />
          </div>

          {/* Leave room */}
          <motion.button
            onClick={handleLeaveRoom}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all"
            whileTap={{ scale: 0.95 }}
          >
            <LogOut size={14} />
            <span>Leave Room</span>
          </motion.button>
        </motion.div>

        {/* Chat panel */}
        <motion.div
          className={`glass-panel flex flex-col transition-all duration-300 ${
            showChat ? 'w-full sm:w-80' : 'w-full sm:w-12 h-12 sm:h-auto'
          }`}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          {showChat ? (
            <div className="flex flex-col h-[250px] sm:h-[500px] p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gold text-sm uppercase tracking-wider">Chat</h3>
                <button
                  onClick={() => setShowChat(false)}
                  className="opacity-40 hover:opacity-100 transition-opacity text-sm"
                >
                  Hide
                </button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto chat-scroll space-y-2 mb-3">
                {messages.length === 0 && (
                  <p className="text-center text-white/20 text-sm mt-8">No messages yet</p>
                )}
                {messages.map((msg, i) => (
                  <div key={i} className="text-sm">
                    <span style={{ color: 'var(--gold)' }} className="font-medium">
                      {msg.playerName}:
                    </span>{' '}
                    <span className="opacity-80">{msg.message}</span>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 px-3 py-2 rounded-lg bg-black/30 text-white text-sm
                    placeholder-white/30 border border-white/10 outline-none
                    focus:border-[var(--gold)] transition-colors"
                  onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                />
                <button
                  onClick={handleSendChat}
                  className="p-2 rounded-lg transition-colors hover:bg-white/10"
                  style={{ color: 'var(--gold)' }}
                >
                  <Send size={16} />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowChat(true)}
              className="h-full flex items-center justify-center hover:bg-white/5 transition-colors rounded-xl"
            >
              <MessageCircle size={20} className="opacity-40 hover:opacity-100" />
            </button>
          )}
        </motion.div>
      </div>
    </div>
  )
}
