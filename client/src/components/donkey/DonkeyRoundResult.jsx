import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'
import { useOrientation } from '../../hooks/useOrientation'
import { DonkeyLetters } from './DonkeyGameBoard'

const AUTO_ADVANCE_SECONDS = 10

export default function DonkeyRoundResult() {
  const { socket } = useSocket()
  const { state } = useGame()
  const { layoutTier } = useOrientation()
  const [countdown, setCountdown] = useState(AUTO_ADVANCE_SECONDS)

  const result = state.donkeyRoundResult
  const myId = state.playerId

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((previous) => {
        if (previous <= 1) {
          clearInterval(timer)
          if (socket) socket.emit('donkey-next-round')
          return 0
        }
        return previous - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [socket])

  if (!result) return null

  const isLoser = result.loserId === myId
  const cardWidthClass = layoutTier === 'compactLandscape'
    ? 'max-w-[320px]'
    : layoutTier === 'compactPortrait'
      ? 'max-w-[340px]'
      : 'max-w-[420px]'

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className={`game-floating-sheet w-full ${cardWidthClass} rounded-[28px] p-5 text-center sm:p-6`}
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
        initial={{ scale: 0.88, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 20 }}
      >
        <p className="text-[10px] uppercase tracking-[0.24em] opacity-50">Round result</p>
        <h2 className="mt-2 text-xl font-bold text-gold">Round {result.round} complete</h2>

        <div className="my-5 rounded-[24px] border border-white/8 bg-black/15 px-4 py-4">
          <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full border text-lg font-bold ${isLoser ? 'border-red-400/40 bg-red-500/15 text-red-300' : 'border-green-400/30 bg-green-500/10 text-green-300'}`}>
            {isLoser ? result.newLetter : 'OK'}
          </div>
          <p className={`mt-3 text-sm font-semibold ${isLoser ? 'text-red-300' : 'text-green-300'}`}>
            {isLoser
              ? `You picked up the letter ${result.newLetter}.`
              : `${result.loserName} picked up the letter ${result.newLetter}.`}
          </p>
          <p className="mt-2 text-xs opacity-65">The player left holding cards receives the next letter.</p>
        </div>

        <div className="mb-5 space-y-2 text-left">
          {result.players?.map((player) => (
            <div
              key={player.id}
              className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 ${
                player.id === myId
                  ? 'border-[rgba(212,175,55,0.26)] bg-[rgba(212,175,55,0.08)]'
                  : 'border-white/8 bg-black/10'
              }`}
            >
              <div className="min-w-0">
                <p className={`truncate text-sm font-medium ${player.id === result.loserId ? 'text-red-300' : 'text-white/90'}`}>
                  {player.name}
                  {player.id === myId ? ' (You)' : ''}
                </p>
                <p className="mt-1 text-[10px] uppercase tracking-[0.18em] opacity-45">
                  {player.id === result.loserId ? 'Received letter' : 'Standing'}
                </p>
              </div>
              <DonkeyLetters letters={player.letters} small />
            </div>
          ))}
        </div>

        <motion.button
          onClick={() => socket?.emit('donkey-next-round')}
          className="w-full rounded-2xl py-2.5 text-sm font-semibold text-black"
          style={{ background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)' }}
          whileTap={{ scale: 0.98 }}
        >
          Next round ({countdown}s)
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
