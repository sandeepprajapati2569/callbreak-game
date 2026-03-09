import { motion } from 'framer-motion'
import { Home, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'

export default function DonkeyGameOver() {
  const navigate = useNavigate()
  const { state, dispatch } = useGame()
  const { socket } = useSocket()

  const result = state.donkeyGameResult
  const myId = state.playerId

  if (!result) return null

  const isDonkey = result.donkeyPlayerId === myId
  const donkeyName = result.donkeyPlayerName || 'Unknown'

  const sorted = [...(result.players || [])].sort((a, b) => {
    if (a.id === result.donkeyPlayerId) return 1
    if (b.id === result.donkeyPlayerId) return -1
    return (a.cardCount || 0) - (b.cardCount || 0)
  })

  const handlePlayAgain = () => {
    socket?.emit('donkey-next-round')
  }

  const handleBack = () => {
    dispatch({ type: 'RESET' })
    navigate('/')
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md px-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="w-full max-w-md rounded-2xl p-5 text-center"
        style={{
          background: 'linear-gradient(180deg, #0f4a31 0%, #072818 100%)',
          border: '1px solid rgba(212, 175, 55, 0.25)',
          boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
        }}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
      >
        <motion.div
          className="mb-2 text-6xl"
          animate={{
            y: [0, -6, 0],
            rotate: [0, -6, 6, -4, 4, 0],
            scale: [1, 1.04, 1],
          }}
          transition={{ duration: 1.6, repeat: Number.POSITIVE_INFINITY, ease: 'easeInOut' }}
        >
          🫏
        </motion.div>

        <motion.h2
          className="text-2xl font-bold mb-1"
          style={{ color: 'var(--gold)' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          Gadha Ladan Result
        </motion.h2>

        <motion.p
          className="text-sm text-red-300 mb-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          {isDonkey ? 'You are the Gadha this round.' : `${donkeyName} is the Gadha this round.`}
        </motion.p>

        <motion.p
          className="text-xs opacity-70 mb-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          Last player with cards remaining becomes the donkey.
        </motion.p>

        <div className="space-y-2 mb-4">
          {sorted.map((player, idx) => {
            const isDonkeyPlayer = player.id === result.donkeyPlayerId
            const isMe = player.id === myId

            return (
              <motion.div
                key={player.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 ${
                  isDonkeyPlayer
                    ? 'bg-red-500/15 border border-red-400/30'
                    : 'bg-white/5 border border-white/10'
                }`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.28 + idx * 0.06 }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {isDonkeyPlayer ? '🫏' : '🏅'}
                  </span>
                  <span className={`text-sm font-medium ${isDonkeyPlayer ? 'text-red-300' : 'text-white'}`}>
                    {player.name}
                    {isMe ? ' (You)' : ''}
                  </span>
                </div>
                <span className={`text-xs px-2 py-1 rounded-full ${
                  isDonkeyPlayer ? 'bg-red-500/25 text-red-200' : 'bg-white/10 text-white/80'
                }`}>
                  {player.cardCount || 0} cards
                </span>
              </motion.div>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            onClick={handlePlayAgain}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5"
            style={{
              background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
              color: '#111',
            }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
          >
            <RotateCcw size={14} />
            Play Again
          </motion.button>

          <motion.button
            onClick={handleBack}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 border border-white/20 bg-white/10"
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            <Home size={14} />
            Home
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}
