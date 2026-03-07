import { useState, useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGame } from '../../context/GameContext'
import Card from './Card'

// Offsets for card positions relative to center, based on relative player position
function getOffsets() {
  const w = typeof window !== 'undefined' ? window.innerWidth : 1280
  const h = typeof window !== 'undefined' ? window.innerHeight : 800
  const isMobile = w < 640
  const isLandscapeMobile = !isMobile && w < 1024 && h < 500

  if (isMobile) {
    return {
      bottom: { x: 0, y: 28, fromX: 0, fromY: 80 },
      top: { x: 0, y: -28, fromX: 0, fromY: -80 },
      left: { x: -40, y: 0, fromX: -100, fromY: 0 },
      right: { x: 40, y: 0, fromX: 100, fromY: 0 },
      'top-left': { x: -30, y: -22, fromX: -70, fromY: -60 },
      'top-right': { x: 30, y: -22, fromX: 70, fromY: -60 },
      'bottom-left': { x: -30, y: 22, fromX: -70, fromY: 60 },
      'bottom-right': { x: 30, y: 22, fromX: 70, fromY: 60 },
    }
  }
  if (isLandscapeMobile) {
    return {
      bottom: { x: 0, y: 24, fromX: 0, fromY: 80 },
      top: { x: 0, y: -24, fromX: 0, fromY: -80 },
      left: { x: -50, y: 0, fromX: -130, fromY: 0 },
      right: { x: 50, y: 0, fromX: 130, fromY: 0 },
      'top-left': { x: -35, y: -20, fromX: -90, fromY: -60 },
      'top-right': { x: 35, y: -20, fromX: 90, fromY: -60 },
      'bottom-left': { x: -35, y: 20, fromX: -90, fromY: 60 },
      'bottom-right': { x: 35, y: 20, fromX: 90, fromY: 60 },
    }
  }
  return {
    bottom: { x: 0, y: 40, fromX: 0, fromY: 120 },
    top: { x: 0, y: -40, fromX: 0, fromY: -120 },
    left: { x: -60, y: 0, fromX: -160, fromY: 0 },
    right: { x: 60, y: 0, fromX: 160, fromY: 0 },
    'top-left': { x: -45, y: -30, fromX: -120, fromY: -80 },
    'top-right': { x: 45, y: -30, fromX: 120, fromY: -80 },
    'bottom-left': { x: -45, y: 30, fromX: -120, fromY: 80 },
    'bottom-right': { x: 45, y: 30, fromX: 120, fromY: 80 },
  }
}

export default function TrickArea({ positionedPlayers }) {
  const { state } = useGame()
  const { trickCards, trickWinner } = state
  const [collectToWinner, setCollectToWinner] = useState(false)
  const [winnerPosition, setWinnerPosition] = useState(null)

  // Map player IDs to positions
  const playerPositionMap = {}
  if (positionedPlayers) {
    positionedPlayers.forEach((p) => {
      playerPositionMap[p.id] = p.position
    })
  }

  // When trickWinner is set, wait for glow, then start collect animation
  useEffect(() => {
    if (trickWinner) {
      const pos = playerPositionMap[trickWinner] || 'bottom'
      setWinnerPosition(pos)
      const timer = setTimeout(() => {
        setCollectToWinner(true)
      }, 700)
      return () => clearTimeout(timer)
    } else {
      setCollectToWinner(false)
      setWinnerPosition(null)
    }
  }, [trickWinner])

  return (
    <div className="relative w-36 h-28 sm:w-48 sm:h-40 flex items-center justify-center">
      <AnimatePresence>
        {trickCards.map((tc, idx) => {
          const position = playerPositionMap[tc.playerId] || 'bottom'
          const offsets = getOffsets()
          const offset = offsets[position]
          const isWinner = trickWinner === tc.playerId

          // Calculate target: if collecting, move to winner's edge position
          const winnerOffset = winnerPosition ? offsets[winnerPosition] : null
          const targetX = collectToWinner && winnerOffset ? winnerOffset.fromX : offset.x
          const targetY = collectToWinner && winnerOffset ? winnerOffset.fromY : offset.y
          const targetScale = collectToWinner ? 0.6 : 1
          const targetOpacity = collectToWinner ? 0.7 : 1

          return (
            <motion.div
              key={`${tc.card.suit}-${tc.card.rank}-${idx}`}
              className={`absolute ${isWinner && !collectToWinner ? 'trick-winner-glow rounded-lg' : ''}`}
              initial={{
                x: offset.fromX,
                y: offset.fromY,
                opacity: 0,
                scale: 0.5,
              }}
              animate={{
                x: targetX,
                y: targetY,
                opacity: targetOpacity,
                scale: targetScale,
              }}
              exit={{
                opacity: 0,
                scale: 0.2,
                transition: { duration: 0.15 },
              }}
              transition={
                collectToWinner
                  ? { type: 'tween', duration: 0.5, ease: 'easeIn' }
                  : { type: 'spring', stiffness: 200, damping: 20 }
              }
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
        <div className="w-10 h-14 sm:w-14 sm:h-20 rounded-lg border border-dashed border-white/10 flex items-center justify-center">
          <span className="text-white/10 text-xl sm:text-2xl">{'\u2660'}</span>
        </div>
      )}
    </div>
  )
}
