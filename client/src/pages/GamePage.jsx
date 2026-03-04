import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'
import GameBoard from '../components/game/GameBoard'
import BiddingPanel from '../components/game/BiddingPanel'
import RoundScoreModal from '../components/game/RoundScoreModal'
import GameOverModal from '../components/game/GameOverModal'

export default function GamePage() {
  const navigate = useNavigate()
  const { state } = useGame()

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
    </div>
  )
}
