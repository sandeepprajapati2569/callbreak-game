import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut, Clock } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import { useVoiceChatContext } from '../../context/VoiceChatContext'
import VoiceChat from '../game/VoiceChat'
import Card from '../game/Card'

const DONKEY_WORD = 'DONKEY'

// Suit symbol for card display
const SUIT_SYMBOLS = { spades: '♠', hearts: '♥', diamonds: '♦', clubs: '♣' }
const SUIT_COLORS = { spades: '#1a1a2e', hearts: '#DC2626', diamonds: '#DC2626', clubs: '#1a1a2e' }

// Position maps for player stations (same as GameBoard)
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
  const { socket, setPlayerId, setRoomCode } = useSocket()
  const voiceChat = useVoiceChatContext()
  const [selectedCard, setSelectedCard] = useState(null)

  const {
    myHand = [],
    donkeyPlayers = [],
    donkeyRound = 0,
    activePlayers = [],
    safeOrder = [],
    selectedCount = 0,
    totalActive = 0,
    playerId,
    phase,
  } = state

  const myPlayer = donkeyPlayers.find((p) => p.id === playerId)
  const isActive = activePlayers.includes(playerId)
  const isPassing = phase === 'DONKEY_PASSING'

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

  const handleSelectCard = (card) => {
    if (!isPassing || !isActive) return
    setSelectedCard(card)
  }

  const handleConfirmPass = useCallback(() => {
    if (!selectedCard || !socket) return
    socket.emit('donkey-select-card', { card: selectedCard })
    setSelectedCard(null)
  }, [selectedCard, socket])

  const handleLeaveRoom = useCallback(() => {
    if (socket) socket.emit('leave-room')
    dispatch({ type: 'RESET' })
    setPlayerId(null)
    setRoomCode(null)
    navigate('/')
  }, [socket, dispatch, setPlayerId, setRoomCode, navigate])

  return (
    <div className="fixed inset-0 flex flex-col"
      style={{ background: 'radial-gradient(ellipse at center, #0e4a2e 0%, #0A3622 35%, #072818 70%, #051a10 100%)' }}
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
            🫏 Donkey — Round {donkeyRound}
          </span>
        </div>

        <div className="text-xs opacity-50">
          {selectedCount}/{totalActive} selected
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
              isSafe={player.isSafe}
              isSelf={false}
            />
          </div>
        ))}

        {/* Center area - game status */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          <AnimatePresence mode="wait">
            {isPassing && isActive && (
              <motion.div
                key="passing"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                className="flex flex-col items-center gap-2"
              >
                <div className="text-sm sm:text-base font-medium opacity-80">
                  Select a card to pass ←
                </div>
                <div className="flex items-center gap-1 text-xs opacity-50">
                  <Clock size={12} />
                  <span>15s per turn</span>
                </div>
              </motion.div>
            )}
            {isPassing && !isActive && myPlayer?.isSafe && (
              <motion.div
                key="safe"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-green-400 font-bold text-lg"
              >
                ✓ You're safe!
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* My station + hand at bottom */}
      <div className="relative z-10 pb-3 px-3">
        {/* My letters */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <DonkeyLetters letters={myPlayer?.letters || ''} small />
          {myPlayer?.isSafe && (
            <span className="text-xs text-green-400 font-semibold">✓ Safe</span>
          )}
        </div>

        {/* My cards */}
        <div className="flex justify-center gap-1.5 sm:gap-2 mb-2">
          {myHand.map((card, i) => (
            <motion.div
              key={`${card.rank}-${card.suit}`}
              className={`cursor-pointer transition-all ${
                selectedCard?.rank === card.rank && selectedCard?.suit === card.suit
                  ? 'ring-2 ring-yellow-400 -translate-y-3 scale-105'
                  : isPassing && isActive
                    ? 'hover:-translate-y-2'
                    : 'opacity-60'
              }`}
              onClick={() => handleSelectCard(card)}
              whileHover={isPassing && isActive ? { y: -8 } : {}}
              whileTap={isPassing && isActive ? { scale: 0.95 } : {}}
              layout
            >
              <Card suit={card.suit} rank={card.rank} faceUp />
            </motion.div>
          ))}
        </div>

        {/* Confirm pass button */}
        <AnimatePresence>
          {selectedCard && isPassing && isActive && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              onClick={handleConfirmPass}
              className="w-full py-2.5 rounded-xl font-semibold text-black text-sm"
              style={{
                background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
              }}
              whileTap={{ scale: 0.98 }}
            >
              Pass {selectedCard.rank}{SUIT_SYMBOLS[selectedCard.suit]} to the left →
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function DonkeyStation({ player, isActive, isSafe, isSelf }) {
  return (
    <motion.div
      className={`flex flex-col items-center gap-1 p-2 sm:p-3 rounded-xl transition-all ${
        isSafe
          ? 'bg-green-500/10 border border-green-500/30'
          : isActive
            ? 'bg-white/5 border border-white/10'
            : 'bg-black/20 border border-white/5 opacity-50'
      }`}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-bold ${
          isSafe
            ? 'bg-green-500/30 text-green-300'
            : 'bg-white/10 text-white/80'
        }`}
      >
        {isSafe ? '✓' : player.name?.[0]?.toUpperCase()}
      </div>

      {/* Name */}
      <span className="text-[10px] sm:text-xs font-medium truncate max-w-[70px] sm:max-w-[90px]">
        {player.name}
      </span>

      {/* Letters */}
      <DonkeyLetters letters={player.letters || ''} small />

      {/* Card count */}
      {!isSafe && (
        <span className="text-[9px] opacity-40">
          {player.cardCount || 4} cards
        </span>
      )}

      {/* Selected indicator */}
      {isActive && player.hasSelected && (
        <span className="text-[9px] text-yellow-400">✓ Selected</span>
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
