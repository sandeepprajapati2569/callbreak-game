import { useState, useEffect, useRef } from 'react'
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

// Midpoint between card's resting position and winner's from position (not all the way to edge)
function getCollectTarget(offset, winnerOffset) {
  return {
    x: winnerOffset.fromX * 0.65,
    y: winnerOffset.fromY * 0.65,
  }
}

export default function TrickArea({ positionedPlayers }) {
  const { state } = useGame()
  const { trickCards, trickWinner } = state
  const [animPhase, setAnimPhase] = useState('idle') // 'idle' | 'glow' | 'collect'
  const [winnerPosition, setWinnerPosition] = useState(null)
  const prevWinnerRef = useRef(null)

  // Map player IDs to positions
  const playerPositionMap = {}
  if (positionedPlayers) {
    positionedPlayers.forEach((p) => {
      playerPositionMap[p.id] = p.position
    })
  }

  // Animation phases: idle → glow (winner highlight) → collect (fly to winner) → idle (cleared)
  useEffect(() => {
    if (trickWinner && trickWinner !== prevWinnerRef.current) {
      prevWinnerRef.current = trickWinner
      const pos = playerPositionMap[trickWinner] || 'bottom'
      setWinnerPosition(pos)
      setAnimPhase('glow')

      const collectTimer = setTimeout(() => {
        setAnimPhase('collect')
      }, 600)

      return () => clearTimeout(collectTimer)
    } else if (!trickWinner) {
      prevWinnerRef.current = null
      setAnimPhase('idle')
      setWinnerPosition(null)
    }
  }, [trickWinner])

  return (
    <div className="relative w-36 h-28 sm:w-48 sm:h-40 flex items-center justify-center">
      <AnimatePresence mode="sync">
        {trickCards.map((tc, idx) => {
          const position = playerPositionMap[tc.playerId] || 'bottom'
          const offsets = getOffsets()
          const offset = offsets[position]
          const isWinner = trickWinner === tc.playerId
          const isCollecting = animPhase === 'collect'

          // Collection target: move toward winner but not all the way to the edge
          const winnerOffset = winnerPosition ? offsets[winnerPosition] : null
          const collectTarget = isCollecting && winnerOffset
            ? getCollectTarget(offset, winnerOffset)
            : null

          const targetX = collectTarget ? collectTarget.x : offset.x
          const targetY = collectTarget ? collectTarget.y : offset.y

          return (
            <motion.div
              key={`${tc.card.suit}-${tc.card.rank}-${idx}`}
              className={`absolute ${isWinner && animPhase === 'glow' ? 'trick-winner-glow rounded-lg' : ''}`}
              initial={{
                x: offset.fromX,
                y: offset.fromY,
                opacity: 0,
                scale: 0.5,
              }}
              animate={{
                x: targetX,
                y: targetY,
                opacity: isCollecting ? 0 : 1,
                scale: isCollecting ? 0.5 : 1,
              }}
              exit={{
                opacity: 0,
                scale: 0.3,
                transition: { duration: 0.1 },
              }}
              transition={
                isCollecting
                  ? { type: 'tween', duration: 0.45, ease: [0.4, 0, 0.2, 1] }
                  : { type: 'spring', stiffness: 220, damping: 22 }
              }
              style={{ zIndex: isCollecting ? 20 + idx : idx }}
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
