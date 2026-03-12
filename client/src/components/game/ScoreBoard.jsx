import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, ChevronDown, ChevronUp } from 'lucide-react'
import { useGame } from '../../context/GameContext'

export default function ScoreBoard({ compact = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const { state } = useGame()
  const { players, bids, tricksWon, totalScores, currentRound, playerId } = state
  const myTotal = totalScores[playerId] ?? 0
  const leader = players.reduce((best, player) => {
    const total = totalScores[player.id] ?? 0
    if (!best || total > best.total) {
      return { name: player.name, total }
    }
    return best
  }, null)

  return (
    <div className="relative">
      {/* Toggle button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={`game-hud-surface flex items-center gap-2 hover:bg-white/5 transition-colors ${
          compact ? 'min-h-[44px] px-3 py-1.5' : 'min-h-[44px] px-3.5 py-2'
        }`}
        whileTap={{ scale: 0.95 }}
      >
        <Trophy size={compact ? 14 : 16} style={{ color: 'var(--gold)' }} />
        <div className="text-left leading-none">
          <div className="text-[10px] uppercase tracking-[0.22em] opacity-50">
            {compact ? 'Score' : 'Scores'}
          </div>
          <div className="mt-1 text-[11px] font-semibold text-white/85">
            You {myTotal}
          </div>
        </div>
        {isOpen ? <ChevronUp size={14} className="opacity-40" /> : <ChevronDown size={14} className="opacity-40" />}
      </motion.button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute top-full right-0 mt-2 game-hud-surface p-3 sm:p-4 min-w-[220px] sm:min-w-[296px] max-h-[60dvh] overflow-y-auto z-50"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mb-3 text-center">
              <h3
                className="text-sm font-bold uppercase tracking-wider"
                style={{ color: 'var(--gold)' }}
              >
                Round {currentRound || 1} of 5
              </h3>
              {leader && (
                <p className="mt-1 text-xs opacity-60">
                  Leader: <span className="text-gold font-semibold">{leader.name}</span> ({leader.total})
                </p>
              )}
            </div>

            {/* Table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-1.5 text-xs uppercase tracking-wider opacity-50 font-normal">
                    Player
                  </th>
                  <th className="text-center py-1.5 text-xs uppercase tracking-wider opacity-50 font-normal">
                    Bid
                  </th>
                  <th className="text-center py-1.5 text-xs uppercase tracking-wider opacity-50 font-normal">
                    Won
                  </th>
                  <th className="text-right py-1.5 text-xs uppercase tracking-wider opacity-50 font-normal">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {players.map((player) => {
                  const bid = bids[player.id]
                  const won = tricksWon[player.id] ?? 0
                  const total = totalScores[player.id] ?? 0
                  const isSelf = player.id === playerId

                  return (
                    <tr
                      key={player.id}
                      className={`border-b border-white/5 ${isSelf ? 'text-gold' : ''}`}
                    >
                      <td className="py-1.5 font-medium">
                        {player.name}
                        {isSelf && <span className="opacity-40 text-xs ml-1">*</span>}
                      </td>
                      <td className="text-center py-1.5">
                        {bid !== undefined ? bid : '-'}
                      </td>
                      <td className="text-center py-1.5">{won}</td>
                      <td className="text-right py-1.5 font-bold">{total}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
