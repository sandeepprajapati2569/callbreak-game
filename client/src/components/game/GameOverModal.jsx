import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { Trophy, Home } from 'lucide-react'
import { useGame } from '../../context/GameContext'

export default function GameOverModal() {
  const navigate = useNavigate()
  const { state, dispatch } = useGame()
  const { players, totalScores, playerId } = state

  // Sort players by total score descending
  const rankedPlayers = useMemo(() => {
    return [...players]
      .map((p) => ({ ...p, total: totalScores[p.id] ?? 0 }))
      .sort((a, b) => b.total - a.total)
  }, [players, totalScores])

  const winner = rankedPlayers[0]
  const isWinner = winner?.id === playerId

  const handleGoHome = () => {
    dispatch({ type: 'RESET' })
    navigate('/')
  }

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Modal */}
      <motion.div
        className="relative glass-panel p-10 min-w-[440px] max-w-lg text-center"
        initial={{ scale: 0.6, y: 40 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.6, y: 40, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 200, damping: 18 }}
      >
        {/* Trophy */}
        <motion.div
          className="mb-4"
          initial={{ scale: 0 }}
          animate={{ scale: 1, rotate: [0, -10, 10, 0] }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <Trophy size={48} style={{ color: 'var(--gold)' }} className="mx-auto" />
        </motion.div>

        {/* Title */}
        <motion.h2
          className="text-3xl font-bold mb-2 tracking-wide"
          style={{ color: 'var(--gold)', textShadow: '0 2px 15px rgba(212,175,55,0.3)' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          Game Over!
        </motion.h2>

        <motion.p
          className="text-lg mb-6 opacity-70"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.7 }}
          transition={{ delay: 0.5 }}
        >
          {isWinner ? 'Congratulations, you won!' : `${winner?.name} wins!`}
        </motion.p>

        {/* Rankings */}
        <div className="space-y-2 mb-8">
          {rankedPlayers.map((player, idx) => {
            const isSelf = player.id === playerId
            const medals = ['#FFD700', '#C0C0C0', '#CD7F32', null]
            const medalColor = medals[idx]

            return (
              <motion.div
                key={player.id}
                className={`flex items-center justify-between px-4 py-2.5 rounded-lg ${
                  idx === 0 ? 'gold-border bg-black/30' : 'bg-black/15'
                } ${isSelf ? 'ring-1 ring-white/20' : ''}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + idx * 0.1 }}
              >
                <div className="flex items-center gap-3">
                  {/* Rank */}
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
                <span className="font-bold text-lg text-gold">{player.total}</span>
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
            boxShadow: '0 4px 15px rgba(212, 175, 55, 0.3)',
          }}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <Home size={20} />
          Back to Lobby
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
