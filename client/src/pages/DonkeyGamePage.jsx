import { AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'
import DonkeyGameBoard from '../components/donkey/DonkeyGameBoard'
import DonkeyRoundResult from '../components/donkey/DonkeyRoundResult'
import DonkeyGameOver from '../components/donkey/DonkeyGameOver'

export default function DonkeyGamePage() {
  const { state } = useGame()

  return (
    <div className="fixed inset-0 overflow-hidden">
      <DonkeyGameBoard />

      <AnimatePresence>
        {state.phase === 'DONKEY_ROUND_RESULT' && <DonkeyRoundResult key="round-result" />}
        {state.phase === 'DONKEY_GAME_OVER' && <DonkeyGameOver key="game-over" />}
      </AnimatePresence>
    </div>
  )
}
