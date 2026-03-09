import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, ChevronDown, ChevronUp } from 'lucide-react'
import { useGame } from '../../context/GameContext'

export default function ScoreBoard({ compact = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const { state } = useGame()
  const { players, bids, tricksWon, totalScores, currentRound, playerId } = state

  return (
    <div className="relative">
      {/* Toggle button */}
      <motion.button
        onClick={() => setIsOpen(!isOpen)}
        className={`glass-panel flex items-center gap-1.5 hover:bg-white/5 transition-colors ${
          compact ? 'px-2 py-1.5' : 'px-3 py-2'
        }`}
        whileTap={{ scale: 0.95 }}
      >
        <Trophy size={compact ? 14 : 16} style={{ color: 'var(--gold)' }} />
        {!compact && (
          <span className="text-xs uppercase tracking-wider opacity-60">Scores</span>
        )}
        {isOpen ? <ChevronUp size={14} className="opacity-40" /> : <ChevronDown size={14} className="opacity-40" />}
      </motion.button>

      {/* Dropdown panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="absolute top-full right-0 mt-2 glass-panel p-3 sm:p-4 min-w-[180px] sm:min-w-[280px] z-50"
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
          >
            <h3
              className="text-sm font-bold uppercase tracking-wider mb-3 text-center"
              style={{ color: 'var(--gold)' }}
            >
              Round {currentRound || 1} of 5
            </h3>

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
