import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { useGame } from '../context/GameContext'
import { useSocket } from '../context/SocketContext'
import GameBoard from '../components/game/GameBoard'
import BiddingPanel from '../components/game/BiddingPanel'
import RoundScoreModal from '../components/game/RoundScoreModal'
import GameOverModal from '../components/game/GameOverModal'

export default function GamePage() {
  const navigate = useNavigate()
  const { state } = useGame()
  const { roomCode: socketRoomCode, rejoinGame, isConnected } = useSocket()
  const reconnectAttemptedRef = useRef(false)

  const isGamePhase = (
    state.phase === 'GAME_STARTING'
    || state.phase === 'BIDDING'
    || state.phase === 'PLAYING'
    || state.phase === 'ROUND_END'
    || state.phase === 'GAME_OVER'
  )
  const hasRoomContext = Boolean(state.roomCode || socketRoomCode)
  const hasPlayers = state.players.length > 0

  // Navigate back if not in a game
  useEffect(() => {
    if (state.phase === 'LANDING' && !state.roomCode) {
      navigate('/')
    }
  }, [state.phase, state.roomCode, navigate])

  // Defensive native recovery: if game route opens without players, attempt one rejoin.
  useEffect(() => {
    if (!isConnected || !hasRoomContext || hasPlayers || reconnectAttemptedRef.current) return
    reconnectAttemptedRef.current = true
    rejoinGame(state.roomCode || socketRoomCode)
  }, [isConnected, hasRoomContext, hasPlayers, rejoinGame, state.roomCode, socketRoomCode])

  if (hasRoomContext && isGamePhase && !hasPlayers) {
    return (
      <div
        className="w-screen h-[100dvh] overflow-hidden relative flex items-center justify-center px-6"
        style={{
          background: 'radial-gradient(ellipse at center, #0e4a2e 0%, #0A3622 35%, #072818 70%, #051a10 100%)',
        }}
      >
        <div className="glass-panel w-full max-w-sm p-5 text-center">
          <p className="text-sm uppercase tracking-widest opacity-55">Reconnecting</p>
          <p className="mt-2 text-base">Restoring room state...</p>
          <button
            type="button"
            onClick={() => navigate('/lobby')}
            className="mt-4 px-4 py-2 rounded-lg text-black font-semibold"
            style={{ background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' }}
          >
            Back to Lobby
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-screen h-[100dvh] overflow-hidden relative">
      <GameBoard />

      <AnimatePresence>
        {state.phase === 'BIDDING' && <BiddingPanel key="bidding" />}
      </AnimatePresence>

      <AnimatePresence>
        {state.phase === 'ROUND_END' && <RoundScoreModal key="round-end" />}
      </AnimatePresence>

      <AnimatePresence>
        {state.phase === 'GAME_OVER' && <GameOverModal key="game-over" />}
      </AnimatePresence>
    </div>
  )
}
