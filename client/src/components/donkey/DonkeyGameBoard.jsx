import { useState, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import { useVoiceChatContext } from '../../context/VoiceChatContext'
import VoiceChat from '../game/VoiceChat'
import Card, { SUIT_SYMBOLS } from '../game/Card'

const PLAY_CARD_ACK_TIMEOUT_MS = 7000
const DONKEY_WORD = 'DONKEY'

const POSITION_MAPS = {
  2: ['bottom', 'top'],
  3: ['bottom', 'top-left', 'top-right'],
  4: ['bottom', 'left', 'top', 'right'],
  5: ['bottom', 'bottom-left', 'top-left', 'top', 'top-right'],
}

const POSITION_STYLES = {
  top: 'top-2 left-1/2 -translate-x-1/2',
  'top-left': 'top-2 left-4',
  'top-right': 'top-2 right-4',
  left: 'top-1/2 left-2 -translate-y-1/2',
  right: 'top-1/2 right-2 -translate-y-1/2',
  'bottom-left': 'bottom-36 sm:bottom-40 left-4',
  'bottom-right': 'bottom-36 sm:bottom-40 right-4',
}

const RANK_ORDER = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
}

const SUIT_ORDER = {
  spades: 0,
  hearts: 1,
  diamonds: 2,
  clubs: 3,
}

function sameCard(a, b) {
  if (!a || !b) return false
  return a.suit === b.suit && a.rank === b.rank
}

function formatSuit(suit) {
  if (!suit) return 'None'
  return `${SUIT_SYMBOLS[suit] || ''} ${suit}`.trim()
}

export default function DonkeyGameBoard() {
  const navigate = useNavigate()
  const { state, dispatch } = useGame()
  const { socket, isConnected, setPlayerId, setRoomCode } = useSocket()
  const voiceChat = useVoiceChatContext()
  const [playDisabled, setPlayDisabled] = useState(false)

  const {
    myHand = [],
    donkeyPlayers = [],
    donkeyRound = 0,
    donkeyTrickNumber = 1,
    donkeyLeadSuit = null,
    donkeyTrickCards = [],
    donkeyPlayableCards = [],
    donkeyLastTrickResult = null,
    activePlayers = [],
    currentTurnPlayerId,
    isMyTurn,
    donkeyTurnTimerStart,
    donkeyTurnTimerDuration = 20000,
    donkeyTurnTimerPlayerId,
    playerId,
    phase,
  } = state

  const isPlaying = phase === 'DONKEY_PLAYING'
  const myPlayer = donkeyPlayers.find((p) => p.id === playerId)
  const currentTurnPlayer = donkeyPlayers.find((p) => p.id === currentTurnPlayerId)

  useEffect(() => {
    if (isMyTurn) setPlayDisabled(false)
  }, [isMyTurn, donkeyTrickNumber])

  const myIdx = donkeyPlayers.findIndex((p) => p.id === playerId)
  const numPlayers = donkeyPlayers.length
  const posMap = POSITION_MAPS[numPlayers] || POSITION_MAPS[4]

  const reorderedPlayers = []
  for (let i = 0; i < numPlayers; i++) {
    const idx = (myIdx + i) % numPlayers
    if (idx >= 0 && donkeyPlayers[idx]) {
      reorderedPlayers.push({ ...donkeyPlayers[idx], position: posMap[i] })
    }
  }
  const opponents = reorderedPlayers.filter((p) => p.id !== playerId)

  const sortedHand = useMemo(() => {
    return [...myHand].sort((a, b) => {
      const suitDiff = (SUIT_ORDER[a.suit] ?? 99) - (SUIT_ORDER[b.suit] ?? 99)
      if (suitDiff !== 0) return suitDiff
      return (RANK_ORDER[a.rank] || 0) - (RANK_ORDER[b.rank] || 0)
    })
  }, [myHand])

  const isCardPlayable = useCallback((card) => {
    if (!isMyTurn || playDisabled) return false
    return donkeyPlayableCards.some((allowed) => sameCard(allowed, card))
  }, [isMyTurn, playDisabled, donkeyPlayableCards])

  const handlePlayCard = useCallback((card) => {
    if (!socket || !isCardPlayable(card)) return
    if (!isConnected || !socket.connected) {
      toast.error('Network reconnecting. Please wait a moment.')
      return
    }

    setPlayDisabled(true)
    socket
      .timeout(PLAY_CARD_ACK_TIMEOUT_MS)
      .emit('donkey-play-card', { card }, (err, response) => {
        if (err) {
          setPlayDisabled(false)
          toast.error('Play timed out. Check internet and try again.')
          return
        }

        if (response?.success === false) {
          setPlayDisabled(false)
          toast.error(response.error || 'Unable to play this card.')
        }
      })
  }, [socket, isConnected, isCardPlayable])

  const handleLeaveRoom = useCallback(() => {
    if (socket) socket.emit('leave-room')
    dispatch({ type: 'RESET' })
    setPlayerId(null)
    setRoomCode(null)
    navigate('/')
  }, [socket, dispatch, setPlayerId, setRoomCode, navigate])

  const trickCardsWithNames = donkeyTrickCards.map((entry) => {
    const playerName = entry.playerName
      || donkeyPlayers.find((p) => p.id === entry.playerId)?.name
      || 'Player'
    return { ...entry, playerName }
  })

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

        <div className="text-center leading-tight">
          <span className="text-xs sm:text-sm font-medium opacity-80">
            🫏 Gadha Ladan
          </span>
          <div className="text-[10px] sm:text-xs opacity-60">
            Round {donkeyRound} • Trick {donkeyTrickNumber}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] sm:text-xs opacity-60">
            Lead: {formatSuit(donkeyLeadSuit)}
          </div>
          <div className="text-[10px] sm:text-xs opacity-50">
            {activePlayers.length} active
          </div>
        </div>
      </div>

      {/* Game area */}
      <div className="flex-1 relative">
        {opponents.map((player) => (
          <div key={player.id} className={`absolute ${POSITION_STYLES[player.position] || ''}`}>
            <DonkeyStation
              player={player}
              isActive={activePlayers.includes(player.id)}
              isCurrentTurn={currentTurnPlayerId === player.id}
              timerPlayerId={donkeyTurnTimerPlayerId}
              timerStart={donkeyTurnTimerStart}
              timerDuration={donkeyTurnTimerDuration}
            />
          </div>
        ))}

        {/* Center trick table */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center w-[92vw] max-w-md">
          <AnimatePresence mode="wait">
            {isPlaying && (
              <motion.div
                key={`trick-${donkeyTrickNumber}`}
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="rounded-xl px-3 py-2 border border-white/10 bg-black/25 backdrop-blur-sm"
              >
                <div className="text-xs opacity-70 mb-2">
                  {isMyTurn
                    ? 'Your turn - play a valid card'
                    : currentTurnPlayer
                      ? `${currentTurnPlayer.name}'s turn`
                      : 'Resolving trick...'}
                </div>

                {donkeyLeadSuit && isMyTurn && (
                  <div className="text-[11px] text-blue-300 mb-2">
                    Follow suit: {formatSuit(donkeyLeadSuit)}
                  </div>
                )}

                <div className="flex items-end justify-center gap-2 flex-wrap min-h-[72px]">
                  {trickCardsWithNames.length === 0 ? (
                    <div className="text-xs opacity-40 py-3">No cards played yet</div>
                  ) : (
                    trickCardsWithNames.map((entry, idx) => (
                      <motion.div
                        key={`${entry.playerId}-${entry.card?.suit}-${entry.card?.rank}-${idx}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center"
                      >
                        <Card suit={entry.card?.suit} rank={entry.card?.rank} faceUp small />
                        <span className="text-[10px] opacity-70 mt-1 max-w-[54px] truncate">
                          {entry.playerName}
                        </span>
                      </motion.div>
                    ))
                  )}
                </div>

                {donkeyLastTrickResult && (
                  <div className="mt-2 text-[11px] opacity-80">
                    {donkeyLastTrickResult.wasHit
                      ? `${donkeyLastTrickResult.collectorName} collected ${donkeyLastTrickResult.collectedCount} cards`
                      : `${donkeyLastTrickResult.highestPlayerName} won the lead`}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bottom hand area */}
      <div className="relative z-10 pb-3 px-3">
        <div className="flex items-center justify-center gap-3 mb-2">
          {myHand.length === 0 && myPlayer?.isActive === false ? (
            <span className="text-xs text-green-400 font-semibold">✓ Safe</span>
          ) : (
            <span className="text-xs opacity-60">Cards in hand: {myHand.length}</span>
          )}
          {isMyTurn && (
            <span className="text-xs font-semibold" style={{ color: 'var(--gold)' }}>
              YOUR TURN
            </span>
          )}
        </div>

        <div className="flex justify-center gap-1 sm:gap-1.5 flex-wrap">
          {sortedHand.map((card, i) => {
            const playable = isCardPlayable(card)
            return (
              <motion.div
                key={`${card.rank}-${card.suit}-${i}`}
                layout
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              >
                <Card
                  suit={card.suit}
                  rank={card.rank}
                  faceUp
                  playable={playable}
                  onClick={() => handlePlayCard(card)}
                  small={myHand.length > 10}
                />
              </motion.div>
            )
          })}
          {myHand.length === 0 && (
            <div className="text-sm opacity-30 py-4">No cards remaining</div>
          )}
        </div>
      </div>
    </div>
  )
}

function DonkeyStation({ player, isActive, isCurrentTurn, timerPlayerId, timerStart, timerDuration }) {
  const [timerProgress, setTimerProgress] = useState(1)

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
            : isActive
              ? 'bg-white/5 border border-white/10'
              : 'bg-black/20 border border-white/5 opacity-50'
      }`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
    >
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

        {isCurrentTurn && (
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke={timerProgress < 0.25 ? '#ef4444' : 'rgba(212,175,55,0.6)'}
              strokeWidth="2"
              strokeDasharray={`${timerProgress * 100} 100`}
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      <span className="text-[10px] sm:text-xs font-medium truncate max-w-[70px] sm:max-w-[90px]">
        {player.name}
      </span>

      {isSafe ? (
        <span className="text-[9px] text-green-400 font-semibold">Safe ✓</span>
      ) : (
        <span className="text-[9px] opacity-40">
          {player.cardCount || 0} cards
        </span>
      )}

      {isCurrentTurn && (
        <span className="text-[9px] font-semibold flex items-center gap-0.5" style={{ color: 'var(--gold)' }}>
          <Clock size={10} />
          Playing...
        </span>
      )}
    </motion.div>
  )
}

// Legacy export kept for old DonkeyRoundResult component compatibility.
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
