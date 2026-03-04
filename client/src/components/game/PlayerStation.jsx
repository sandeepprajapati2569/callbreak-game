import { motion } from 'framer-motion'
import { Wifi, WifiOff } from 'lucide-react'
import { useGame } from '../../context/GameContext'

export default function PlayerStation({ player, position, isCurrentTurn, isSelf }) {
  const { state } = useGame()
  const { bids, tricksWon } = state

  if (!player) return null

  const bid = bids[player.id]
  const won = tricksWon[player.id] ?? 0
  const isDisconnected = player.isConnected === false
  const cardCount = player.cardCount ?? 0
  const initial = player.name?.charAt(0).toUpperCase() || '?'

  // Layout orientation based on position - all positions use vertical layout
  const isVertical = true

  return (
    <motion.div
      className={`flex items-center gap-1.5 sm:gap-3 glass-panel px-2 py-2 sm:px-4 sm:py-3 relative
        ${isCurrentTurn ? 'active-glow' : ''}
        ${isDisconnected ? 'opacity-40' : ''}
        ${isVertical ? 'flex-col min-w-[80px] sm:min-w-[120px]' : 'flex-col min-w-[70px] sm:min-w-[100px]'}
      `}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: isDisconnected ? 0.4 : 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    >
      {/* Avatar */}
      <div
        className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm sm:text-lg font-bold flex-shrink-0 ${
          isCurrentTurn ? 'text-black' : 'bg-white/10 text-white'
        }`}
        style={
          isCurrentTurn
            ? { background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }
            : {}
        }
      >
        {initial}
      </div>

      {/* Info */}
      <div className="flex flex-col items-center gap-1">
        <span className="text-xs sm:text-sm font-medium truncate max-w-[70px] sm:max-w-[100px]">
          {player.name}
          {isSelf && <span className="text-[10px] sm:text-xs opacity-40 ml-1">(You)</span>}
        </span>

        {/* Bid & Won badges */}
        <div className="flex items-center gap-2">
          {bid !== undefined && (
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: 'rgba(212, 175, 55, 0.15)',
                color: 'var(--gold)',
                border: '1px solid rgba(212, 175, 55, 0.3)',
              }}
            >
              Bid: {bid}
            </span>
          )}
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              color: 'rgba(255, 255, 255, 0.6)',
            }}
          >
            Won: {won}
          </span>
        </div>
      </div>

      {/* Opponent card backs (not shown for self) */}
      {!isSelf && cardCount > 0 && (
        <div className="flex items-center mt-1">
          {/* Just show a small stack indicator */}
          <div className="relative w-8 h-5">
            {[...Array(Math.min(cardCount, 3))].map((_, i) => (
              <div
                key={i}
                className="card-back absolute w-5 h-7"
                style={{
                  left: `${i * 3}px`,
                  top: `${-i * 1}px`,
                  zIndex: i,
                }}
              />
            ))}
          </div>
          <span className="text-xs opacity-40 ml-2">{cardCount}</span>
        </div>
      )}

      {/* Disconnected label */}
      {isDisconnected && (
        <div className="flex items-center gap-1 text-xs text-red-400 mt-1">
          <WifiOff size={10} />
          <span>Disconnected</span>
        </div>
      )}

      {/* Turn indicator */}
      {isCurrentTurn && (
        <>
          <motion.div
            className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full"
            style={{ background: 'var(--gold)', boxShadow: '0 0 8px rgba(212, 175, 55, 0.8)' }}
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          <motion.div
            className="text-xs font-bold mt-1 px-2 py-0.5 rounded-full"
            style={{
              background: 'linear-gradient(135deg, var(--gold), var(--gold-light))',
              color: '#000',
            }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            {isSelf ? 'YOUR TURN' : 'PLAYING'}
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
