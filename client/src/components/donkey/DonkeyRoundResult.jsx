import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'
import { DonkeyLetters } from './DonkeyGameBoard'

const AUTO_ADVANCE_SECONDS = 10

export default function DonkeyRoundResult() {
  const { socket } = useSocket()
  const { state } = useGame()
  const [countdown, setCountdown] = useState(AUTO_ADVANCE_SECONDS)

  const result = state.donkeyRoundResult
  const myId = state.playerId

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          if (socket) socket.emit('donkey-next-round')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [socket])

  if (!result) return null

  const isLoser = result.loserId === myId

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
        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--gold)' }}>
          Round {result.round} Complete
        </h2>

        <div className="my-4">
          {isLoser ? (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.3 }}
            >
              <span className="text-4xl">🫏</span>
              <p className="text-red-400 font-bold mt-2">
                You got the letter "{result.newLetter}"!
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.3 }}
            >
              <span className="text-4xl">✓</span>
              <p className="text-green-400 font-medium mt-2">
                {result.loserName} got the letter "{result.newLetter}"
              </p>
            </motion.div>
          )}
        </div>

        {/* Player letters */}
        <div className="space-y-2 mb-5">
          {result.players?.map((player) => (
            <div
              key={player.id}
              className={`flex items-center justify-between px-3 py-2 rounded-lg ${
                player.id === myId
                  ? 'bg-white/10 border border-white/10'
                  : 'bg-white/5'
              }`}
            >
              <span className={`text-sm font-medium ${
                player.id === result.loserId ? 'text-red-400' : ''
              }`}>
                {player.name}
                {player.id === myId && (
                  <span className="text-[10px] opacity-50 ml-1">(You)</span>
                )}
              </span>
              <DonkeyLetters letters={player.letters} small />
            </div>
          ))}
        </div>

        <motion.button
          onClick={() => socket?.emit('donkey-next-round')}
          className="w-full py-2.5 rounded-xl font-semibold text-black text-sm"
          style={{
            background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
          }}
          whileTap={{ scale: 0.98 }}
        >
          Next Round ({countdown}s)
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
