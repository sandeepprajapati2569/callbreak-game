import { useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useGame } from '../../context/GameContext'
import { useVoiceChat } from '../../hooks/useVoiceChat'
import PlayerHand from './PlayerHand'
import PlayerStation from './PlayerStation'
import TrickArea from './TrickArea'
import ScoreBoard from './ScoreBoard'
import VoiceChat from './VoiceChat'

const POSITION_MAPS = {
  2: ['bottom', 'top'],
  3: ['bottom', 'top-left', 'top-right'],
  4: ['bottom', 'left', 'top', 'right'],
  5: ['bottom', 'bottom-left', 'top-left', 'top', 'top-right'],
}

const POSITION_STYLES = {
  'top': 'absolute top-10 sm:top-16 left-1/2 -translate-x-1/2 z-10',
  'left': 'absolute left-1 sm:left-4 top-1/2 -translate-y-1/2 z-10',
  'right': 'absolute right-1 sm:right-4 top-1/2 -translate-y-1/2 z-10',
  'top-left': 'absolute top-10 sm:top-16 left-[12%] sm:left-[18%] z-10',
  'top-right': 'absolute top-10 sm:top-16 right-[12%] sm:right-[18%] z-10',
  'bottom-left': 'absolute bottom-28 sm:bottom-32 left-[12%] sm:left-[18%] z-10',
  'bottom-right': 'absolute bottom-28 sm:bottom-32 right-[12%] sm:right-[18%] z-10',
}

export default function GameBoard() {
  const { state } = useGame()
  const { players, playerId, currentTurn, currentRound, currentTrick, bids, phase } = state

  const voiceChat = useVoiceChat()
  const { speakingPeers, isSelfSpeaking } = voiceChat

  // Find current player's seat index
  const mySeatIndex = useMemo(() => {
    return players.findIndex((p) => p.id === playerId)
  }, [players, playerId])

  // Get relative positions dynamically based on player count
  const positionedPlayers = useMemo(() => {
    if (mySeatIndex === -1 || players.length === 0) return []
    const numPlayers = players.length
    const positions = POSITION_MAPS[numPlayers] || POSITION_MAPS[4]
    return players.map((player, seatIndex) => {
      const relativePos = (seatIndex - mySeatIndex + numPlayers) % numPlayers
      return {
        ...player,
        position: positions[relativePos],
        seatIndex,
        relativeIndex: relativePos,
      }
    })
  }, [players, mySeatIndex])

  const bottomPlayer = positionedPlayers.find((p) => p.position === 'bottom')
  const opponents = positionedPlayers.filter((p) => p.position !== 'bottom')

  return (
    <div className="w-full h-full felt-bg relative flex items-center justify-center overflow-hidden">
      {/* Trump indicator - top left */}
      <div className="absolute top-2 left-2 sm:top-4 sm:left-4 z-20 glass-panel px-2 py-1 sm:px-3 sm:py-2 flex items-center gap-1.5">
        <span className="text-lg sm:text-2xl" style={{ color: 'var(--gold)' }}>
          {'\u2660'}
        </span>
        <span className="text-[10px] sm:text-xs uppercase tracking-wider opacity-60">Trump</span>
      </div>

      {/* Round / Trick counter */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 glass-panel px-3 py-1 sm:px-4 sm:py-2 text-center">
        <span className="text-[10px] sm:text-xs uppercase tracking-wider opacity-50">Round </span>
        <span className="text-gold font-bold text-xs sm:text-sm">{currentRound || 1}</span>
        <span className="text-[10px] sm:text-xs uppercase tracking-wider opacity-50 ml-2 sm:ml-3">Trick </span>
        <span className="text-gold font-bold text-xs sm:text-sm">{(currentTrick || 0) + 1}</span>
      </div>

      {/* ScoreBoard + VoiceChat - top right */}
      <div className="absolute top-2 right-2 sm:top-4 sm:right-4 z-20 flex flex-col items-end gap-2">
        <ScoreBoard />
        <VoiceChat voiceChat={voiceChat} />
      </div>

      {/* Opponent player stations - rendered dynamically */}
      {opponents.map((player) => (
        <div key={player.id} className={POSITION_STYLES[player.position]}>
          <PlayerStation
            player={player}
            position={player.position}
            isCurrentTurn={currentTurn === player.id}
            isSelf={false}
            isSpeaking={speakingPeers.has(player.id)}
          />
        </div>
      ))}

      {/* Turn indicator banner */}
      {phase === 'PLAYING' && currentTurn && (
        <div className="absolute left-1/2 -translate-x-1/2 z-20" style={{ top: 'calc(50% - 90px)' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTurn}
              className="px-3 py-1 sm:px-4 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium whitespace-nowrap"
              style={{
                background: currentTurn === playerId
                  ? 'linear-gradient(135deg, var(--gold), var(--gold-light))'
                  : 'rgba(7, 40, 24, 0.9)',
                color: currentTurn === playerId ? '#000' : 'var(--gold)',
                border: '1px solid rgba(212, 175, 55, 0.5)',
                boxShadow: currentTurn === playerId
                  ? '0 0 20px rgba(212, 175, 55, 0.4)'
                  : '0 0 10px rgba(212, 175, 55, 0.15)',
              }}
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ duration: 0.25 }}
            >
              {currentTurn === playerId
                ? "Your Turn!"
                : `${players.find(p => p.id === currentTurn)?.name || 'Player'}'s Turn`}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      {/* Trick area - center */}
      <div className="z-10">
        <TrickArea positionedPlayers={positionedPlayers} />
      </div>

      {/* Bottom player station (current user info, above hand) */}
      {bottomPlayer && (
        <div className="absolute bottom-28 sm:bottom-32 left-1/2 -translate-x-1/2 z-10">
          <PlayerStation
            player={bottomPlayer}
            position="bottom"
            isCurrentTurn={currentTurn === bottomPlayer.id}
            isSelf={true}
            isSpeaking={isSelfSpeaking}
          />
        </div>
      )}

      {/* Player hand - bottom with safe area */}
      <div className="absolute bottom-0 left-0 right-0 z-20" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <PlayerHand />
      </div>
    </div>
  )
}
