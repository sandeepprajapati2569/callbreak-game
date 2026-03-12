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
  const stationPadding = compact
    ? 'gap-2 px-2.5 py-2 min-w-[88px] max-w-[168px]'
    : 'gap-2.5 sm:gap-3 px-3 py-3 sm:px-4 sm:py-4 min-w-[112px] sm:min-w-[144px] max-w-[188px] sm:max-w-[212px]'

  return (
    <motion.div
      className={`flex items-center glass-panel relative overflow-hidden
        ${isCurrentTurn ? 'active-glow' : ''}
        ${isDisconnected ? 'opacity-40' : ''}
        ${compact ? 'flex-row items-start' : 'flex-col items-center'}
        ${stationPadding}
      `}
      style={{
        borderColor: isCurrentTurn ? 'rgba(212, 175, 55, 0.42)' : 'rgba(255, 255, 255, 0.08)',
        background: isCurrentTurn
          ? 'linear-gradient(180deg, rgba(212, 175, 55, 0.14), rgba(7, 40, 24, 0.9))'
          : 'linear-gradient(180deg, rgba(8, 42, 26, 0.92), rgba(4, 22, 14, 0.9))',
        boxShadow: isCurrentTurn
          ? '0 14px 34px rgba(0,0,0,0.26)'
          : '0 12px 28px rgba(0,0,0,0.18)',
      }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: isDisconnected ? 0.4 : 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 200, damping: 20 }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(240,208,96,0.45), rgba(255,255,255,0))' }}
      />

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
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            <span className="text-[10px] font-semibold tracking-[0.02em] truncate max-w-[74px]">
              {player.name}
            </span>
            {isSpeaking && (
              <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>
                <Mic size={8} className="text-green-400" />
              </motion.div>
            )}
            {isDisconnected && <WifiOff size={8} className="text-red-400 shrink-0" />}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-1">
            {bid !== undefined && (
              <span
                className="game-pill text-[9px] px-1.5 py-0.5 font-medium whitespace-nowrap"
              >
                {bid}/{won}
              </span>
            )}
            {!isSelf && cardCount > 0 && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full whitespace-nowrap"
                style={{ background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)' }}
              >
                {cardCount} cards
              </span>
            )}
            {isTimerActive && (
              <motion.span
                className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-bold whitespace-nowrap ${
                  timerUrgent ? 'text-red-300' : 'text-gold'
                }`}
                style={{
                  background: timerUrgent ? 'rgba(239, 68, 68, 0.12)' : 'rgba(212, 175, 55, 0.12)',
                }}
                animate={timerUrgent ? { opacity: [1, 0.45, 1] } : {}}
                transition={timerUrgent ? { duration: 0.5, repeat: Infinity } : {}}
              >
                {timerSeconds}s
              </motion.span>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1">
              <span className="text-xs sm:text-sm font-semibold truncate max-w-[82px] sm:max-w-[112px]">
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

            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {bid !== undefined && (
                <span
                  className="game-pill text-[11px] px-2 py-0.5 font-medium"
                >
                  Bid: {bid}
                </span>
              )}
              <span
                className="text-[11px] px-2 py-0.5 rounded-full"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  color: 'rgba(255, 255, 255, 0.6)',
                }}
              >
                Won: {won}
              </span>
              {!isSelf && cardCount > 0 && (
                <span
                  className="text-[11px] px-2 py-0.5 rounded-full"
                  style={{
                    background: 'rgba(255, 255, 255, 0.04)',
                    color: 'rgba(255, 255, 255, 0.5)',
                  }}
                >
                  Cards: {cardCount}
                </span>
              )}
            </div>
          </div>

          {!isSelf && cardCount > 0 && (
            <div className="flex items-center gap-2 mt-0.5">
              <div className="relative w-9 h-5">
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
              <span className="text-[11px] opacity-40">{cardCount} in hand</span>
            </div>
          )}

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
                className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-[0.18em]"
                style={{
                  background: 'linear-gradient(135deg, var(--gold), var(--gold-light))',
                  color: '#000',
                }}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                {isSelf ? 'Your Turn' : 'On Move'}
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
