import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useGame } from '../../context/GameContext'
import { useOrientation } from '../../hooks/useOrientation'
import Card from './Card'

function getOffsets(layoutTier) {
  if (layoutTier === 'compactLandscape') {
    return {
      bottom: { x: 0, y: 34, fromX: 0, fromY: 76 },
      top: { x: 0, y: -34, fromX: 0, fromY: -76 },
      left: { x: -66, y: 0, fromX: -132, fromY: 0 },
      right: { x: 66, y: 0, fromX: 132, fromY: 0 },
      'top-left': { x: -48, y: -26, fromX: -88, fromY: -58 },
      'top-right': { x: 48, y: -26, fromX: 88, fromY: -58 },
      'bottom-left': { x: -48, y: 26, fromX: -88, fromY: 58 },
      'bottom-right': { x: 48, y: 26, fromX: 88, fromY: 58 },
    }
  }

  if (layoutTier === 'compactPortrait') {
    return {
      bottom: { x: 0, y: 42, fromX: 0, fromY: 94 },
      top: { x: 0, y: -42, fromX: 0, fromY: -94 },
      left: { x: -58, y: 0, fromX: -120, fromY: 0 },
      right: { x: 58, y: 0, fromX: 120, fromY: 0 },
      'top-left': { x: -42, y: -30, fromX: -82, fromY: -66 },
      'top-right': { x: 42, y: -30, fromX: 82, fromY: -66 },
      'bottom-left': { x: -42, y: 30, fromX: -82, fromY: 66 },
      'bottom-right': { x: 42, y: 30, fromX: 82, fromY: 66 },
    }
  }

  if (layoutTier === 'wide') {
    return {
      bottom: { x: 0, y: 52, fromX: 0, fromY: 126 },
      top: { x: 0, y: -52, fromX: 0, fromY: -126 },
      left: { x: -86, y: 0, fromX: -176, fromY: 0 },
      right: { x: 86, y: 0, fromX: 176, fromY: 0 },
      'top-left': { x: -64, y: -36, fromX: -128, fromY: -78 },
      'top-right': { x: 64, y: -36, fromX: 128, fromY: -78 },
      'bottom-left': { x: -64, y: 36, fromX: -128, fromY: 78 },
      'bottom-right': { x: 64, y: 36, fromX: 128, fromY: 78 },
    }
  }

  return {
    bottom: { x: 0, y: 48, fromX: 0, fromY: 112 },
    top: { x: 0, y: -48, fromX: 0, fromY: -112 },
    left: { x: -74, y: 0, fromX: -152, fromY: 0 },
    right: { x: 74, y: 0, fromX: 152, fromY: 0 },
    'top-left': { x: -56, y: -34, fromX: -116, fromY: -72 },
    'top-right': { x: 56, y: -34, fromX: 116, fromY: -72 },
    'bottom-left': { x: -56, y: 34, fromX: -116, fromY: 72 },
    'bottom-right': { x: 56, y: 34, fromX: 116, fromY: 72 },
  }
}

function getCollectTarget(winnerOffset) {
  return {
    x: winnerOffset.fromX * 0.65,
    y: winnerOffset.fromY * 0.65,
  }
}

export default function TrickArea({ positionedPlayers, playerCount = 4 }) {
  const { state } = useGame()
  const { trickCards, trickWinner } = state
  const { layoutTier } = useOrientation()
  const [animPhase, setAnimPhase] = useState('idle')
  const [winnerPosition, setWinnerPosition] = useState(null)
  const prevWinnerRef = useRef(null)

  const playerPositionMap = useMemo(() => {
    const nextMap = {}

    if (positionedPlayers) {
      positionedPlayers.forEach((player) => {
        nextMap[player.id] = player.position
      })
    }

    return nextMap
  }, [positionedPlayers])

  useEffect(() => {
    if (trickWinner && trickWinner !== prevWinnerRef.current) {
      prevWinnerRef.current = trickWinner
      setWinnerPosition(playerPositionMap[trickWinner] || 'bottom')
      setAnimPhase('glow')

      const collectTimer = setTimeout(() => {
        setAnimPhase('collect')
      }, 600)

      return () => clearTimeout(collectTimer)
    }

    if (!trickWinner) {
      prevWinnerRef.current = null
      setAnimPhase('idle')
      setWinnerPosition(null)
    }
  }, [playerPositionMap, trickWinner])

  const isHeadToHeadPortrait = playerCount <= 2 && layoutTier === 'compactPortrait'
  const sizeClass = isHeadToHeadPortrait
    ? 'w-[min(80vw,300px)] h-[min(26vh,186px)]'
    : {
        compactLandscape: 'w-[min(68vw,360px)] h-[min(36vh,168px)]',
        compactPortrait: 'w-[min(80vw,292px)] h-[min(27vh,184px)]',
        medium: 'w-[min(76vw,420px)] h-[min(32vh,220px)]',
        wide: 'w-[min(50vw,500px)] h-[min(34vh,250px)]',
      }[layoutTier]

  const offsets = getOffsets(layoutTier)
  const effectiveOffsets = isHeadToHeadPortrait
    ? {
        ...offsets,
        bottom: { x: 0, y: 38, fromX: 0, fromY: 86 },
        top: { x: 0, y: -38, fromX: 0, fromY: -86 },
      }
    : offsets
  const frameInset = isHeadToHeadPortrait ? '20px' : '24px'
  const placeholderCardClass = isHeadToHeadPortrait
    ? 'w-11 h-14 rounded-lg'
    : 'w-12 h-16 sm:w-14 sm:h-20 rounded-xl'

  return (
    <div className={`game-floating-sheet relative flex items-center justify-center overflow-hidden rounded-[30px] ${sizeClass}`}>
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: 'radial-gradient(circle at center, rgba(212,175,55,0.12) 0%, rgba(14,74,46,0.18) 35%, rgba(0,0,0,0) 72%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-[10px] rounded-[24px]"
        style={{
          background: 'radial-gradient(circle at center, rgba(255,255,255,0.04) 0%, rgba(12,58,36,0.2) 55%, rgba(0,0,0,0) 100%)',
          boxShadow: 'inset 0 0 24px rgba(0,0,0,0.16)',
        }}
      />
      <div
        className="pointer-events-none absolute rounded-[26px] border border-dashed"
        style={{
          inset: frameInset,
          borderColor: 'rgba(212, 175, 55, 0.12)',
        }}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <span
          className="select-none text-[22px] font-semibold uppercase tracking-[0.55em] sm:text-[26px]"
          style={{
            color: 'rgba(212, 175, 55, 0.1)',
            textShadow: '0 0 28px rgba(212, 175, 55, 0.05)',
          }}
        >
          Card Trap
        </span>
      </div>

      <AnimatePresence mode="sync">
        {trickCards.map((trickCard, index) => {
          const position = playerPositionMap[trickCard.playerId] || 'bottom'
          const offset = effectiveOffsets[position]
          const isWinner = trickWinner === trickCard.playerId
          const isCollecting = animPhase === 'collect'
          const winnerOffset = winnerPosition ? effectiveOffsets[winnerPosition] : null
          const collectTarget = isCollecting && winnerOffset
            ? getCollectTarget(winnerOffset)
            : null

          return (
            <motion.div
              key={`${trickCard.card.suit}-${trickCard.card.rank}-${index}`}
              className={`absolute ${isWinner && animPhase === 'glow' ? 'trick-winner-glow rounded-lg' : ''}`}
              initial={{
                x: offset.fromX,
                y: offset.fromY,
                opacity: 0,
                scale: 0.5,
              }}
              animate={{
                x: collectTarget ? collectTarget.x : offset.x,
                y: collectTarget ? collectTarget.y : offset.y,
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
              style={{ zIndex: isCollecting ? 20 + index : index }}
            >
              <Card
                suit={trickCard.card.suit}
                rank={trickCard.card.rank}
                faceUp={true}
                small={layoutTier !== 'wide'}
              />
            </motion.div>
          )
        })}
      </AnimatePresence>

      {trickCards.length === 0 && (
        <div className="relative z-10 flex flex-col items-center gap-2">
          <div className={`${placeholderCardClass} border border-dashed border-white/10 flex items-center justify-center bg-black/10`}>
            <span className="text-white/10 text-xl sm:text-2xl">{'\u2660'}</span>
          </div>
          <span className="text-[9px] sm:text-[10px] uppercase tracking-[0.22em] opacity-35">
            Waiting For Play
          </span>
        </div>
      )}
    </div>
  )
}
