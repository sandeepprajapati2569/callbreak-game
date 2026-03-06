import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../../context/GameContext'
import { DonkeyLetters } from './DonkeyGameBoard'

export default function DonkeyGameOver() {
  const navigate = useNavigate()
  const { state, dispatch } = useGame()

  const result = state.donkeyGameResult
  const myId = state.playerId

  if (!result) return null

  const isDonkey = result.donkeyPlayerId === myId

  // Sort players: donkey last, others by fewest letters
  const sorted = [...(result.players || [])].sort((a, b) => {
    if (a.id === result.donkeyPlayerId) return 1
    if (b.id === result.donkeyPlayerId) return -1
    return a.letters.length - b.letters.length
  })

  const handleBack = () => {
    dispatch({ type: 'RESET' })
    navigate('/')
  }

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="w-[90%] max-w-sm rounded-2xl p-6 text-center"
        style={{
          background: 'linear-gradient(180deg, #0e4a2e 0%, #072818 100%)',
          border: '1px solid rgba(212, 175, 55, 0.2)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
      >
        {/* Trophy / Donkey icon */}
        <motion.div
          className="text-5xl mb-2"
          initial={{ scale: 0, rotate: -20 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', delay: 0.2 }}
        >
          {isDonkey ? '🫏' : '🏆'}
        </motion.div>

        <motion.h2
          className="text-2xl font-bold mb-1"
          style={{ color: 'var(--gold)' }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          Game Over!
        </motion.h2>

        <motion.p
          className={`text-sm mb-5 ${isDonkey ? 'text-red-400' : 'text-green-400'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          {isDonkey
            ? 'You are the Donkey! 🫏'
            : `${result.donkeyPlayerName} is the Donkey!`}
        </motion.p>

        {/* Player rankings */}
        <div className="space-y-2 mb-5">
          {sorted.map((player, idx) => {
            const isDonkeyPlayer = player.id === result.donkeyPlayerId
            const isMe = player.id === myId
            const rank = idx + 1

            return (
              <motion.div
                key={player.id}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg ${
                  isDonkeyPlayer
                    ? 'bg-red-500/10 border border-red-500/20'
                    : isMe
                      ? 'bg-white/10 border border-white/10'
                      : 'bg-white/5'
                }`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + idx * 0.1 }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isDonkeyPlayer
                        ? 'bg-red-500/30 text-red-300'
                        : rank === 1
                          ? 'bg-yellow-500/30 text-yellow-300'
                          : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {isDonkeyPlayer ? '🫏' : rank}
                  </span>
                  <span className={`text-sm font-medium ${isDonkeyPlayer ? 'text-red-400' : ''}`}>
                    {player.name}
                    {isMe && <span className="text-[10px] opacity-50 ml-1">(You)</span>}
                  </span>
                </div>
                <DonkeyLetters letters={player.letters} small />
              </motion.div>
            )
          })}
        </div>

        <motion.button
          onClick={handleBack}
          className="w-full py-2.5 rounded-xl font-semibold text-black text-sm"
          style={{
            background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
          }}
          whileTap={{ scale: 0.98 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          Back to Home
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
