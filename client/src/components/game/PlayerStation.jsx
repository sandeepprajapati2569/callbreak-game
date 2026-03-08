import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { WifiOff, Mic } from 'lucide-react'
import { useGame } from '../../context/GameContext'

export default function PlayerStation({ player, position, isCurrentTurn, isSelf, isSpeaking = false, compact = false }) {
  const { state } = useGame()
  const { bids, tricksWon, turnTimerStart, turnTimerDuration, turnTimerPlayerId } = state

  if (!player) return null

  const bid = bids[player.id]
  const won = tricksWon[player.id] ?? 0
  const isDisconnected = player.isConnected === false
  const cardCount = player.cardCount ?? 0
  const initial = player.name?.charAt(0).toUpperCase() || '?'

  // Turn timer countdown
  const isTimerActive = isCurrentTurn && turnTimerPlayerId === player.id && turnTimerStart
  const [timerProgress, setTimerProgress] = useState(1)

  useEffect(() => {
    if (!isTimerActive) {
      setTimerProgress(1)
      return
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - turnTimerStart
      const remaining = Math.max(0, 1 - elapsed / turnTimerDuration)
      setTimerProgress(remaining)
      if (remaining <= 0) clearInterval(interval)
    }, 100)

    return () => clearInterval(interval)
  }, [isTimerActive, turnTimerStart, turnTimerDuration])

  const timerSeconds = isTimerActive ? Math.ceil(timerProgress * turnTimerDuration / 1000) : 0
  const timerUrgent = timerSeconds <= 10 && isTimerActive

  const avatarSize = compact ? 'w-6 h-6' : 'w-8 h-8 sm:w-10 sm:h-10'
  const avatarTextSize = compact ? 'text-xs' : 'text-sm sm:text-lg'

  return (
    <motion.div
      className={`flex items-center glass-panel relative
        ${isCurrentTurn ? 'active-glow' : ''}
        ${isDisconnected ? 'opacity-40' : ''}
        ${compact
          ? 'flex-row gap-1.5 px-2 py-1 min-w-0'
          : 'flex-col gap-1.5 sm:gap-3 px-2 py-2 sm:px-4 sm:py-3 min-w-[80px] sm:min-w-[120px]'
        }
      `}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: isDisconnected ? 0.4 : 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    >
      {/* Avatar with timer ring */}
      <div className="relative flex-shrink-0">
        {/* Speaking glow ring */}
        {isSpeaking && (
          <motion.div
            className="absolute -inset-1.5 rounded-full"
            style={{
              background: 'transparent',
              boxShadow: '0 0 12px 3px rgba(34, 197, 94, 0.5), 0 0 4px 1px rgba(34, 197, 94, 0.3)',
            }}
            animate={{ opacity: [0.6, 1, 0.6] }}
            transition={{ duration: 0.8, repeat: Infinity }}
          />
        )}

        {/* Timer SVG ring */}
        {isTimerActive && (
          <svg
            className="absolute -inset-1.5 w-[calc(100%+12px)] h-[calc(100%+12px)]"
            viewBox="0 0 44 44"
          >
            <circle
              cx="22" cy="22" r="20"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="2"
            />
            <circle
              cx="22" cy="22" r="20"
              fill="none"
              stroke={timerUrgent ? '#ef4444' : 'var(--gold)'}
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 20}`}
              strokeDashoffset={`${2 * Math.PI * 20 * (1 - timerProgress)}`}
              transform="rotate(-90 22 22)"
              style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.3s ease' }}
            />
          </svg>
        )}

        {/* Avatar */}
        {player.photoURL ? (
          <img
            src={player.photoURL}
            alt=""
            className={`${avatarSize} rounded-full object-cover flex-shrink-0 relative z-[1] ${
              isCurrentTurn ? 'ring-2 ring-[var(--gold)]' : ''
            }`}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className={`${avatarSize} rounded-full flex items-center justify-center ${avatarTextSize} font-bold flex-shrink-0 relative z-[1] ${
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
        )}
      </div>

      {/* Info section */}
      {compact ? (
        /* Compact: single-line horizontal info */
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-medium truncate max-w-[50px]">
            {player.name}
          </span>
          {bid !== undefined ? (
            <span
              className="text-[9px] px-1 py-0 rounded-full font-medium whitespace-nowrap"
              style={{
                background: 'rgba(212, 175, 55, 0.15)',
                color: 'var(--gold)',
                border: '1px solid rgba(212, 175, 55, 0.3)',
              }}
            >
              {bid}/{won}
            </span>
          ) : (
            <span className="text-[9px] px-1 py-0 rounded-full whitespace-nowrap"
              style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)' }}
            >
              {won}
            </span>
          )}
          {isSpeaking && (
            <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>
              <Mic size={8} className="text-green-400" />
            </motion.div>
          )}
          {isTimerActive && (
            <motion.span
              className={`text-[9px] font-mono font-bold ${timerUrgent ? 'text-red-400' : 'text-gold'}`}
              animate={timerUrgent ? { opacity: [1, 0.4, 1] } : {}}
              transition={timerUrgent ? { duration: 0.5, repeat: Infinity } : {}}
            >
              {timerSeconds}s
            </motion.span>
          )}
        </div>
      ) : (
        /* Full: original vertical info layout */
        <>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs sm:text-sm font-medium truncate max-w-[70px] sm:max-w-[100px]">
                {player.name}
                {isSelf && <span className="text-[10px] sm:text-xs opacity-40 ml-1">(You)</span>}
              </span>
              {isSpeaking && (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                >
                  <Mic size={10} className="text-green-400" />
                </motion.div>
              )}
            </div>

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

          {/* Opponent card backs (not shown for self or compact) */}
          {!isSelf && cardCount > 0 && (
            <div className="flex items-center mt-1">
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
        </>
      )}

      {/* Turn indicator */}
      {isCurrentTurn && (
        <>
          <motion.div
            className={`absolute -top-1 -right-1 ${compact ? 'w-2.5 h-2.5' : 'w-3.5 h-3.5'} rounded-full`}
            style={{ background: 'var(--gold)', boxShadow: '0 0 8px rgba(212, 175, 55, 0.8)' }}
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ duration: 1.2, repeat: Infinity }}
          />
          {!compact && (
            <div className="flex items-center gap-1.5 mt-1">
              <motion.div
                className="text-xs font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: 'linear-gradient(135deg, var(--gold), var(--gold-light))',
                  color: '#000',
                }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                {isSelf ? 'YOUR TURN' : 'PLAYING'}
              </motion.div>
              {isTimerActive && (
                <motion.span
                  className={`text-xs font-mono font-bold ${timerUrgent ? 'text-red-400' : 'text-gold'}`}
                  animate={timerUrgent ? { opacity: [1, 0.4, 1] } : {}}
                  transition={timerUrgent ? { duration: 0.5, repeat: Infinity } : {}}
                >
                  {timerSeconds}s
                </motion.span>
              )}
            </div>
          )}
        </>
      )}
    </motion.div>
  )
}
