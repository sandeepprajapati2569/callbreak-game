import { motion } from 'framer-motion'

const SUIT_SYMBOLS = {
  spades: '\u2660',
  hearts: '\u2665',
  diamonds: '\u2666',
  clubs: '\u2663',
}

const SUIT_COLORS = {
  spades: '#1a1a2e',
  clubs: '#1a1a2e',
  hearts: '#DC2626',
  diamonds: '#DC2626',
}

// Server sends ranks as strings: '2'-'10', 'J', 'Q', 'K', 'A'
// No mapping needed — use rank directly

export default function Card({
  suit,
  rank,
  faceUp = true,
  playable = false,
  onClick,
  small = false,
  className = '',
}) {
  const suitSymbol = SUIT_SYMBOLS[suit] || ''
  const suitColor = SUIT_COLORS[suit] || '#1a1a2e'
  const rankLabel = String(rank)

  const width = small ? 'w-10 sm:w-12' : 'w-14 sm:w-20'
  const height = small ? 'h-14 sm:h-16' : 'h-20 sm:h-28'
  const fontSize = small ? 'text-[10px] sm:text-xs' : 'text-xs sm:text-sm'
  const suitSize = small ? 'text-base sm:text-lg' : 'text-xl sm:text-2xl'

  if (!faceUp) {
    return (
      <motion.div
        className={`card-back ${width} ${height} flex-shrink-0 ${className}`}
        layout
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      />
    )
  }

  return (
    <motion.div
      className={`card ${width} ${height} flex-shrink-0 relative cursor-default
        ${playable ? 'cursor-pointer hover:-translate-y-3 hover:shadow-[0_0_15px_rgba(212,175,55,0.4)]' : ''}
        ${className}`}
      onClick={playable ? onClick : undefined}
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={playable ? { y: -12, transition: { duration: 0.15 } } : {}}
      transition={{ type: 'spring', stiffness: 300, damping: 25 }}
      style={{
        borderColor: playable ? 'transparent' : undefined,
      }}
    >
      {/* Top-left rank + suit */}
      <div
        className={`absolute top-1 left-1.5 flex flex-col items-center leading-none ${fontSize}`}
        style={{ color: suitColor }}
      >
        <span className="font-bold">{rankLabel}</span>
        <span className={small ? 'text-xs' : 'text-sm'}>{suitSymbol}</span>
      </div>

      {/* Center suit */}
      <div
        className={`absolute inset-0 flex items-center justify-center ${suitSize}`}
        style={{ color: suitColor }}
      >
        {suitSymbol}
      </div>

      {/* Bottom-right rank + suit (inverted) */}
      <div
        className={`absolute bottom-1 right-1.5 flex flex-col items-center leading-none rotate-180 ${fontSize}`}
        style={{ color: suitColor }}
      >
        <span className="font-bold">{rankLabel}</span>
        <span className={small ? 'text-xs' : 'text-sm'}>{suitSymbol}</span>
      </div>

      {/* Playable gold ring indicator */}
      {playable && (
        <div className="absolute inset-0 rounded-lg border-2 border-transparent hover:border-[var(--gold)] transition-colors pointer-events-none" />
      )}
    </motion.div>
  )
}

export { SUIT_SYMBOLS, SUIT_COLORS }
