import { useMemo, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Trophy, Home, Crown } from 'lucide-react'
import { useGame } from '../../context/GameContext'

// Generate confetti particles
function generateConfetti(count = 50) {
  const colors = ['#FFD700', '#FFA500', '#FF6347', '#4169E1', '#32CD32', '#FF69B4', '#9370DB', '#00CED1']
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: Math.random() * 8 + 4,
    delay: Math.random() * 2,
    duration: Math.random() * 2 + 2,
    rotation: Math.random() * 360,
    drift: (Math.random() - 0.5) * 60,
  }))
}

export default function GameOverModal() {
  const navigate = useNavigate()
  const { state, dispatch } = useGame()
  const { players, totalScores, playerId } = state
  const [showConfetti, setShowConfetti] = useState(false)

  const confettiPieces = useMemo(() => generateConfetti(50), [])

  // Sort players by total score descending
  const rankedPlayers = useMemo(() => {
    return [...players]
      .map((p) => ({ ...p, total: totalScores[p.id] ?? 0 }))
      .sort((a, b) => b.total - a.total)
  }, [players, totalScores])

  const winner = rankedPlayers[0]
  const isWinner = winner?.id === playerId

  // Trigger confetti after modal appears
  useEffect(() => {
    const timer = setTimeout(() => setShowConfetti(true), 400)
    return () => clearTimeout(timer)
  }, [])

  const handleGoHome = () => {
    dispatch({ type: 'RESET' })
    navigate('/')
  }

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Confetti layer */}
      <AnimatePresence>
        {showConfetti && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-[51]">
            {confettiPieces.map((piece) => (
              <motion.div
                key={piece.id}
                className="absolute rounded-sm"
                style={{
                  left: `${piece.x}%`,
                  top: -20,
                  width: piece.size,
                  height: piece.size * 0.6,
                  backgroundColor: piece.color,
                  rotate: piece.rotation,
                }}
                initial={{ y: -20, opacity: 1 }}
                animate={{
                  y: [0, window.innerHeight + 50],
                  x: [0, piece.drift],
                  rotate: [piece.rotation, piece.rotation + 360 * (Math.random() > 0.5 ? 1 : -1)],
                  opacity: [1, 1, 0.8, 0],
                }}
                transition={{
                  duration: piece.duration,
                  delay: piece.delay,
                  ease: 'easeIn',
                  repeat: 2,
                  repeatDelay: Math.random() * 0.5,
                }}
              />
            ))}
          </div>
        )}
      </AnimatePresence>

      {/* Modal */}
      <motion.div
        className="relative glass-panel p-8 sm:p-10 w-[90vw] max-w-lg text-center z-[52]"
        initial={{ scale: 0.5, y: 60, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.6, y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 180, damping: 16 }}
      >
        {/* Glow ring behind trophy */}
        <motion.div
          className="absolute left-1/2 -translate-x-1/2 -top-6 w-28 h-28 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(212,175,55,0.3) 0%, transparent 70%)',
          }}
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.5, 0.8, 0.5],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />

        {/* Crown + Trophy */}
        <div className="relative mb-4">
          <motion.div
            className="flex justify-center"
            initial={{ scale: 0, y: -20 }}
            animate={{ scale: 1, y: 0 }}
            transition={{ delay: 0.2, type: 'spring', stiffness: 300, damping: 12 }}
          >
            <Crown size={28} style={{ color: 'var(--gold)' }} className="mb-1 opacity-80" />
          </motion.div>
          <motion.div
            className="flex justify-center"
            initial={{ scale: 0, rotate: -20 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.35, type: 'spring', stiffness: 250, damping: 12 }}
          >
            <Trophy size={52} style={{ color: 'var(--gold)', filter: 'drop-shadow(0 0 12px rgba(212,175,55,0.5))' }} />
          </motion.div>
        </div>

        {/* Title */}
        <motion.h2
          className="text-3xl sm:text-4xl font-bold mb-1 tracking-wide"
          style={{ color: 'var(--gold)', textShadow: '0 2px 20px rgba(212,175,55,0.4)' }}
          initial={{ opacity: 0, y: 15, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ delay: 0.45, type: 'spring', stiffness: 200, damping: 20 }}
        >
          Game Over!
        </motion.h2>

        <motion.p
          className="text-lg mb-6"
          style={{ color: isWinner ? 'var(--gold)' : 'rgba(255,255,255,0.7)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
        >
          {isWinner ? '🎉 Congratulations, you won! 🎉' : `${winner?.name} wins the game!`}
        </motion.p>

        {/* Winner highlight card */}
        <motion.div
          className="mx-auto mb-5 px-5 py-3 rounded-xl gold-border"
          style={{
            background: 'linear-gradient(135deg, rgba(212,175,55,0.15) 0%, rgba(212,175,55,0.05) 100%)',
            maxWidth: '280px',
          }}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, type: 'spring', stiffness: 200, damping: 18 }}
        >
          <div className="flex items-center justify-center gap-3">
            <span className="text-2xl">🏆</span>
            <div className="text-left">
              <p className="text-sm opacity-50 uppercase tracking-wider">Winner</p>
              <p className="text-xl font-bold text-gold">{winner?.name}</p>
            </div>
            <span className="text-2xl font-bold text-gold ml-auto">{winner?.total}</span>
          </div>
        </motion.div>

        {/* Full Rankings */}
        <div className="space-y-1.5 mb-6">
          {rankedPlayers.map((player, idx) => {
            const isSelf = player.id === playerId
            const medals = ['#FFD700', '#C0C0C0', '#CD7F32', null]
            const medalColor = medals[idx]
            const isFirst = idx === 0

            return (
              <motion.div
                key={player.id}
                className={`flex items-center justify-between px-4 py-2 rounded-lg ${
                  isFirst ? 'bg-[var(--gold)]/10' : 'bg-black/15'
                } ${isSelf ? 'ring-1 ring-[var(--gold)]/30' : ''}`}
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.65 + idx * 0.08, type: 'spring', stiffness: 200, damping: 22 }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                    style={
                      medalColor
                        ? { background: medalColor, color: '#1a1a1a' }
                        : { background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)' }
                    }
                  >
                    {idx + 1}
                  </span>
                  <span className={`font-medium ${isSelf ? 'text-gold' : ''}`}>
                    {player.name}
                    {isSelf && <span className="opacity-40 text-xs ml-1">(You)</span>}
                  </span>
                </div>
                <span className={`font-bold text-lg ${isFirst ? 'text-gold' : 'opacity-70'}`}>
                  {player.total}
                </span>
              </motion.div>
            )
          })}
        </div>

        {/* Home button */}
        <motion.button
          onClick={handleGoHome}
          className="flex items-center justify-center gap-2 mx-auto px-8 py-3 rounded-xl font-semibold text-lg text-black"
          style={{
            background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
            boxShadow: '0 4px 20px rgba(212, 175, 55, 0.35)',
          }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
        >
          <Home size={20} />
          Back to Lobby
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
