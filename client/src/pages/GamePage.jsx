import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useGame } from '../context/GameContext'
import { useOrientation } from '../hooks/useOrientation'
import GameBoard from '../components/game/GameBoard'
import BiddingPanel from '../components/game/BiddingPanel'
import RoundScoreModal from '../components/game/RoundScoreModal'
import GameOverModal from '../components/game/GameOverModal'

export default function GamePage() {
  const navigate = useNavigate()
  const { state } = useGame()
  const { isPortraitMobile } = useOrientation()

  // Navigate back if not in a game
  useEffect(() => {
    if (state.phase === 'LANDING' && !state.roomCode) {
      navigate('/')
    }
  }, [state.phase, state.roomCode, navigate])

  return (
    <div className="w-screen h-screen overflow-hidden relative" style={{ position: 'fixed', inset: 0 }}>
      <GameBoard />

      <AnimatePresence>
        {state.phase === 'BIDDING' && <BiddingPanel key="bidding" />}
      </AnimatePresence>

      <AnimatePresence>
        {state.phase === 'ROUND_END' && <RoundScoreModal key="round-end" />}
      </AnimatePresence>

      <AnimatePresence>
        {state.phase === 'GAME_OVER' && <GameOverModal key="game-over" />}
      </AnimatePresence>

      {/* Portrait orientation overlay for mobile */}
      <AnimatePresence>
        {isPortraitMobile && (
          <motion.div
            key="rotate-overlay"
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6"
            style={{ background: 'linear-gradient(135deg, #0a2e1a 0%, #072818 50%, #051f12 100%)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              className="text-6xl"
              animate={{ rotate: [0, -90, -90, 0] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', times: [0, 0.3, 0.7, 1] }}
            >
              {'\uD83D\uDCF1'}
            </motion.div>
            <div className="text-center px-8">
              <p className="text-lg font-semibold" style={{ color: 'var(--gold)' }}>
                Rotate your device to landscape
              </p>
              <p className="text-sm mt-2 opacity-60">
                For the best card game experience
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
