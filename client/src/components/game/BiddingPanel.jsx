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
  const panelWidth = isLandscapeMobile
    ? (isShortLandscape ? 'min(92vw, 420px)' : 'min(88vw, 460px)')
    : 'min(94vw, 420px)'
  const topOffset = isLandscapeMobile
    ? '35px'
    : 'calc(env(safe-area-inset-top, 0px) + var(--native-status-bar-offset, 0px) + 52px)'
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
        className={`pointer-events-auto glass-panel ${
          isLandscapeMobile ? 'p-2.5' : 'p-4 sm:p-6'
        }`}
        style={{
          width: panelWidth,
          maxHeight: isLandscapeMobile ? (isShortLandscape ? '40dvh' : '46dvh') : '55dvh',
          overflowY: 'auto',
          overflowX: 'hidden',
          backdropFilter: 'blur(14px)',
          boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
          border: '1px solid rgba(212, 175, 55, 0.45)',
        }}
        initial={{ scale: 0.8, y: -30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: -30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
        <div className={`flex items-center justify-between ${isLandscapeMobile ? 'mb-2' : 'mb-3'}`}>
          <h2
            className={`${isLandscapeMobile ? 'text-sm' : 'text-lg sm:text-xl'} font-bold tracking-wide`}
            style={{ color: 'var(--gold)' }}
          >
            {myTurn ? 'Place Your Bid' : 'Bidding Round'}
          </h2>
          <span
            className={`${isLandscapeMobile ? 'text-[11px] px-2 py-0.5' : 'text-xs px-2.5 py-1'} rounded-full border`}
            style={{ borderColor: 'rgba(212,175,55,0.35)', color: 'rgba(240,240,240,0.8)' }}
          >
            Max {maxBid}
          </span>
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
              <p className={`${isLandscapeMobile ? 'text-[11px] mb-1.5' : 'text-xs mb-2'} text-center opacity-55`}>
                Choose a bid. Your cards stay visible below.
              </p>
            )}

            {isLandscapeMobile ? (
              <div className="mb-2 overflow-x-auto scrollbar-hide">
                <div className="flex gap-1.5 min-w-max pb-1">
                  {Array.from({ length: maxBid }, (_, i) => i + 1).map((num) => (
                    <motion.button
                      key={num}
                      onClick={() => setSelectedBid(num)}
                      className={`${isShortLandscape ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm'} rounded-lg font-bold shrink-0 transition-all duration-200 ${
                        selectedBid === num
                          ? 'text-black'
                          : 'bg-white/5 text-white/80 hover:bg-white/10 border border-white/10'
                      }`}
                      style={
                        selectedBid === num
                          ? {
                              background: 'linear-gradient(135deg, var(--gold), var(--gold-light))',
                              boxShadow: '0 0 12px rgba(212, 175, 55, 0.35)',
                            }
                          : {}
                      }
                      whileTap={{ scale: 0.95 }}
                    >
                      {num}
                    </motion.button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={`grid ${maxBid <= 10 ? 'grid-cols-5' : maxBid <= 13 ? 'grid-cols-7' : 'grid-cols-9'} gap-1.5 sm:gap-2 mb-3`}>
                {Array.from({ length: maxBid }, (_, i) => i + 1).map((num) => (
                  <motion.button
                    key={num}
                    onClick={() => setSelectedBid(num)}
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg font-bold text-sm sm:text-base transition-all duration-200 ${
                      selectedBid === num
                        ? 'text-black'
                        : 'bg-white/5 text-white/80 hover:bg-white/10 border border-white/10'
                    }`}
                    style={
                      selectedBid === num
                        ? {
                            background: 'linear-gradient(135deg, var(--gold), var(--gold-light))',
                            boxShadow: '0 0 15px rgba(212, 175, 55, 0.4)',
                          }
                        : {}
                    }
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                  >
                    {num}
                  </motion.button>
                ))}
              </div>
            )}

            <motion.button
              onClick={handleConfirmBid}
              disabled={selectedBid === null}
              className={`w-full ${isLandscapeMobile ? 'py-1.5 text-sm' : 'py-2.5 text-base'} rounded-xl font-bold text-black transition-all disabled:opacity-30 disabled:cursor-not-allowed`}
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
