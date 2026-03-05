import { useMemo } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'
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
  // Calculate spread and overlap based on card count
  // Use smaller values on mobile via window width check
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const maxSpread = isMobile ? 25 : 40
  const spreadAngle = Math.min(maxSpread, cardCount * (isMobile ? 1.8 : 3))
  const overlapPx = isMobile ? (cardCount > 10 ? 48 : cardCount > 8 ? 46 : 44) : (cardCount > 8 ? 52 : 60)

  return (
    <div className="flex justify-center items-end px-2 sm:px-4 hand-fan" style={{ minHeight: isMobile ? '90px' : '140px', paddingBottom: isMobile ? 'max(12px, env(safe-area-inset-bottom, 12px))' : '12px' }}>
      <AnimatePresence mode="popLayout">
        {sortedHand.map((card, index) => {
          const cardKey = `${card.suit}-${card.rank}`
          const isPlayable = myTurn && phase === 'PLAYING' && playableSet.has(cardKey)
          const isNotPlayableOnTurn = myTurn && phase === 'PLAYING' && !playableSet.has(cardKey)

          // Fan positioning
          const mid = (cardCount - 1) / 2
          const offset = index - mid
          const angle = (offset / Math.max(cardCount - 1, 1)) * spreadAngle
          const rawYOffset = Math.abs(offset) * Math.abs(offset) * 1.5
          const yOffset = isMobile ? Math.min(rawYOffset, 8) : rawYOffset

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
                marginLeft: index === 0 ? 0 : `-${overlapPx - 28}px`,
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
  )
}
