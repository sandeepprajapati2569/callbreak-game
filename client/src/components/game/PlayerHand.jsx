import { useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import toast from 'react-hot-toast'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'
import { useOrientation } from '../../hooks/useOrientation'
import Card from './Card'

const SUIT_ORDER = { spades: 0, hearts: 1, diamonds: 2, clubs: 3 }
const RANK_VALUES = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13, A: 14 }
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
  const { width: windowWidth, layoutTier } = useOrientation()
  const [pendingCardKey, setPendingCardKey] = useState(null)
  const pendingCardRef = useRef(null)
  const pendingToastShownRef = useRef(false)

  const sortedHand = useMemo(() => {
    return [...myHand].sort((a, b) => cardSortValue(a) - cardSortValue(b))
  }, [myHand])

  const playableSet = useMemo(() => {
    return new Set(playableCards.map((card) => `${card.suit}-${card.rank}`))
  }, [playableCards])

  const isCompactLandscape = layoutTier === 'compactLandscape'
  const isCompactPortrait = layoutTier === 'compactPortrait'
  const isWideLayout = layoutTier === 'wide'
  const isLandscapeBidding = isCompactLandscape && phase === 'BIDDING'

  const handlePlayCard = (card) => {
    if (!socket || !myTurn || phase !== 'PLAYING') return

    const cardKey = `${card.suit}-${card.rank}`
    if (!playableSet.has(cardKey)) return

    if (!isConnected || !socket.connected) {
      toast.error('Network reconnecting. Please wait a moment.')
      return
    }

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
  const padding = isCompactLandscape ? 20 : isCompactPortrait ? 16 : 28
  const availableWidth = Math.max(220, windowWidth - padding)
  const cardWidthPx = isCompactLandscape ? 56 : isCompactPortrait ? 62 : isWideLayout ? 80 : 72
  const comfortableStep = isLandscapeBidding ? 34 : isCompactLandscape ? 26 : isCompactPortrait ? 24 : isWideLayout ? 34 : 30
  const neededWidth = cardCount <= 1
    ? cardWidthPx
    : cardWidthPx + (cardCount - 1) * comfortableStep
  const minScale = isLandscapeBidding ? 0.8 : isCompactLandscape ? 0.72 : 0.68
  const handScale = Math.max(minScale, Math.min(1, availableWidth / neededWidth))
  const maxSpread = isLandscapeBidding ? 8 : isCompactLandscape ? 18 : isCompactPortrait ? 24 : isWideLayout ? 40 : 32
  const spreadAngle = cardCount <= 1
    ? 0
    : Math.min(maxSpread, cardCount * (isCompactLandscape ? 0.95 : isCompactPortrait ? 1.35 : 1.8))
  const negativeMargin = cardCount <= 1 ? 0 : cardWidthPx - comfortableStep
  const needsScroll = neededWidth * handScale > availableWidth
  const trayLabel = phase === 'BIDDING'
    ? 'Review your hand'
    : myTurn && phase === 'PLAYING'
      ? 'Play a card'
      : `${cardCount} cards in hand`
  const hasPendingCardInHand = pendingCardKey
    ? myHand.some((card) => `${card.suit}-${card.rank}` === pendingCardKey)
    : false
  const isActionLocked = Boolean(pendingCardKey && myTurn && phase === 'PLAYING' && hasPendingCardInHand)
  const minHeight = isCompactLandscape ? '98px' : isCompactPortrait ? '132px' : isWideLayout ? '170px' : '152px'
  const trayPaddingBottom = isCompactLandscape
    ? 'max(6px, var(--game-safe-bottom))'
    : 'max(12px, var(--game-safe-bottom))'

  return (
    <div
      className={`game-hand-tray relative ${needsScroll ? 'overflow-x-auto scrollbar-hide' : ''}`}
      style={{
        minHeight,
        paddingBottom: trayPaddingBottom,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 top-4 rounded-t-[30px] border"
        style={{
          borderColor: 'rgba(212, 175, 55, 0.18)',
          background: 'linear-gradient(180deg, rgba(6, 30, 19, 0.16), rgba(6, 24, 16, 0.62) 42%, rgba(4, 14, 10, 0.82) 100%)',
          boxShadow: '0 -12px 42px rgba(0,0,0,0.24)',
        }}
      />
      <div className="pointer-events-none absolute inset-x-6 top-4 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(240,208,96,0.58),rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2">
        <span
          className="game-pill px-3 py-1 text-[9px] uppercase tracking-[0.24em]"
          style={{
            background: 'rgba(4, 18, 12, 0.9)',
            boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
          }}
        >
          {trayLabel}
        </span>
      </div>

      <div
        className="relative flex justify-center items-end px-2 pt-6 sm:px-4"
        style={{
          transform: handScale < 1 ? `scale(${handScale})` : undefined,
          transformOrigin: 'bottom center',
          minWidth: needsScroll ? `${Math.ceil(neededWidth * handScale)}px` : undefined,
        }}
      >
        <AnimatePresence mode="popLayout">
          {sortedHand.map((card, index) => {
            const cardKey = `${card.suit}-${card.rank}`
            const isPlayable = myTurn && phase === 'PLAYING' && playableSet.has(cardKey) && !isActionLocked
            const isNotPlayableOnTurn = myTurn && phase === 'PLAYING' && !playableSet.has(cardKey)
            const isPendingCard = pendingCardKey === cardKey
            const mid = (cardCount - 1) / 2
            const offset = index - mid
            const angle = (offset / Math.max(cardCount - 1, 1)) * spreadAngle
            const rawYOffset = Math.abs(offset) * Math.abs(offset) * 1.2
            const yOffset = isCompactLandscape
              ? Math.min(rawYOffset, 4)
              : isCompactPortrait
                ? Math.min(rawYOffset, 8)
                : Math.min(rawYOffset, 20)

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
                  medium={isCompactLandscape}
                />
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
