import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff, Mic } from 'lucide-react'
import { useGame } from '../../context/GameContext'

const DENSITY_STYLES = {
  compact: {
    wrapper: 'w-[64px]',
    marker: 'h-10 w-10',
    avatar: 'h-6 w-6',
    avatarText: 'text-xs',
    markerFrame: 'h-10 w-10',
    name: 'max-w-[64px] text-[9px]',
    nameChip: 'px-1.5 py-0.5 text-[8px]',
    badgeText: 'text-[9px] px-1.5 py-0.5',
    timerText: 'text-[9px] px-1.5 py-0.5',
    labelOffsetAbove: 'bottom-full mb-1',
    labelOffsetBelow: 'top-full mt-1',
  },
  standard: {
    wrapper: 'w-[84px]',
    marker: 'h-14 w-14',
    avatar: 'h-9 w-9',
    avatarText: 'text-sm',
    markerFrame: 'h-14 w-14',
    name: 'max-w-[84px] text-[11px]',
    nameChip: 'px-2.5 py-0.5 text-[10px]',
    badgeText: 'text-[11px] px-2 py-0.5',
    timerText: 'text-[10px] px-2 py-0.5',
    labelOffsetAbove: 'bottom-full mb-1.5',
    labelOffsetBelow: 'top-full mt-1.5',
  },
  expanded: {
    wrapper: 'w-[92px]',
    marker: 'h-16 w-16',
    avatar: 'h-10 w-10',
    avatarText: 'text-base',
    markerFrame: 'h-16 w-16',
    name: 'max-w-[92px] text-xs',
    nameChip: 'px-2.5 py-0.5 text-[10px]',
    badgeText: 'text-xs px-2.5 py-0.5',
    timerText: 'text-[11px] px-2.5 py-0.5',
    labelOffsetAbove: 'bottom-full mb-1.5',
    labelOffsetBelow: 'top-full mt-1.5',
  },
}

export default function PlayerStation({
  player,
  isCurrentTurn,
  isSelf,
  isSpeaking = false,
  density = 'standard',
  isExpanded = false,
  onToggleDetails,
  namePlacement = 'below',
}) {
  const { state } = useGame()
  const { bids, tricksWon, turnTimerStart, turnTimerDuration, turnTimerPlayerId } = state
  const [timerProgress, setTimerProgress] = useState(1)

  if (!player) return null

  const bid = bids[player.id]
  const won = tricksWon[player.id] ?? 0
  const isDisconnected = player.isConnected === false
  const initial = player.name?.charAt(0).toUpperCase() || '?'
  const densityStyle = DENSITY_STYLES[density] || DENSITY_STYLES.standard
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
  const detailPopoverClass = isSelf
    ? 'absolute bottom-full left-1/2 z-40 mb-2 -translate-x-1/2'
    : 'absolute top-full left-1/2 z-40 mt-2 -translate-x-1/2'
  const labelPositionClass = namePlacement === 'above'
    ? densityStyle.labelOffsetAbove
    : densityStyle.labelOffsetBelow

  const handleToggle = () => {
    onToggleDetails?.(player.id)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleToggle()
    }
  }

  return (
    <motion.div
      className={`relative flex items-center justify-center overflow-visible ${densityStyle.wrapper} ${densityStyle.markerFrame} ${onToggleDetails ? 'cursor-pointer select-none active:scale-[0.98]' : ''} ${isDisconnected ? 'opacity-45' : ''}`}
      initial={{ opacity: 0, scale: 0.82 }}
      animate={{ opacity: isDisconnected ? 0.45 : 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 210, damping: 22 }}
      role={onToggleDetails ? 'button' : undefined}
      tabIndex={onToggleDetails ? 0 : undefined}
      aria-expanded={onToggleDetails ? isExpanded : undefined}
      onClick={handleToggle}
      onKeyDown={handleKeyDown}
    >
      {namePlacement === 'above' && (
        <div className={`absolute left-1/2 z-10 flex -translate-x-1/2 items-center justify-center gap-1 whitespace-nowrap ${labelPositionClass}`}>
          <span
            className={`truncate rounded-full border border-white/8 bg-[rgba(4,18,12,0.78)] text-white/86 ${densityStyle.name} ${densityStyle.nameChip}`}
          >
            {player.name}
          </span>
          {isSpeaking && (
            <motion.div animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>
              <Mic size={10} className="text-green-400" />
            </motion.div>
          )}
          {isDisconnected && <WifiOff size={10} className="shrink-0 text-red-400" />}
        </div>
      )}

      <div
        className={`relative flex items-center justify-center rounded-full border backdrop-blur-md ${densityStyle.marker}`}
        style={{
          borderColor: isCurrentTurn
            ? 'rgba(212, 175, 55, 0.46)'
            : isDisconnected
              ? 'rgba(239, 68, 68, 0.2)'
              : 'rgba(255, 255, 255, 0.1)',
          background: isCurrentTurn
            ? 'linear-gradient(180deg, rgba(212, 175, 55, 0.18), rgba(7, 40, 24, 0.88))'
            : 'linear-gradient(180deg, rgba(8, 42, 26, 0.86), rgba(4, 22, 14, 0.78))',
          boxShadow: isCurrentTurn
            ? '0 14px 32px rgba(0,0,0,0.24), inset 0 0 24px rgba(212,175,55,0.14)'
            : '0 12px 22px rgba(0,0,0,0.18)',
        }}
      >
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
            viewBox="0 0 72 72"
          >
            <circle cx="36" cy="36" r="32" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="3" />
            <circle
              cx="36"
              cy="36"
              r="32"
              fill="none"
              stroke={timerUrgent ? '#ef4444' : 'var(--gold)'}
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 32}`}
              strokeDashoffset={`${2 * Math.PI * 32 * (1 - timerProgress)}`}
              transform="rotate(-90 36 36)"
              style={{ transition: 'stroke-dashoffset 0.15s linear, stroke 0.3s ease' }}
            />
          </svg>
        )}

        {player.photoURL ? (
          <img
            src={player.photoURL}
            alt=""
            className={`${densityStyle.avatar} rounded-full object-cover relative z-[1]`}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div
            className={`${densityStyle.avatar} rounded-full flex items-center justify-center ${densityStyle.avatarText} font-bold relative z-[1] ${
              isCurrentTurn ? 'text-black' : 'bg-white/10 text-white'
            }`}
            style={isCurrentTurn ? { background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' } : undefined}
          >
            {initial}
          </div>
        )}
      </div>

      {namePlacement !== 'above' && (
        <div className={`absolute left-1/2 z-10 flex -translate-x-1/2 items-center justify-center gap-1 whitespace-nowrap ${labelPositionClass}`}>
        <span
          className={`truncate rounded-full border border-white/8 bg-[rgba(4,18,12,0.78)] text-white/86 ${densityStyle.name} ${densityStyle.nameChip}`}
        >
          {player.name}
        </span>
        {isSpeaking && (
          <motion.div animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 0.6, repeat: Infinity }}>
            <Mic size={10} className="text-green-400" />
          </motion.div>
        )}
        {isDisconnected && <WifiOff size={10} className="shrink-0 text-red-400" />}
        </div>
      )}

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            className={detailPopoverClass}
            initial={{ opacity: 0, y: isSelf ? 8 : -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: isSelf ? 8 : -8, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            <div className="game-floating-sheet min-w-[132px] rounded-2xl px-3 py-2.5 shadow-[0_16px_36px_rgba(0,0,0,0.28)]">
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                <span className={`game-pill font-medium whitespace-nowrap ${densityStyle.badgeText}`}>
                  Bid {bid ?? '-'}
                </span>
                <span
                  className={`rounded-full whitespace-nowrap ${densityStyle.badgeText}`}
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    color: 'rgba(255,255,255,0.62)',
                  }}
                >
                  Won {won}
                </span>
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

              {isDisconnected && (
                <div className="mt-2 flex items-center justify-center gap-1 text-xs text-red-400">
                  <WifiOff size={10} />
                  <span>Disconnected</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
