import { useMemo, useState, useRef } from 'react'
import { AnimatePresence } from 'framer-motion'
import toast from 'react-hot-toast'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'
import { useOrientation } from '../../hooks/useOrientation'
import Card from './Card'

const SUIT_ORDER = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 }
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 }
const PLAY_CARD_ACK_TIMEOUT_MS = 7000

function cardSortValue(card) {
  const suitVal = SUIT_ORDER[card.suit] ?? 4
  const rankVal = card.value || RANK_VALUES[card.rank] || 0
  return suitVal * 100 + rankVal
}

export default function PlayerHand() {
  const { socket, isConnected } = useSocket()
  const { state } = useGame()
  const { myHand, myTurn, playableCards, phase } = state
  const { width: windowWidth, isMobile, isLandscapeMobile } = useOrientation()
  const [pendingCardKey, setPendingCardKey] = useState(null)
  const pendingCardRef = useRef(null)
  const pendingToastShownRef = useRef(false)

  const sortedHand = useMemo(() => {
    return [...myHand].sort((a, b) => cardSortValue(a) - cardSortValue(b))
  }, [myHand])

  const playableSet = useMemo(() => {
    return new Set(playableCards.map((c) => `${c.suit}-${c.rank}`))
  }, [playableCards])

  const hasPendingCardInHand = pendingCardKey
    ? myHand.some((card) => `${card.suit}-${card.rank}` === pendingCardKey)
    : false
  const isActionLocked = Boolean(pendingCardKey && myTurn && phase === 'PLAYING' && hasPendingCardInHand)

  const handlePlayCard = (card) => {
    if (!socket || !myTurn || phase !== 'PLAYING') return

    const cardKey = `${card.suit}-${card.rank}`
    if (!playableSet.has(cardKey)) return

    if (!isConnected || !socket.connected) {
      toast.error('Network reconnecting. Please wait a moment.')
      return
    }

    // Unlock stale pending state if turn/hand changed before ack callback.
    if (pendingCardRef.current) {
      const stillPending = myTurn
        && phase === 'PLAYING'
        && myHand.some((handCard) => `${handCard.suit}-${handCard.rank}` === pendingCardRef.current)

      if (!stillPending) {
        pendingCardRef.current = null
        setPendingCardKey(null)
        pendingToastShownRef.current = false
      }
    }

    // One in-flight play only, to prevent duplicate taps on slow networks.
    if (pendingCardRef.current) {
      if (!pendingToastShownRef.current) {
        toast('Sending your move...')
        pendingToastShownRef.current = true
      }
      return
    }

    pendingCardRef.current = cardKey
    setPendingCardKey(cardKey)

    socket.timeout(PLAY_CARD_ACK_TIMEOUT_MS).emit(
      'play-card',
      { card: { suit: card.suit, rank: card.rank } },
      (err, response) => {
        pendingCardRef.current = null
        setPendingCardKey(null)
        pendingToastShownRef.current = false

        if (err) {
          toast.error('Move timed out. Check internet and try again.')
          return
        }

        if (response?.success === false) {
          toast.error(response.error || 'Unable to play this card.')
        }
      }
    )
  }

  const cardCount = sortedHand.length

  // Dynamic layout: calculate overlap and scale to fit screen
  const padding = isMobile ? 16 : 32
  const availableWidth = windowWidth - padding
  const cardWidthPx = isMobile ? 62 : isLandscapeMobile ? 56 : 80

  // Comfortable step (visible portion per card) for readable cards
  const comfortableStep = isMobile ? 24 : isLandscapeMobile ? 24 : 30
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
        minHeight: isMobile ? '110px' : isLandscapeMobile ? '85px' : '140px',
        paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom, 12px))' : isLandscapeMobile ? '4px' : '12px',
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
            const isPlayable = myTurn && phase === 'PLAYING' && playableSet.has(cardKey) && !isActionLocked
            const isNotPlayableOnTurn = myTurn && phase === 'PLAYING' && !playableSet.has(cardKey)
            const isPendingCard = pendingCardKey === cardKey

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
                  opacity: isPendingCard ? 0.6 : isNotPlayableOnTurn ? 0.5 : 1,
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
                  medium={isLandscapeMobile}
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
