import { motion } from 'framer-motion'
import { Home, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import { useOrientation } from '../../hooks/useOrientation'
import { DonkeyLetters } from './DonkeyGameBoard'

export default function DonkeyGameOver() {
  const navigate = useNavigate()
  const { state, dispatch } = useGame()
  const { socket } = useSocket()
  const { layoutTier } = useOrientation()

  const result = state.donkeyGameResult
  const myId = state.playerId

  if (!result) return null

  const isDonkey = result.donkeyPlayerId === myId
  const donkeyName = result.donkeyPlayerName || 'Unknown'
  const widthClass = layoutTier === 'compactLandscape'
    ? 'max-w-[340px]'
    : layoutTier === 'compactPortrait'
      ? 'max-w-[360px]'
      : 'max-w-[440px]'

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className={`game-floating-sheet w-full ${widthClass} rounded-[30px] p-5 text-center sm:p-6`}
        style={{ boxShadow: '0 24px 70px rgba(0,0,0,0.55)' }}
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
      >
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full border border-red-400/30 bg-red-500/12 text-lg font-bold text-red-300">
          D
        </div>

        <p className="text-[10px] uppercase tracking-[0.24em] opacity-50">Game over</p>
        <h2 className="mt-2 text-2xl font-bold text-gold">Gadha Ladan result</h2>
        <p className="mt-2 text-sm text-red-300">
          {isDonkey ? 'You are the donkey this round.' : `${donkeyName} is the donkey this round.`}
        </p>
        <p className="mt-1 text-xs opacity-70">Last player with cards remaining becomes the donkey.</p>

        <div className="my-5 space-y-2 text-left">
          {sorted.map((player, index) => {
            const isDonkeyPlayer = player.id === result.donkeyPlayerId
            const isMe = player.id === myId

            return (
              <motion.div
                key={player.id}
                className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 ${
                  isDonkeyPlayer
                    ? 'border-red-400/30 bg-red-500/14'
                    : 'border-white/8 bg-black/12'
                }`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.18 + index * 0.06 }}
              >
                <div className="min-w-0">
                  <p className={`truncate text-sm font-medium ${isDonkeyPlayer ? 'text-red-200' : 'text-white/90'}`}>
                    {player.name}
                    {isMe ? ' (You)' : ''}
                  </p>
                  <div className="mt-1 flex items-center gap-2">
                    <DonkeyLetters letters={player.letters || ''} small />
                    <span className="text-[10px] uppercase tracking-[0.16em] opacity-45">{player.cardCount || 0} cards</span>
                  </div>
                </div>
                <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
                  isDonkeyPlayer ? 'bg-red-500/25 text-red-100' : 'bg-white/10 text-white/75'
                }`}>
                  {isDonkeyPlayer ? 'Donkey' : 'Safe'}
                </span>
              </motion.div>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            onClick={handlePlayAgain}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl py-2.5 text-sm font-semibold"
            style={{
              background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
              color: '#111',
            }}
            whileTap={{ scale: 0.98 }}
          >
            <RotateCcw size={14} />
            Play again
          </motion.button>

          <motion.button
            onClick={handleBack}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl border border-white/20 bg-white/10 py-2.5 text-sm font-semibold"
            whileTap={{ scale: 0.98 }}
          >
            <Home size={14} />
            Home
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  )
}
