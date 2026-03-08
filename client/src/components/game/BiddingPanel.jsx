import { useState } from 'react'
import { motion } from 'framer-motion'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'

export default function BiddingPanel() {
  const { socket } = useSocket()
  const { state } = useGame()
  const { myTurn, bids, players, playerId, currentTurn, tricksPerRound } = state
  const maxBid = tricksPerRound || 13
  const [selectedBid, setSelectedBid] = useState(null)

  const handleConfirmBid = () => {
    if (!socket || selectedBid === null) return
    socket.emit('place-bid', { bid: selectedBid })
    setSelectedBid(null)
  }

  const currentBidder = players.find((p) => p.id === currentTurn)

  return (
    <motion.div
      className="absolute top-0 left-0 right-0 z-50 flex justify-center pt-3 px-3 pointer-events-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Panel - compact, positioned at top so hand stays visible */}
      <motion.div
        className="pointer-events-auto glass-panel p-4 sm:p-6 w-full max-w-sm"
        style={{ border: '1px solid rgba(212, 175, 55, 0.4)' }}
        initial={{ scale: 0.8, y: -30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: -30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 250, damping: 22 }}
      >
        {/* Title */}
        <h2
          className="text-lg sm:text-xl font-bold text-center mb-3 tracking-wide"
          style={{ color: 'var(--gold)' }}
        >
          {myTurn ? 'Place Your Bid' : 'Bidding Round'}
        </h2>

        {/* Already placed bids */}
        {Object.keys(bids).length > 0 && (
          <div className="mb-3 space-y-1">
            {players.map((p) => {
              if (bids[p.id] === undefined) return null
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-xs sm:text-sm px-3 py-1 rounded-lg bg-black/20"
                >
                  <span className={p.id === playerId ? 'text-gold font-medium' : 'opacity-70'}>
                    {p.name}
                    {p.id === playerId && ' (You)'}
                  </span>
                  <span className="text-gold font-bold">{bids[p.id]}</span>
                </div>
              )
            })}
          </div>
        )}

        {myTurn ? (
          <>
            <p className="text-xs text-center opacity-50 mb-2">Look at your cards below, then bid</p>

            {/* Bid number grid */}
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

            {/* Confirm button */}
            <motion.button
              onClick={handleConfirmBid}
              disabled={selectedBid === null}
              className="w-full py-2.5 rounded-xl font-bold text-base text-black transition-all
                disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
                boxShadow: selectedBid !== null ? '0 4px 15px rgba(212, 175, 55, 0.3)' : 'none',
              }}
              whileHover={selectedBid !== null ? { scale: 1.02 } : {}}
              whileTap={selectedBid !== null ? { scale: 0.98 } : {}}
            >
              Confirm Bid{selectedBid !== null && `: ${selectedBid}`}
            </motion.button>
          </>
        ) : (
          <div className="text-center py-4">
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
            <p className="opacity-60 text-sm">
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
