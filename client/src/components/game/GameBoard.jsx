import { useMemo } from 'react'
import { useGame } from '../../context/GameContext'
import PlayerHand from './PlayerHand'
import PlayerStation from './PlayerStation'
import TrickArea from './TrickArea'
import ScoreBoard from './ScoreBoard'

export default function GameBoard() {
  const { state } = useGame()
  const { players, playerId, currentTurn, currentRound, currentTrick, bids, phase } = state

  // Find current player's seat index
  const mySeatIndex = useMemo(() => {
    return players.findIndex((p) => p.id === playerId)
  }, [players, playerId])

  // Get relative positions: 0=bottom(self), 1=left, 2=top, 3=right
  const positionedPlayers = useMemo(() => {
    if (mySeatIndex === -1 || players.length === 0) return []
    const positions = ['bottom', 'left', 'top', 'right']
    return players.map((player, seatIndex) => {
      const relativePos = (seatIndex - mySeatIndex + 4) % 4
      return {
        ...player,
        position: positions[relativePos],
        seatIndex,
        relativeIndex: relativePos,
      }
    })
  }, [players, mySeatIndex])

  const topPlayer = positionedPlayers.find((p) => p.position === 'top')
  const leftPlayer = positionedPlayers.find((p) => p.position === 'left')
  const rightPlayer = positionedPlayers.find((p) => p.position === 'right')
  const bottomPlayer = positionedPlayers.find((p) => p.position === 'bottom')

  return (
    <div className="w-full h-full felt-bg relative flex items-center justify-center">
      {/* Trump indicator - top left */}
      <div className="absolute top-4 left-4 z-20 glass-panel px-3 py-2 flex items-center gap-2">
        <span className="text-2xl" style={{ color: 'var(--gold)' }}>
          {'\u2660'}
        </span>
        <span className="text-xs uppercase tracking-wider opacity-60">Trump</span>
      </div>

      {/* Round / Trick counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 glass-panel px-4 py-2 text-center">
        <span className="text-xs uppercase tracking-wider opacity-50">Round </span>
        <span className="text-gold font-bold">{currentRound || 1}</span>
        <span className="text-xs uppercase tracking-wider opacity-50 ml-3">Trick </span>
        <span className="text-gold font-bold">{(currentTrick || 0) + 1}</span>
      </div>

      {/* ScoreBoard - top right */}
      <div className="absolute top-4 right-4 z-20">
        <ScoreBoard />
      </div>

      {/* Top player */}
      {topPlayer && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 mt-12 z-10">
          <PlayerStation
            player={topPlayer}
            position="top"
            isCurrentTurn={currentTurn === topPlayer.id}
            isSelf={false}
          />
        </div>
      )}

      {/* Left player */}
      {leftPlayer && (
        <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10">
          <PlayerStation
            player={leftPlayer}
            position="left"
            isCurrentTurn={currentTurn === leftPlayer.id}
            isSelf={false}
          />
        </div>
      )}

      {/* Right player */}
      {rightPlayer && (
        <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10">
          <PlayerStation
            player={rightPlayer}
            position="right"
            isCurrentTurn={currentTurn === rightPlayer.id}
            isSelf={false}
          />
        </div>
      )}

      {/* Trick area - center */}
      <div className="z-10">
        <TrickArea positionedPlayers={positionedPlayers} />
      </div>

      {/* Bottom player station (current user info, above hand) */}
      {bottomPlayer && (
        <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-10">
          <PlayerStation
            player={bottomPlayer}
            position="bottom"
            isCurrentTurn={currentTurn === bottomPlayer.id}
            isSelf={true}
          />
        </div>
      )}

      {/* Player hand - bottom */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        <PlayerHand />
      </div>
    </div>
  )
}
