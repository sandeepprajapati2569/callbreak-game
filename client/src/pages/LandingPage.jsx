import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, LogIn, Sparkles } from 'lucide-react'
import { useSocket } from '../context/SocketContext'
import { useGame } from '../context/GameContext'
import toast from 'react-hot-toast'
import { APP_NAME, APP_TAGLINE } from '../config/app'

const suitSymbols = [
  { symbol: '\u2660', color: '#1a1a2e', x: '10%', y: '15%', size: '4rem', rotate: -15 },
  { symbol: '\u2665', color: '#DC2626', x: '85%', y: '10%', size: '3.5rem', rotate: 12 },
  { symbol: '\u2666', color: '#DC2626', x: '8%', y: '75%', size: '3rem', rotate: 20 },
  { symbol: '\u2663', color: '#1a1a2e', x: '90%', y: '70%', size: '3.5rem', rotate: -10 },
  { symbol: '\u2660', color: '#D4AF37', x: '50%', y: '5%', size: '2.5rem', rotate: 0, opacity: 0.3 },
  { symbol: '\u2665', color: '#D4AF37', x: '20%', y: '90%', size: '2rem', rotate: 30, opacity: 0.25 },
  { symbol: '\u2666', color: '#D4AF37', x: '75%', y: '88%', size: '2.5rem', rotate: -20, opacity: 0.3 },
]

export default function LandingPage() {
  const navigate = useNavigate()
  const { socket } = useSocket()
  const { dispatch } = useGame()
  const [playerName, setPlayerName] = useState('')
  const [showJoin, setShowJoin] = useState(false)
  const [roomCode, setRoomCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [maxPlayers, setMaxPlayers] = useState(4)

  const handleCreateRoom = () => {
    if (!playerName.trim()) {
      toast.error('Please enter your name')
      return
    }
    if (!socket) {
      toast.error('Connecting to server...')
      return
    }
    setLoading(true)
    dispatch({ type: 'SET_PLAYER_NAME', payload: playerName.trim() })
    socket.emit('create-room', { playerName: playerName.trim(), maxPlayers }, (response) => {
      setLoading(false)
      if (response?.error) {
        toast.error(response.error)
      } else {
        navigate('/lobby')
      }
    })
  }

  const handleJoinRoom = () => {
    if (!playerName.trim()) {
      toast.error('Please enter your name')
      return
    }
    if (!roomCode.trim() || roomCode.trim().length < 4) {
      toast.error('Please enter a valid room code')
      return
    }
    if (!socket) {
      toast.error('Connecting to server...')
      return
    }
    setLoading(true)
    dispatch({ type: 'SET_PLAYER_NAME', payload: playerName.trim() })
    socket.emit(
      'join-room',
      { playerName: playerName.trim(), roomCode: roomCode.trim().toUpperCase() },
      (response) => {
        setLoading(false)
        if (response?.error) {
          toast.error(response.error)
        } else {
          navigate('/lobby')
        }
      }
    )
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center py-8 relative overflow-x-hidden overflow-y-auto"
      style={{
        background: 'radial-gradient(ellipse at center, #0e4a2e 0%, #0A3622 35%, #072818 70%, #051a10 100%)',
      }}
    >
      {/* Decorative suit symbols */}
      {suitSymbols.map((s, i) => (
        <motion.div
          key={i}
          className="absolute pointer-events-none select-none"
          style={{
            left: s.x,
            top: s.y,
            fontSize: s.size,
            color: s.color,
            opacity: s.opacity ?? 0.15,
          }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{
            opacity: s.opacity ?? 0.15,
            scale: 1,
            rotate: s.rotate,
            y: [0, -8, 0],
          }}
          transition={{
            duration: 4,
            delay: i * 0.2,
            y: { repeat: Infinity, duration: 3 + i * 0.5, ease: 'easeInOut' },
          }}
        >
          {s.symbol}
        </motion.div>
      ))}

      {/* Main content */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-6 sm:gap-8 w-full max-w-md px-4 sm:px-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
      >
        {/* Title */}
        <div className="text-center">
          <motion.div
            className="flex items-center justify-center gap-3 mb-2"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          >
            <span className="text-3xl opacity-60" style={{ color: 'var(--gold)' }}>{'\u2660'}</span>
            <span className="text-3xl opacity-60" style={{ color: 'var(--card-red)' }}>{'\u2665'}</span>
          </motion.div>

          <motion.h1
            className="text-4xl sm:text-6xl font-bold tracking-wider mb-3"
            style={{
              color: 'var(--gold)',
              textShadow: '0 2px 20px rgba(212, 175, 55, 0.3), 0 1px 5px rgba(0,0,0,0.5)',
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
          >
            {APP_NAME}
          </motion.h1>

          <motion.p
            className="text-lg opacity-70 tracking-wide"
            style={{ color: '#b8c4bc' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            transition={{ delay: 0.5, duration: 0.6 }}
          >
            {APP_TAGLINE}
          </motion.p>

          <motion.div
            className="flex items-center justify-center gap-3 mt-2"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4, duration: 0.6 }}
          >
            <span className="text-3xl opacity-60" style={{ color: 'var(--card-red)' }}>{'\u2666'}</span>
            <span className="text-3xl opacity-60" style={{ color: 'var(--gold)' }}>{'\u2663'}</span>
          </motion.div>
        </div>

        {/* Form */}
        <motion.div
          className="w-full flex flex-col gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          {/* Name input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Enter your name"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={20}
              className="w-full px-5 py-3.5 rounded-xl bg-black/30 text-white placeholder-white/40
                outline-none text-lg tracking-wide transition-all duration-300
                border border-white/10 focus:border-[var(--gold)] focus:shadow-[0_0_20px_rgba(212,175,55,0.15)]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !showJoin) handleCreateRoom()
                if (e.key === 'Enter' && showJoin) handleJoinRoom()
              }}
            />
          </div>

          {/* Player count selector */}
          <div className="flex items-center justify-center gap-2">
            <span className="text-sm opacity-50 mr-1">Players:</span>
            {[2, 3, 4, 5].map((n) => (
              <motion.button
                key={n}
                onClick={() => setMaxPlayers(n)}
                className={`w-10 h-10 rounded-lg font-bold text-sm transition-all ${
                  maxPlayers === n
                    ? 'text-black'
                    : 'bg-white/5 text-white/80 hover:bg-white/10 border border-white/10'
                }`}
                style={
                  maxPlayers === n
                    ? { background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }
                    : {}
                }
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                {n}
              </motion.button>
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            <motion.button
              onClick={handleCreateRoom}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-semibold
                text-black text-lg transition-all duration-300 disabled:opacity-50"
              style={{
                background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
                boxShadow: '0 4px 15px rgba(212, 175, 55, 0.3)',
              }}
              whileHover={{ scale: 1.02, boxShadow: '0 6px 20px rgba(212, 175, 55, 0.4)' }}
              whileTap={{ scale: 0.98 }}
            >
              <Sparkles size={20} />
              Create Room
            </motion.button>

            <motion.button
              onClick={() => setShowJoin(!showJoin)}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl font-semibold
                text-lg transition-all duration-300"
              style={{
                color: 'var(--gold)',
                border: '2px solid var(--gold)',
                background: showJoin ? 'rgba(212, 175, 55, 0.1)' : 'transparent',
              }}
              whileHover={{ scale: 1.02, background: 'rgba(212, 175, 55, 0.1)' }}
              whileTap={{ scale: 0.98 }}
            >
              <LogIn size={20} />
              Join Room
            </motion.button>
          </div>

          {/* Join room input */}
          <AnimatePresence>
            {showJoin && (
              <motion.div
                className="flex gap-3"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
              >
                <input
                  type="text"
                  placeholder="Room Code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
                  maxLength={6}
                  className="flex-1 px-5 py-3.5 rounded-xl bg-black/30 text-white placeholder-white/40
                    outline-none text-lg tracking-[0.3em] text-center font-mono uppercase
                    border border-white/10 focus:border-[var(--gold)] focus:shadow-[0_0_20px_rgba(212,175,55,0.15)]
                    transition-all duration-300"
                  onKeyDown={(e) => e.key === 'Enter' && handleJoinRoom()}
                  autoFocus
                />
                <motion.button
                  onClick={handleJoinRoom}
                  disabled={loading}
                  className="px-6 py-3.5 rounded-xl font-semibold text-black transition-all duration-300
                    disabled:opacity-50"
                  style={{
                    background: 'linear-gradient(135deg, var(--gold) 0%, var(--gold-light) 100%)',
                  }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <Users size={20} />
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Footer info */}
        <motion.p
          className="text-sm opacity-30 mt-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          transition={{ delay: 1, duration: 0.6 }}
        >
          2-5 Players &middot; 5 Rounds &middot; Spades are Trump
        </motion.p>
      </motion.div>
    </div>
  )
}
