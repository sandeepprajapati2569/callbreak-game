import { useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import { useVoiceChatContext } from '../../context/VoiceChatContext'
import VoiceChat from '../game/VoiceChat'
import Card from '../game/Card'

const DONKEY_WORD = 'DONKEY'
const PICK_CARD_ACK_TIMEOUT_MS = 7000

// Position maps for player stations (same as CallBreak GameBoard)
const POSITION_MAPS = {
  2: ['bottom', 'top'],
  3: ['bottom', 'top-left', 'top-right'],
  4: ['bottom', 'left', 'top', 'right'],
  5: ['bottom', 'bottom-left', 'top-left', 'top', 'top-right'],
}

const POSITION_STYLES = {
  'top': 'top-2 left-1/2 -translate-x-1/2',
  'top-left': 'top-2 left-4',
  'top-right': 'top-2 right-4',
  'left': 'top-1/2 left-2 -translate-y-1/2',
  'right': 'top-1/2 right-2 -translate-y-1/2',
  'bottom-left': 'bottom-36 sm:bottom-40 left-4',
  'bottom-right': 'bottom-36 sm:bottom-40 right-4',
}

export default function DonkeyGameBoard() {
  const navigate = useNavigate()
  const { state, dispatch } = useGame()
  const { socket, isConnected, setPlayerId, setRoomCode } = useSocket()
  const voiceChat = useVoiceChatContext()
  const [pickingDisabled, setPickingDisabled] = useState(false)

  const {
    myHand = [],
    donkeyPlayers = [],
    donkeyRound = 0,
    activePlayers = [],
    currentTurnPlayerId,
    isMyTurn,
    rightNeighborId,
    rightNeighborCardCount = 0,
    donkeyTurnTimerStart,
    donkeyTurnTimerDuration = 20000,
    donkeyTurnTimerPlayerId,
    playerId,
    phase,
  } = state

  const myPlayer = donkeyPlayers.find((p) => p.id === playerId)
  const isPlaying = phase === 'DONKEY_PLAYING'
  const rightNeighbor = donkeyPlayers.find((p) => p.id === rightNeighborId)
  const currentTurnPlayer = donkeyPlayers.find((p) => p.id === currentTurnPlayerId)

  // Re-enable picking when it becomes my turn
  useEffect(() => {
    if (isMyTurn) setPickingDisabled(false)
  }, [isMyTurn])

  // Reorder players so current player is at "bottom"
  const myIdx = donkeyPlayers.findIndex((p) => p.id === playerId)
  const numPlayers = donkeyPlayers.length
  const posMap = POSITION_MAPS[numPlayers] || POSITION_MAPS[4]

  const reorderedPlayers = []
  for (let i = 0; i < numPlayers; i++) {
    const idx = (myIdx + i) % numPlayers
    reorderedPlayers.push({ ...donkeyPlayers[idx], position: posMap[i] })
  }

  const opponents = reorderedPlayers.filter((p) => p.id !== playerId)

  // Sort hand by rank for readability
  const RANK_ORDER = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 }
  const sortedHand = [...myHand].sort((a, b) => {
    const rDiff = (RANK_ORDER[a.rank] || 0) - (RANK_ORDER[b.rank] || 0)
    if (rDiff !== 0) return rDiff
    return (a.suit || '').localeCompare(b.suit || '')
  })

  const handlePickCard = useCallback((cardIndex) => {
    if (!isMyTurn || !socket || pickingDisabled) return
    if (!isConnected || !socket.connected) {
      toast.error('Network reconnecting. Please wait a moment.')
      return
    }

    setPickingDisabled(true)
    socket.timeout(PICK_CARD_ACK_TIMEOUT_MS).emit('donkey-pick-card', { cardIndex }, (err, response) => {
      if (err) {
        setPickingDisabled(false)
        toast.error('Pick timed out. Check internet and try again.')
        return
      }

      if (response?.success === false) {
        setPickingDisabled(false)
        toast.error(response.error || 'Unable to pick card.')
      }
    })
  }, [isMyTurn, socket, pickingDisabled, isConnected])

  const handleLeaveRoom = useCallback(() => {
    if (socket) socket.emit('leave-room')
    dispatch({ type: 'RESET' })
    setPlayerId(null)
    setRoomCode(null)
    navigate('/')
  }, [socket, dispatch, setPlayerId, setRoomCode, navigate])

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        background: 'radial-gradient(ellipse at center, #0e4a2e 0%, #0A3622 35%, #072818 70%, #051a10 100%)',
      }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 z-20">
        <div className="flex items-center gap-2">
          <motion.button
            onClick={handleLeaveRoom}
            className="p-1.5 sm:p-2 rounded-full bg-red-500/20 text-red-400"
            whileTap={{ scale: 0.85 }}
            title="Leave Room"
          >
            <LogOut size={14} />
          </motion.button>
          <VoiceChat voiceChat={voiceChat} />
        </div>

        <div className="text-center">
          <span className="text-xs sm:text-sm font-medium opacity-70">
            🫏 Gadha Ladan — Round {donkeyRound}
          </span>
        </div>

        <div className="text-xs opacity-50">
          {activePlayers.length} active
        </div>
      </div>

      {/* Game area */}
      <div className="flex-1 relative">
        {/* Opponent stations */}
        {opponents.map((player) => (
          <div
            key={player.id}
            className={`absolute ${POSITION_STYLES[player.position] || ''}`}
          >
            <DonkeyStation
              player={player}
              isActive={activePlayers.includes(player.id)}
              isCurrentTurn={currentTurnPlayerId === player.id}
              isRightNeighbor={isMyTurn && rightNeighborId === player.id}
              timerPlayerId={donkeyTurnTimerPlayerId}
              timerStart={donkeyTurnTimerStart}
              timerDuration={donkeyTurnTimerDuration}
            />
          </div>
        ))}

        {/* Center area */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center max-w-xs">
          <AnimatePresence mode="wait">
            {/* Show picking UI when it's my turn */}
            {isPlaying && isMyTurn && rightNeighbor && (
              <motion.div
                key="my-turn-pick"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center gap-3"
              >
                <div className="text-sm sm:text-base font-medium" style={{ color: 'var(--gold)' }}>
                  Pick a card from {rightNeighbor.name}
                </div>
                <div className="flex gap-1 flex-wrap justify-center">
                  {Array.from({ length: rightNeighborCardCount }).map((_, i) => (
                    <motion.div
                      key={i}
                      onClick={() => handlePickCard(i)}
                      whileHover={{ y: -8, scale: 1.05 }}
                      whileTap={{ scale: 0.9 }}
                      className={`cursor-pointer ${pickingDisabled ? 'pointer-events-none opacity-50' : ''}`}
                    >
                      <Card faceUp={false} small />
                    </motion.div>
                  ))}
                </div>
                <div className="flex items-center gap-1 text-xs opacity-50">
                  <Clock size={12} />
                  <span>20s to pick</span>
                </div>
              </motion.div>
            )}

            {/* Someone else's turn */}
            {isPlaying && !isMyTurn && currentTurnPlayer && (
              <motion.div
                key="waiting-turn"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center gap-2"
              >
                <div className="text-sm opacity-60">
                  {currentTurnPlayer.name}'s turn to pick
                </div>
              </motion.div>
            )}

            {/* Player is safe (emptied hand) */}
            {isPlaying && myHand.length === 0 && !isMyTurn && (
              <motion.div
                key="safe"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-green-400 font-bold text-lg"
              >
                ✓ You're out! Hand empty.
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* My station + hand at bottom */}
      <div className="relative z-10 pb-3 px-3">
        {/* My info row */}
        <div className="flex items-center justify-center gap-3 mb-2">
          <DonkeyLetters letters={myPlayer?.letters || ''} small />
          {myHand.length === 0 && myPlayer?.isActive === false ? (
            <span className="text-xs text-green-400 font-semibold">✓ Safe</span>
          ) : (
            <span className="text-xs opacity-40">{myHand.length} cards</span>
          )}
          {isMyTurn && (
            <span className="text-xs font-semibold" style={{ color: 'var(--gold)' }}>YOUR TURN</span>
          )}
        </div>

        {/* My cards */}
        <div className="flex justify-center gap-1 sm:gap-1.5 flex-wrap">
          {sortedHand.map((card, i) => (
            <motion.div
              key={`${card.rank}-${card.suit}-${i}`}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              <Card suit={card.suit} rank={card.rank} faceUp small={myHand.length > 10} />
            </motion.div>
          ))}
          {myHand.length === 0 && (
            <div className="text-sm opacity-30 py-4">No cards remaining</div>
          )}
        </div>
      </div>
    </div>
  )
}

function DonkeyStation({ player, isActive, isCurrentTurn, isRightNeighbor, timerPlayerId, timerStart, timerDuration }) {
  const [timerProgress, setTimerProgress] = useState(1)

  // Turn timer animation
  useEffect(() => {
    if (timerPlayerId !== player.id || !timerStart) {
      setTimerProgress(1)
      return
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - timerStart
      const remaining = Math.max(0, 1 - elapsed / timerDuration)
      setTimerProgress(remaining)
      if (remaining <= 0) clearInterval(interval)
    }, 100)

    return () => clearInterval(interval)
  }, [timerPlayerId, timerStart, timerDuration, player.id])

  const isSafe = !isActive && player.cardCount === 0

  return (
    <motion.div
      className={`flex flex-col items-center gap-1 p-2 sm:p-3 rounded-xl transition-all ${
        isCurrentTurn
          ? 'bg-yellow-500/10 border-2 border-yellow-500/40 shadow-[0_0_15px_rgba(212,175,55,0.2)]'
          : isSafe
            ? 'bg-green-500/10 border border-green-500/30'
            : isRightNeighbor
              ? 'bg-blue-500/10 border border-blue-400/30'
              : isActive
                ? 'bg-white/5 border border-white/10'
                : 'bg-black/20 border border-white/5 opacity-50'
      }`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {/* Avatar with timer ring */}
      <div className="relative">
        <div
          className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-bold ${
            isSafe
              ? 'bg-green-500/30 text-green-300'
              : isCurrentTurn
                ? 'text-black'
                : 'bg-white/10 text-white/80'
          }`}
          style={isCurrentTurn ? { background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' } : {}}
        >
          {isSafe ? '✓' : player.name?.[0]?.toUpperCase()}
        </div>

        {/* Timer ring */}
        {isCurrentTurn && (
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18" cy="18" r="16"
              fill="none"
              stroke={timerProgress < 0.25 ? '#ef4444' : 'rgba(212,175,55,0.6)'}
              strokeWidth="2"
              strokeDasharray={`${timerProgress * 100} 100`}
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      {/* Name */}
      <span className="text-[10px] sm:text-xs font-medium truncate max-w-[70px] sm:max-w-[90px]">
        {player.name}
      </span>

      {/* Letters */}
      <DonkeyLetters letters={player.letters || ''} small />

      {/* Status indicators */}
      {isSafe ? (
        <span className="text-[9px] text-green-400 font-semibold">Safe ✓</span>
      ) : (
        <span className="text-[9px] opacity-40">
          {player.cardCount || 0} cards
        </span>
      )}

      {isCurrentTurn && (
        <span className="text-[9px] font-semibold" style={{ color: 'var(--gold)' }}>PICKING...</span>
      )}

      {isRightNeighbor && (
        <span className="text-[9px] text-blue-400 font-semibold">← Pick from me</span>
      )}
    </motion.div>
  )
}

function DonkeyLetters({ letters = '', small = false }) {
  return (
    <div className={`flex gap-0.5 ${small ? '' : 'gap-1'}`}>
      {DONKEY_WORD.split('').map((letter, i) => {
        const earned = i < letters.length
        return (
          <span
            key={i}
            className={`${small ? 'w-4 h-4 text-[8px]' : 'w-5 h-5 text-[10px]'} rounded flex items-center justify-center font-bold transition-all ${
              earned
                ? 'bg-red-500/30 text-red-400 border border-red-500/40'
                : 'bg-white/5 text-white/20 border border-white/5'
            }`}
          >
            {letter}
          </span>
        )
      })}
    </div>
  )
}

export { DonkeyLetters }
