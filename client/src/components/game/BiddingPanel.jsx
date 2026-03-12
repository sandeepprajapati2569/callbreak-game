import { useState } from 'react'
import { motion } from 'framer-motion'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'
import { useOrientation } from '../../hooks/useOrientation'

export default function BiddingPanel() {
  const { socket } = useSocket()
  const { state } = useGame()
  const { myTurn, bids, players, playerId, currentTurn, tricksPerRound } = state
  const { isLandscapeMobile, height } = useOrientation()
  const maxBid = tricksPerRound || 13
  const [selectedBid, setSelectedBid] = useState(null)

  const handleConfirmBid = () => {
    if (!socket || selectedBid === null) return
    socket.emit('place-bid', { bid: selectedBid })
    setSelectedBid(null)
  }

  const currentBidder = players.find((p) => p.id === currentTurn)
  const isShortLandscape = isLandscapeMobile && height <= 420
  const bidOptions = Array.from({ length: maxBid }, (_, i) => i + 1)
  const panelWidth = isLandscapeMobile
    ? (isShortLandscape ? 'min(76vw, 390px)' : 'min(72vw, 430px)')
    : 'min(92vw, 440px)'
  const topOffset = isLandscapeMobile
    ? '44px'
    : 'calc(env(safe-area-inset-top, 0px) + var(--native-status-bar-offset, 0px) + 52px)'
  const bidGridClass = isLandscapeMobile
    ? (isShortLandscape ? 'grid-cols-5' : 'grid-cols-6')
    : maxBid <= 10
      ? 'grid-cols-5'
      : maxBid <= 13
        ? 'grid-cols-7'
        : 'grid-cols-9'
  const orderedBids = players.filter((p) => bids[p.id] !== undefined)

  return (
    <motion.div
      className="absolute left-0 right-0 z-50 flex justify-center px-2 sm:px-3 pointer-events-none"
      style={{ top: topOffset }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <motion.div
        className={`pointer-events-auto game-hud-surface ${
          isLandscapeMobile ? 'p-2.5' : 'p-4 sm:p-5'
        }`}
        style={{
          width: panelWidth,
          maxHeight: isLandscapeMobile ? (isShortLandscape ? '42dvh' : '48dvh') : '55dvh',
          overflowY: 'auto',
          overflowX: 'hidden',
          borderColor: 'rgba(212, 175, 55, 0.22)',
        }}
        initial={{ scale: 0.8, y: -30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: -30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
        <div className={`flex items-center justify-between ${isLandscapeMobile ? 'mb-2' : 'mb-3'}`}>
          <div>
            <h2
              className={`${isLandscapeMobile ? 'text-sm' : 'text-lg sm:text-xl'} font-bold tracking-wide`}
              style={{ color: 'var(--gold)' }}
            >
              {myTurn ? 'Place Your Bid' : 'Bidding Round'}
            </h2>
            <p className={`${isLandscapeMobile ? 'text-[10px]' : 'text-xs'} mt-1 opacity-55`}>
              {myTurn
                ? 'Pick the tricks you expect to win.'
                : `${currentBidder?.name || 'Player'} is choosing a bid.`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {myTurn && selectedBid !== null && (
              <span
                className={`game-pill ${isLandscapeMobile ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'} font-semibold`}
              >
                Selected {selectedBid}
              </span>
            )}
            <span
              className={`${isLandscapeMobile ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'} rounded-full border`}
              style={{ borderColor: 'rgba(212,175,55,0.28)', color: 'rgba(240,240,240,0.8)' }}
            >
              Max {maxBid}
            </span>
          </div>
        </div>

        {orderedBids.length > 0 && (
          <div className={`mb-2 ${isLandscapeMobile ? 'flex gap-1.5 overflow-x-auto scrollbar-hide pb-1' : 'flex flex-wrap gap-2'}`}>
            {orderedBids.map((p) => (
              <div
                key={p.id}
                className={`rounded-lg border bg-black/25 ${
                  isLandscapeMobile ? 'px-2 py-1 text-[11px] whitespace-nowrap' : 'px-2.5 py-1 text-xs'
                }`}
                style={{ borderColor: 'rgba(212,175,55,0.2)' }}
              >
                <span className={p.id === playerId ? 'text-gold font-semibold' : 'opacity-75'}>
                  {p.name}
                  {p.id === playerId ? ' (You)' : ''}
                </span>
                <span className="mx-1 opacity-45">•</span>
                <span className="text-gold font-bold">{bids[p.id]}</span>
              </div>
            ))}
          </div>
        )}

        {myTurn ? (
          <>
            {!isShortLandscape && (
              <p className={`${isLandscapeMobile ? 'text-[11px] mb-2' : 'text-xs mb-2.5'} opacity-55`}>
                Your hand stays visible. Select one number, then confirm.
              </p>
            )}

            <div className={`grid ${bidGridClass} gap-1.5 sm:gap-2 mb-3`}>
              {bidOptions.map((num) => (
                <motion.button
                  key={num}
                  onClick={() => setSelectedBid(num)}
                  className={`${
                    isLandscapeMobile
                      ? isShortLandscape
                        ? 'h-9 text-xs'
                        : 'h-10 text-sm'
                      : 'h-10 sm:h-11 text-sm sm:text-base'
                  } rounded-xl font-bold transition-all duration-200 ${
                    selectedBid === num
                      ? 'text-black'
                      : 'bg-white/5 text-white/80 hover:bg-white/10 border border-white/10'
                  }`}
                  style={
                    selectedBid === num
                      ? {
                          background: 'linear-gradient(135deg, var(--gold), var(--gold-light))',
                          boxShadow: '0 0 15px rgba(212, 175, 55, 0.35)',
                        }
                      : {}
                  }
                  whileHover={!isLandscapeMobile ? { scale: 1.04 } : {}}
                  whileTap={{ scale: 0.95 }}
                >
                  {num}
                </motion.button>
              ))}
            </div>

            <motion.button
              onClick={handleConfirmBid}
              disabled={selectedBid === null}
              className={`w-full ${isLandscapeMobile ? 'py-2 text-sm' : 'py-2.5 text-base'} rounded-xl font-bold text-black transition-all disabled:opacity-30 disabled:cursor-not-allowed`}
              style={{
                background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
                boxShadow: selectedBid !== null ? '0 4px 15px rgba(212, 175, 55, 0.3)' : 'none',
              }}
              whileHover={selectedBid !== null ? { scale: 1.02 } : {}}
              whileTap={selectedBid !== null ? { scale: 0.98 } : {}}
            >
              Confirm Bid{selectedBid !== null ? `: ${selectedBid}` : ''}
            </motion.button>
          </>
        ) : (
          <div className={`text-center ${isLandscapeMobile ? 'py-2' : 'py-4'}`}>
            <div className="flex items-center justify-center gap-2 mb-2">
              <motion.div
                className="w-2 h-2 rounded-full bg-[var(--gold)]"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity }}
              />
              <motion.div
                className="w-2 h-2 rounded-full bg-[var(--gold)]"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
              />
              <motion.div
                className="w-2 h-2 rounded-full bg-[var(--gold)]"
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
              />
            </div>
            <p className={`${isLandscapeMobile ? 'text-xs' : 'text-sm'} opacity-60`}>
              Waiting for{' '}
              <span className="text-gold font-medium">
                {currentBidder?.name || 'player'}
              </span>{' '}
              to bid...
            </p>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}
