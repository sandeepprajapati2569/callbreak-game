import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { WifiOff, Mic } from 'lucide-react'
import { useGame } from '../../context/GameContext'

const DENSITY_STYLES = {
  compact: {
    wrapper: 'flex-row items-start gap-2 px-2.5 py-2 min-w-[110px] max-w-[176px]',
    avatar: 'w-7 h-7',
    avatarText: 'text-xs',
    name: 'max-w-[86px] text-[10px]',
    badgeText: 'text-[9px] px-1.5 py-0.5',
    timerText: 'text-[9px] px-1.5 py-0.5',
  },
  standard: {
    wrapper: 'flex-col items-center gap-2.5 px-3 py-3 min-w-[132px] max-w-[196px]',
    avatar: 'w-9 h-9',
    avatarText: 'text-sm',
    name: 'max-w-[110px] text-xs',
    badgeText: 'text-[11px] px-2 py-0.5',
    timerText: 'text-[10px] px-2 py-0.5',
  },
  expanded: {
    wrapper: 'flex-col items-center gap-3 px-4 py-4 min-w-[152px] max-w-[224px]',
    avatar: 'w-10 h-10',
    avatarText: 'text-base',
    name: 'max-w-[132px] text-sm',
    badgeText: 'text-xs px-2.5 py-0.5',
    timerText: 'text-[11px] px-2.5 py-0.5',
  },
}

export default function PlayerStation({
  player,
  isCurrentTurn,
  isSelf,
  isSpeaking = false,
  density = 'standard',
}) {
  const { state } = useGame()
  const { bids, tricksWon, turnTimerStart, turnTimerDuration, turnTimerPlayerId } = state
  const [timerProgress, setTimerProgress] = useState(1)

  if (!player) return null

  const bid = bids[player.id]
  const won = tricksWon[player.id] ?? 0
  const isDisconnected = player.isConnected === false
  const cardCount = player.cardCount ?? 0
  const initial = player.name?.charAt(0).toUpperCase() || '?'
  const densityStyle = DENSITY_STYLES[density] || DENSITY_STYLES.standard
  const isCompact = density === 'compact'
  const showCards = !isSelf && cardCount > 0 && density !== 'compact'

  const isTimerActive = isCurrentTurn && turnTimerPlayerId === player.id && turnTimerStart

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
  }, [isTimerActive, turnTimerDuration, turnTimerStart])

  const timerSeconds = isTimerActive ? Math.ceil((timerProgress * turnTimerDuration) / 1000) : 0
  const timerUrgent = timerSeconds <= 10 && isTimerActive
  const primaryBadge = bid !== undefined
    ? isCompact
      ? `${bid}/${won}`
      : `Bid ${bid}`
    : isSelf
      ? `Won ${won}`
      : `${cardCount} cards`
  const secondaryBadge = bid !== undefined && !isCompact ? `Won ${won}` : !isSelf && !isCompact ? `Cards ${cardCount}` : null

  return (
    <motion.div
      className={`game-hud-surface relative overflow-hidden ${densityStyle.wrapper} ${isDisconnected ? 'opacity-45' : ''}`}
      style={{
        borderColor: isCurrentTurn
          ? 'rgba(212, 175, 55, 0.4)'
          : isDisconnected
            ? 'rgba(239, 68, 68, 0.16)'
            : 'rgba(255, 255, 255, 0.08)',
        background: isCurrentTurn
          ? 'linear-gradient(180deg, rgba(212, 175, 55, 0.14), rgba(7, 40, 24, 0.9))'
          : 'linear-gradient(180deg, rgba(8, 42, 26, 0.94), rgba(4, 22, 14, 0.92))',
        boxShadow: isCurrentTurn
          ? '0 14px 34px rgba(0,0,0,0.28)'
          : '0 12px 28px rgba(0,0,0,0.2)',
      }}
      initial={{ opacity: 0, scale: 0.82 }}
      animate={{ opacity: isDisconnected ? 0.45 : 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 210, damping: 22 }}
    >
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(240,208,96,0.45), rgba(255,255,255,0))' }}
      />

      <div className="relative shrink-0">
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

        {isTimerActive && (
          <svg
            className="absolute -inset-1.5 h-[calc(100%+12px)] w-[calc(100%+12px)]"
            viewBox="0 0 44 44"
          >
            <circle cx="22" cy="22" r="20" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="2" />
            <circle
              cx="22"
              cy="22"
              r="20"
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

        {player.photoURL ? (
          <img
            src={player.photoURL}
            alt=""
            className={`${densityStyle.avatar} rounded-full object-cover relative z-[1] ${isCurrentTurn ? 'ring-2 ring-[var(--gold)]' : ''}`}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className={`${densityStyle.avatar} rounded-full flex items-center justify-center ${densityStyle.avatarText} font-bold relative z-[1] ${
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

      <div className={`min-w-0 ${isCompact ? 'flex-1' : 'w-full text-center'}`}>
        <div className={`flex items-center gap-1 ${isCompact ? 'justify-start' : 'justify-center'}`}>
          <span className={`${densityStyle.name} truncate font-semibold`}>
            {player.name}
            {isSelf && !isCompact && <span className="ml-1 text-[10px] opacity-45">(You)</span>}
          </span>
          {isSpeaking && (
            <motion.div animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>
              <Mic size={isCompact ? 8 : 10} className="text-green-400" />
            </motion.div>
          )}
          {isDisconnected && <WifiOff size={isCompact ? 8 : 10} className="shrink-0 text-red-400" />}
        </div>

        <div className={`mt-1.5 flex flex-wrap items-center gap-1.5 ${isCompact ? '' : 'justify-center'}`}>
          <span className={`game-pill font-medium whitespace-nowrap ${densityStyle.badgeText}`}>
            {primaryBadge}
          </span>
          {secondaryBadge && (
            <span
              className={`rounded-full whitespace-nowrap ${densityStyle.badgeText}`}
              style={{
                background: 'rgba(255,255,255,0.05)',
                color: 'rgba(255,255,255,0.62)',
              }}
            >
              {secondaryBadge}
            </span>
          )}
          {isTimerActive && (
            <motion.span
              className={`rounded-full font-mono font-bold whitespace-nowrap ${densityStyle.timerText} ${timerUrgent ? 'text-red-300' : 'text-gold'}`}
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

        {showCards && density === 'expanded' && (
          <div className="mt-2 flex items-center justify-center gap-2 opacity-55">
            <div className="relative h-5 w-9">
              {[...Array(Math.min(cardCount, 3))].map((_, index) => (
                <div
                  key={index}
                  className="card-back absolute h-7 w-5"
                  style={{
                    left: `${index * 3}px`,
                    top: `${-index}px`,
                    zIndex: index,
                  }}
                />
              ))}
            </div>
            <span className="text-[11px]">{cardCount} in hand</span>
          </div>
        )}

        {!isCompact && isCurrentTurn && (
          <div className="mt-2 flex items-center justify-center gap-1.5">
            <motion.div
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em]"
              style={{
                background: 'linear-gradient(135deg, var(--gold), var(--gold-light))',
                color: '#000',
              }}
              animate={{ opacity: [0.75, 1, 0.75] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            >
              Current turn
            </motion.div>
          </div>
        )}

        {isDisconnected && !isCompact && (
          <div className="mt-2 flex items-center justify-center gap-1 text-xs text-red-400">
            <WifiOff size={10} />
            <span>Disconnected</span>
          </div>
        )}
      </div>

      {isCurrentTurn && (
        <motion.div
          className={`absolute right-2 top-2 ${isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} rounded-full`}
          style={{ background: 'var(--gold)', boxShadow: '0 0 8px rgba(212, 175, 55, 0.8)' }}
          animate={{ scale: [1, 1.4, 1] }}
          transition={{ duration: 1.2, repeat: Infinity }}
        />
      )}
    </motion.div>
  )
}
