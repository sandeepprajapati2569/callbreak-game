import { useState } from 'react'
import { motion } from 'framer-motion'
import { useSocket } from '../../context/SocketContext'
import { useGame } from '../../context/GameContext'

export default function BiddingPanel() {
  const { socket } = useSocket()
  const { state } = useGame()
  const { myTurn, bids, players, playerId, currentTurn } = state
  const [selectedBid, setSelectedBid] = useState(null)

  const handleConfirmBid = () => {
    if (!socket || selectedBid === null) return
    socket.emit('place-bid', { bid: selectedBid })
    setSelectedBid(null)
  }

  const currentBidder = players.find((p) => p.id === currentTurn)

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* Panel */}
      <motion.div
        className="relative glass-panel p-8 min-w-[360px] max-w-md"
        initial={{ scale: 0.8, y: 30 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.8, y: 30, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 250, damping: 22 }}
      >
        {/* Title */}
        <h2
          className="text-2xl font-bold text-center mb-6 tracking-wide"
          style={{ color: 'var(--gold)' }}
        >
          {myTurn ? 'Place Your Bid' : 'Bidding Round'}
        </h2>

        {/* Already placed bids */}
        {Object.keys(bids).length > 0 && (
          <div className="mb-5 space-y-1.5">
            {players.map((p) => {
              if (bids[p.id] === undefined) return null
              return (
                <div
                  key={p.id}
                  className="flex items-center justify-between text-sm px-3 py-1.5 rounded-lg bg-black/20"
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
            {/* Bid number grid */}
            <div className="grid grid-cols-5 gap-2 mb-6">
              {Array.from({ length: 13 }, (_, i) => i + 1).map((num) => (
                <motion.button
                  key={num}
                  onClick={() => setSelectedBid(num)}
                  className={`w-12 h-12 rounded-lg font-bold text-lg transition-all duration-200 ${
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
              className="w-full py-3 rounded-xl font-bold text-lg text-black transition-all
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
          <div className="text-center py-8">
            <div className="flex items-center justify-center gap-2 mb-3">
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
            <p className="opacity-60">
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
