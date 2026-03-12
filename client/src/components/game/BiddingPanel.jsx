import { useState } from 'react'
import { motion } from 'framer-motion'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'
import { useOrientation } from '../../hooks/useOrientation'

export default function BiddingPanel() {
  const { socket } = useSocket()
  const { state } = useGame()
  const { myTurn, bids, players, playerId, currentTurn, tricksPerRound } = state
  const { layoutTier, height } = useOrientation()
  const maxBid = tricksPerRound || 13
  const [selectedBid, setSelectedBid] = useState(null)

  const isCompactLandscape = layoutTier === 'compactLandscape'
  const isCompactPortrait = layoutTier === 'compactPortrait'
  const isShortLandscape = isCompactLandscape && height <= 390
  const currentBidder = players.find((player) => player.id === currentTurn)
  const bidOptions = Array.from({ length: maxBid }, (_, index) => index + 1)
  const orderedBids = players.filter((player) => bids[player.id] !== undefined)
  const showBidHistory = !isShortLandscape
  const bidGridClass = isCompactLandscape
    ? isShortLandscape ? 'grid-cols-5' : 'grid-cols-6'
    : maxBid <= 10
      ? 'grid-cols-5'
      : maxBid <= 13
        ? 'grid-cols-7'
        : 'grid-cols-9'

  const handleConfirmBid = () => {
    if (!socket || selectedBid === null) return
    socket.emit('place-bid', { bid: selectedBid })
    setSelectedBid(null)
  }

  return (
    <motion.div
      className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-3 sm:px-4"
      style={{
        bottom: isCompactLandscape
          ? 'calc(var(--game-safe-bottom) + 116px)'
          : isCompactPortrait
            ? 'calc(var(--game-safe-bottom) + 136px)'
            : 'calc(var(--game-safe-bottom) + 154px)',
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className={`pointer-events-auto game-floating-sheet game-center-card rounded-[28px] ${
          isCompactLandscape ? 'p-2.5' : 'p-4 sm:p-5'
        }`}
        style={{
          maxHeight: isCompactLandscape ? (isShortLandscape ? '30dvh' : '38dvh') : '48dvh',
          overflowY: 'auto',
          overflowX: 'hidden',
          borderColor: 'rgba(212, 175, 55, 0.22)',
        }}
        initial={{ scale: 0.9, y: 18 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 18, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] opacity-50">Bidding</p>
            <h2 className={`${isCompactLandscape ? 'text-sm' : 'text-lg sm:text-xl'} mt-1 font-bold tracking-wide text-gold`}>
              {myTurn ? 'Choose your bid' : 'Waiting on bid'}
            </h2>
            <p className={`${isCompactLandscape ? 'text-[10px]' : 'text-xs'} mt-1 opacity-60`}>
              {myTurn
                ? 'Pick the tricks you expect to win, then confirm.'
                : `${currentBidder?.name || 'Player'} is deciding.`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {myTurn && selectedBid !== null && (
              <span className={`game-pill font-semibold ${isCompactLandscape ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}>
                {selectedBid} selected
              </span>
            )}
            <span
              className={`rounded-full border ${isCompactLandscape ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}
              style={{ borderColor: 'rgba(212,175,55,0.28)', color: 'rgba(240,240,240,0.8)' }}
            >
              Max {maxBid}
            </span>
          </div>
        </div>

        {showBidHistory && orderedBids.length > 0 && (
          <div className={`mt-3 ${isCompactLandscape ? 'flex gap-1.5 overflow-x-auto scrollbar-hide pb-1' : 'flex flex-wrap gap-2'}`}>
            {orderedBids.map((player) => (
              <div
                key={player.id}
                className={`rounded-xl border bg-black/20 ${
                  isCompactLandscape ? 'px-2 py-1 text-[11px] whitespace-nowrap' : 'px-2.5 py-1 text-xs'
                }`}
                style={{ borderColor: 'rgba(212,175,55,0.18)' }}
              >
                <span className={player.id === playerId ? 'font-semibold text-gold' : 'opacity-75'}>
                  {player.name}
                  {player.id === playerId ? ' (You)' : ''}
                </span>
                <span className="mx-1 opacity-35">•</span>
                <span className="font-bold text-gold">{bids[player.id]}</span>
              </div>
            ))}
          </div>
        )}

        {myTurn ? (
          <>
            <div className={`mt-3 grid ${bidGridClass} gap-1.5 sm:gap-2`}>
              {bidOptions.map((number) => (
                <motion.button
                  key={number}
                  onClick={() => setSelectedBid(number)}
                  className={`rounded-2xl border font-bold transition-all duration-200 ${
                    isCompactLandscape
                      ? isShortLandscape
                        ? 'h-9 text-xs'
                        : 'h-10 text-sm'
                      : 'h-10 sm:h-11 text-sm sm:text-base'
                  } ${
                    selectedBid === number
                      ? 'text-black'
                      : 'bg-white/5 text-white/80 hover:bg-white/10 border-white/10'
                  }`}
                  style={
                    selectedBid === number
                      ? {
                          background: 'linear-gradient(135deg, var(--gold), var(--gold-light))',
                          boxShadow: '0 0 15px rgba(212, 175, 55, 0.35)',
                        }
                      : undefined
                  }
                  whileTap={{ scale: 0.95 }}
                >
                  {number}
                </motion.button>
              ))}
            </div>

            <motion.button
              onClick={handleConfirmBid}
              disabled={selectedBid === null}
              className={`mt-3 w-full rounded-2xl font-bold text-black transition-all disabled:cursor-not-allowed disabled:opacity-30 ${
                isCompactLandscape ? 'py-2 text-sm' : 'py-2.5 text-base'
              }`}
              style={{
                background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
                boxShadow: selectedBid !== null ? '0 4px 15px rgba(212, 175, 55, 0.3)' : 'none',
              }}
              whileTap={selectedBid !== null ? { scale: 0.98 } : {}}
            >
              Confirm bid{selectedBid !== null ? `: ${selectedBid}` : ''}
            </motion.button>
          </>
        ) : (
          <div className={`py-3 text-center ${isCompactLandscape ? 'mt-2' : 'mt-3'}`}>
            <div className="mb-2 flex items-center justify-center gap-2">
              {[0, 1, 2].map((index) => (
                <motion.div
                  key={index}
                  className="h-2 w-2 rounded-full bg-[var(--gold)]"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{ duration: 1.2, repeat: Infinity, delay: index * 0.2 }}
                />
              ))}
            </div>
            <p className={`${isCompactLandscape ? 'text-xs' : 'text-sm'} opacity-60`}>
              Waiting for <span className="font-medium text-gold">{currentBidder?.name || 'player'}</span> to bid...
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
