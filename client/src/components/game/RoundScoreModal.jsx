import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'

export default function RoundScoreModal() {
  const { socket } = useSocket()
  const { state } = useGame()
  const { players, scores, totalScores, currentRound, playerId, bids } = state
  const [autoCloseTimer, setAutoCloseTimer] = useState(10)

  useEffect(() => {
    if (autoCloseTimer <= 0) return
    const timer = setTimeout(() => setAutoCloseTimer(autoCloseTimer - 1), 1000)
    return () => clearTimeout(timer)
  }, [autoCloseTimer])

  const handleNextRound = () => {
    if (!socket) return
    socket.emit('next-round')
  }

  // Extract the latest round result from scores array (which is scoreHistory)
  const latestRound = scores.length > 0 ? scores[scores.length - 1] : null
  const roundScoresMap = {}
  if (latestRound?.scores) {
    latestRound.scores.forEach((s) => {
      roundScoresMap[s.playerId] = {
        bid: s.bid,
        won: s.tricksWon,
        score: s.roundScore,
      }
    })
  }

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <motion.div
        className="relative glass-panel p-8 min-w-[420px] max-w-lg"
        initial={{ scale: 0.8, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 250, damping: 22 }}
      >
        {/* Title */}
        <h2
          className="text-2xl font-bold text-center mb-6 tracking-wide"
          style={{ color: 'var(--gold)' }}
        >
          Round {currentRound} Complete
        </h2>

        {/* Score table */}
        <table className="w-full text-sm mb-6">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left py-2 text-xs uppercase tracking-wider opacity-50 font-normal">
                Player
              </th>
              <th className="text-center py-2 text-xs uppercase tracking-wider opacity-50 font-normal">
                Bid
              </th>
              <th className="text-center py-2 text-xs uppercase tracking-wider opacity-50 font-normal">
                Won
              </th>
              <th className="text-center py-2 text-xs uppercase tracking-wider opacity-50 font-normal">
                Score
              </th>
              <th className="text-right py-2 text-xs uppercase tracking-wider opacity-50 font-normal">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const playerScore = roundScoresMap[player.id] || {}
              const bid = playerScore.bid ?? bids[player.id] ?? '-'
              const won = playerScore.won ?? '-'
              const roundScore = playerScore.score ?? 0
              const total = totalScores[player.id] ?? 0
              const metBid = won !== '-' && bid !== '-' && won >= bid
              const isSelf = player.id === playerId

              return (
                <tr
                  key={player.id}
                  className={`border-b border-white/5 ${isSelf ? 'font-medium' : ''}`}
                >
                  <td className={`py-2 ${isSelf ? 'text-gold' : ''}`}>
                    {player.name}
                    {isSelf && <span className="opacity-40 text-xs ml-1">*</span>}
                  </td>
                  <td className="text-center py-2">{bid}</td>
                  <td className="text-center py-2">{won}</td>
                  <td
                    className={`text-center py-2 font-bold ${
                      metBid ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {roundScore > 0 ? `+${roundScore}` : roundScore}
                  </td>
                  <td className="text-right py-2 font-bold text-gold">{total}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Next round button */}
        <motion.button
          onClick={handleNextRound}
          className="w-full py-3 rounded-xl font-bold text-lg text-black"
          style={{
            background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
            boxShadow: '0 4px 15px rgba(212, 175, 55, 0.3)',
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          Next Round {autoCloseTimer > 0 && `(${autoCloseTimer}s)`}
        </motion.button>
      </motion.div>
    </motion.div>
  )
}
