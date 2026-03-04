import { AnimatePresence, motion } from 'framer-motion'
import { useGame } from '../../context/GameContext'
import Card from './Card'

// Offsets for card positions relative to center, based on relative player position
const POSITION_OFFSETS = {
  bottom: { x: 0, y: 40, fromX: 0, fromY: 120 },
  top: { x: 0, y: -40, fromX: 0, fromY: -120 },
  left: { x: -60, y: 0, fromX: -160, fromY: 0 },
  right: { x: 60, y: 0, fromX: 160, fromY: 0 },
}

export default function TrickArea({ positionedPlayers }) {
  const { state } = useGame()
  const { trickCards, trickWinner } = state

  // Map player IDs to positions
  const playerPositionMap = {}
  if (positionedPlayers) {
    positionedPlayers.forEach((p) => {
      playerPositionMap[p.id] = p.position
    })
  }

  return (
    <div className="relative w-48 h-40 flex items-center justify-center">
      <AnimatePresence>
        {trickCards.map((tc, idx) => {
          const position = playerPositionMap[tc.playerId] || 'bottom'
          const offset = POSITION_OFFSETS[position]
          const isWinner = trickWinner === tc.playerId

          return (
            <motion.div
              key={`${tc.card.suit}-${tc.card.rank}-${idx}`}
              className={`absolute ${isWinner ? 'trick-winner-glow rounded-lg' : ''}`}
              initial={{
                x: offset.fromX,
                y: offset.fromY,
                opacity: 0,
                scale: 0.5,
              }}
              animate={{
                x: offset.x,
                y: offset.y,
                opacity: 1,
                scale: 1,
              }}
              exit={{
                opacity: 0,
                scale: 0.3,
                x: offset.fromX * 0.5,
                y: offset.fromY * 0.5,
                transition: { duration: 0.3 },
              }}
              transition={{
                type: 'spring',
                stiffness: 200,
                damping: 20,
              }}
              style={{ zIndex: idx }}
            >
              <Card
                suit={tc.card.suit}
                rank={tc.card.rank}
                faceUp={true}
                small={true}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* Empty state */}
      {trickCards.length === 0 && (
        <div className="w-14 h-20 rounded-lg border border-dashed border-white/10 flex items-center justify-center">
          <span className="text-white/10 text-2xl">{'\u2660'}</span>
        </div>
      )}
    </div>
  )
}
