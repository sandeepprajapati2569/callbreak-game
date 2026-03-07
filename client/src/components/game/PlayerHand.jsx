import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'
import { useOrientation } from '../../hooks/useOrientation'
import Card from './Card'

const SUIT_ORDER = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 }
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 }

function cardSortValue(card) {
  const suitVal = SUIT_ORDER[card.suit] ?? 4
  const rankVal = card.value || RANK_VALUES[card.rank] || 0
  return suitVal * 100 + rankVal
}

export default function PlayerHand() {
  const { socket } = useSocket()
  const { state } = useGame()
  const { myHand, myTurn, playableCards, phase } = state
  const { width: windowWidth, isMobile, isLandscapeMobile } = useOrientation()

  const sortedHand = useMemo(() => {
    return [...myHand].sort((a, b) => cardSortValue(a) - cardSortValue(b))
  }, [myHand])

  const playableSet = useMemo(() => {
    return new Set(playableCards.map((c) => `${c.suit}-${c.rank}`))
  }, [playableCards])

  const handlePlayCard = (card) => {
    if (!socket || !myTurn) return
    socket.emit('play-card', { card: { suit: card.suit, rank: card.rank } })
  }

  const cardCount = sortedHand.length

  // Dynamic layout: calculate overlap and scale to fit screen
  const padding = isMobile ? 16 : 32
  const availableWidth = windowWidth - padding
  const cardWidthPx = isMobile ? 62 : isLandscapeMobile ? 70 : 80

  // Comfortable step (visible portion per card) for readable cards
  const comfortableStep = isMobile ? 24 : isLandscapeMobile ? 28 : 30
  const neededWidth = cardCount <= 1
    ? cardWidthPx
    : cardWidthPx + (cardCount - 1) * comfortableStep

  // Scale the hand down if it exceeds available width (min 0.65 to keep cards readable)
  const handScale = Math.max(0.65, Math.min(1, availableWidth / neededWidth))

  // Spread angle also reduced for large hands
  const maxSpread = isMobile ? 20 : isLandscapeMobile ? 25 : 35
  const spreadAngle = cardCount <= 1 ? 0 : Math.min(maxSpread, cardCount * (isMobile ? 1.2 : isLandscapeMobile ? 1.5 : 2))

  // Negative margin = card width - step
  const negativeMargin = cardCount <= 1 ? 0 : cardWidthPx - comfortableStep

  // If cards overflow even at min scale, enable horizontal scroll
  const needsScroll = handScale <= 0.65 && neededWidth * 0.65 > availableWidth

  return (
    <div
      className={`flex justify-center items-end px-2 sm:px-4 hand-fan ${needsScroll ? 'scrollbar-hide overflow-x-auto' : ''}`}
      style={{
        minHeight: isMobile ? '110px' : isLandscapeMobile ? '100px' : '140px',
        paddingBottom: isMobile ? 'max(16px, env(safe-area-inset-bottom, 16px))' : isLandscapeMobile ? '8px' : '12px',
      }}
    >
      <div
        className="flex justify-center items-end"
        style={{
          transform: handScale < 1 ? `scale(${handScale})` : undefined,
          transformOrigin: 'bottom center',
          minWidth: needsScroll ? `${neededWidth * 0.65}px` : undefined,
        }}
      >
        <AnimatePresence mode="popLayout">
          {sortedHand.map((card, index) => {
            const cardKey = `${card.suit}-${card.rank}`
            const isPlayable = myTurn && phase === 'PLAYING' && playableSet.has(cardKey)
            const isNotPlayableOnTurn = myTurn && phase === 'PLAYING' && !playableSet.has(cardKey)

            // Fan positioning
            const mid = (cardCount - 1) / 2
            const offset = index - mid
            const angle = (offset / Math.max(cardCount - 1, 1)) * spreadAngle
            const rawYOffset = Math.abs(offset) * Math.abs(offset) * 1.2
            const yOffset = isMobile ? Math.min(rawYOffset, 6) : Math.min(rawYOffset, 20)

            return (
              <motion.div
                key={cardKey}
                layout
                initial={{ opacity: 0, y: 60, scale: 0.6 }}
                animate={{
                  opacity: isNotPlayableOnTurn ? 0.5 : 1,
                  y: 0,
                  scale: 1,
                  rotate: angle,
                  x: 0,
                }}
                exit={{ opacity: 0, y: 60, scale: 0.6, transition: { duration: 0.3 } }}
                transition={{
                  type: 'spring',
                  stiffness: 250,
                  damping: 22,
                  delay: index * 0.03,
                }}
                style={{
                  marginLeft: index === 0 ? 0 : `-${negativeMargin}px`,
                  marginBottom: `${-yOffset}px`,
                  zIndex: index,
                  transformOrigin: 'bottom center',
                }}
              >
                <Card
                  suit={card.suit}
                  rank={card.rank}
                  faceUp={true}
                  playable={isPlayable}
                  onClick={() => handlePlayCard(card)}
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
