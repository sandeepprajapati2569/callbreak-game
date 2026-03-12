import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, ChevronDown, ChevronUp } from 'lucide-react'
import { useGame } from '../../context/GameContext'

export default function ScoreBoard({ layoutTier = 'medium' }) {
  const [isOpen, setIsOpen] = useState(false)
  const { state } = useGame()
  const { players, bids, tricksWon, totalScores, currentRound, currentTrick, playerId } = state
  const isCompactTier = layoutTier === 'compactPortrait' || layoutTier === 'compactLandscape'
  const myTotal = totalScores[playerId] ?? 0
  const roundLabel = currentRound || 1
  const trickLabel = (currentTrick || 0) + 1
  const playerRanking = useMemo(() => {
    return [...players]
      .map((player) => ({
        ...player,
        total: totalScores[player.id] ?? 0,
      }))
      .sort((a, b) => b.total - a.total)
  }, [players, totalScores])
  const leader = playerRanking[0] || null
  const myRank = Math.max(1, playerRanking.findIndex((player) => player.id === playerId) + 1)

  return (
    <div className="relative">
      <motion.button
        onClick={() => setIsOpen((current) => !current)}
        data-probe-id="score-toggle"
        className={`game-hud-surface flex min-h-[44px] items-center gap-2 hover:bg-white/5 transition-colors ${
          isCompactTier ? 'px-3 py-1.5' : 'px-3.5 py-2'
        }`}
        whileTap={{ scale: 0.96 }}
      >
        <Trophy size={isCompactTier ? 14 : 16} style={{ color: 'var(--gold)' }} />
        {isCompactTier ? (
          <div className="min-w-0 text-left leading-none">
            <div className="text-[12px] font-semibold text-white/90">{myTotal}</div>
            <div className="mt-1 text-[9px] uppercase tracking-[0.18em] opacity-45">
              R{roundLabel} T{trickLabel}
            </div>
          </div>
        ) : (
          <div className="min-w-0 text-left leading-none">
            <div className="text-[10px] uppercase tracking-[0.22em] opacity-50">Table</div>
            <div className="mt-1 flex items-center gap-2 text-[11px] font-semibold text-white/90">
              <span>{myTotal}</span>
              <span className="text-[10px] opacity-45">R{roundLabel}</span>
              <span className="text-[10px] opacity-45">T{trickLabel}</span>
            </div>
          </div>
        )}
        {isOpen ? <ChevronUp size={14} className="opacity-40" /> : <ChevronDown size={14} className="opacity-40" />}
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className={`game-floating-sheet z-50 rounded-[24px] p-3 sm:p-4 ${
              isCompactTier
                ? 'fixed left-1/2 -translate-x-1/2'
                : 'absolute right-0 top-full mt-2'
            }`}
            style={
              isCompactTier
                ? {
                    top: 'var(--game-hud-overlay-top, calc(var(--game-safe-top) + 60px))',
                    width: 'var(--game-sheet-compact-max)',
                  }
                : {
                    width: layoutTier === 'wide' ? 'var(--game-sheet-wide-max)' : 'var(--game-sheet-medium-max)',
                  }
            }
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.18 }}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.24em] opacity-50">Table scores</p>
                <h3 className="mt-1 text-sm font-semibold text-gold">Round {roundLabel} • Trick {trickLabel}</h3>
              </div>
              {leader && (
                <div className="rounded-2xl border border-white/8 bg-black/15 px-2.5 py-1.5 text-right">
                  <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Leader</p>
                  <p className="mt-1 text-xs font-semibold text-white/90">{leader.name}</p>
                  <p className="text-[11px] text-gold">{leader.total}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {playerRanking.map((player, index) => {
                const bid = bids[player.id]
                const won = tricksWon[player.id] ?? 0
                const isSelf = player.id === playerId

                return (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between gap-3 rounded-2xl border px-3 py-2 ${
                      isSelf ? 'border-[rgba(212,175,55,0.26)] bg-[rgba(212,175,55,0.08)]' : 'border-white/8 bg-black/15'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-45">
                          #{index + 1}
                        </span>
                        <p className={`truncate text-sm font-semibold ${isSelf ? 'text-gold' : 'text-white/90'}`}>
                          {player.name}
                          {isSelf ? ' (You)' : ''}
                        </p>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] uppercase tracking-[0.16em] opacity-55">
                        <span>Bid {bid !== undefined ? bid : '-'}</span>
                        <span className="opacity-25">/</span>
                        <span>Won {won}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-[0.18em] opacity-45">Total</p>
                      <p className="mt-1 text-base font-bold text-gold">{player.total}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
