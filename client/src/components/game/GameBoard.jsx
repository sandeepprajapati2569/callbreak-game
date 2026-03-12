import { useMemo, useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { LogOut } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import { useVoiceChatContext } from '../../context/VoiceChatContext'
import { useOrientation } from '../../hooks/useOrientation'
import PlayerHand from './PlayerHand'
import PlayerStation from './PlayerStation'
import TrickArea from './TrickArea'
import ScoreBoard from './ScoreBoard'
import VoiceChat from './VoiceChat'

const POSITION_MAPS = {
  2: ['bottom', 'top'],
  3: ['bottom', 'top-left', 'top-right'],
  4: ['bottom', 'left', 'top', 'right'],
  5: ['bottom', 'left', 'top-left', 'top-right', 'right'],
}

export default function GameBoard() {
  const navigate = useNavigate()
  const { socket, setPlayerId, setRoomCode } = useSocket()
  const { state, dispatch } = useGame()
  const {
    players,
    playerId,
    currentTurn,
    phase,
  } = state
  const {
    layoutTier,
    stationDensity,
  } = useOrientation()
  const voiceChat = useVoiceChatContext()
  const { speakingPeers, isSelfSpeaking } = voiceChat
  const [expandedPlayerId, setExpandedPlayerId] = useState(null)

  const handleLeaveRoom = useCallback(() => {
    if (!socket) return
    socket.emit('leave-room')
    dispatch({ type: 'RESET' })
    setPlayerId(null)
    setRoomCode(null)
    navigate('/')
  }, [socket, dispatch, setPlayerId, setRoomCode, navigate])

  useEffect(() => {
    if (expandedPlayerId && !players.some((player) => player.id === expandedPlayerId)) {
      setExpandedPlayerId(null)
    }
  }, [expandedPlayerId, players])

  const handleToggleStationDetails = useCallback((id) => {
    setExpandedPlayerId((current) => (current === id ? null : id))
  }, [])

  const mySeatIndex = useMemo(() => {
    return players.findIndex((player) => player.id === playerId)
  }, [playerId, players])

  const positionedPlayers = useMemo(() => {
    if (mySeatIndex === -1 || players.length === 0) return []
    const positions = POSITION_MAPS[players.length] || POSITION_MAPS[4]

    return players.map((player, seatIndex) => {
      const relativePos = (seatIndex - mySeatIndex + players.length) % players.length
      return {
        ...player,
        position: positions[relativePos],
        seatIndex,
        relativeIndex: relativePos,
      }
    })
  }, [mySeatIndex, players])

  const bottomPlayer = positionedPlayers.find((player) => player.position === 'bottom')
  const opponents = positionedPlayers.filter((player) => player.position !== 'bottom')
  const isCompactLandscape = layoutTier === 'compactLandscape'
  const isCompactPortrait = layoutTier === 'compactPortrait'
  const isHeadToHead = players.length <= 2
  const isHeadToHeadPortrait = isHeadToHead && isCompactPortrait
  const showBottomStation = Boolean(bottomPlayer) && phase !== 'BIDDING'
  const opponentDensity = isHeadToHeadPortrait
    ? 'expanded'
    : isCompactLandscape || (isCompactPortrait && players.length >= 5)
    ? 'compact'
    : stationDensity
  const boardVars = {
    '--game-center-card-max': isHeadToHeadPortrait
      ? 'min(84vw, 308px)'
      : isCompactLandscape
      ? 'min(72vw, 360px)'
      : isCompactPortrait
        ? 'min(88vw, 320px)'
        : layoutTier === 'wide'
          ? 'min(48vw, 500px)'
          : 'min(76vw, 420px)',
    '--game-hand-tray-max': layoutTier === 'wide' ? '980px' : layoutTier === 'medium' ? '860px' : '100%',
    '--game-hud-overlay-top': isCompactLandscape
      ? 'calc(var(--game-safe-top) + 60px)'
      : 'calc(var(--game-safe-top) + 72px)',
    '--game-playfield-top-inset': {
      compactPortrait: 'calc(var(--game-safe-top) + 106px)',
      compactLandscape: 'calc(var(--game-safe-top) + 84px)',
      medium: 'calc(var(--game-safe-top) + 112px)',
      wide: 'calc(var(--game-safe-top) + 118px)',
    }[layoutTier],
    '--game-playfield-bottom-inset': {
      compactPortrait: isHeadToHeadPortrait
        ? 'calc(var(--game-safe-bottom) + 188px)'
        : 'calc(var(--game-safe-bottom) + 198px)',
      compactLandscape: 'calc(var(--game-safe-bottom) + 136px)',
      medium: 'calc(var(--game-safe-bottom) + 208px)',
      wide: 'calc(var(--game-safe-bottom) + 222px)',
    }[layoutTier],
    '--game-playfield-center-y': 'calc(50% + (var(--game-playfield-top-inset) - var(--game-playfield-bottom-inset)) / 2)',
  }
  const tableFrameClass = isHeadToHeadPortrait
    ? 'w-[min(88vw,334px)] h-[min(28vh,214px)]'
    : {
        compactPortrait: 'w-[min(88vw,332px)] h-[min(28vh,212px)]',
        compactLandscape: 'w-[min(72vw,392px)] h-[min(40vh,206px)]',
        medium: 'w-[min(64vw,508px)] h-[min(38vh,284px)]',
        wide: 'w-[min(52vw,568px)] h-[min(40vh,328px)]',
      }[layoutTier]
  const bottomStationDensity = isHeadToHeadPortrait ? 'expanded' : layoutTier === 'wide' ? 'expanded' : 'standard'
  const orbitMetrics = {
    compactPortrait: isHeadToHeadPortrait
      ? { width: 324, height: 210, horizontal: 162, vertical: 105, cornerX: 98 }
      : { width: 316, height: 208, horizontal: 158, vertical: 104, cornerX: 92 },
    compactLandscape: { width: 392, height: 206, horizontal: 196, vertical: 103, cornerX: 112 },
    medium: { width: 508, height: 284, horizontal: 254, vertical: 142, cornerX: 150 },
    wide: { width: 568, height: 328, horizontal: 284, vertical: 164, cornerX: 168 },
  }[layoutTier]
  const tableOrbitStyle = orbitMetrics
    ? {
        width: `${orbitMetrics.width}px`,
        height: `${orbitMetrics.height}px`,
      }
    : undefined

  const getPlayerPositionConfig = (position) => {
    const centeredAnchor = 'absolute left-1/2 -translate-x-1/2 -translate-y-1/2 z-20'

    if (orbitMetrics) {
      const orbitAnchors = {
        top: {
          className: centeredAnchor,
          style: { top: `calc(var(--game-playfield-center-y) - ${orbitMetrics.vertical}px)` },
        },
        bottom: {
          className: centeredAnchor,
          style: { top: `calc(var(--game-playfield-center-y) + ${orbitMetrics.vertical}px)` },
        },
        left: {
          className: centeredAnchor,
          style: { left: `calc(50% - ${orbitMetrics.horizontal}px)`, top: 'var(--game-playfield-center-y)' },
        },
        right: {
          className: centeredAnchor,
          style: { left: `calc(50% + ${orbitMetrics.horizontal}px)`, top: 'var(--game-playfield-center-y)' },
        },
        'top-left': {
          className: centeredAnchor,
          style: { left: `calc(50% - ${orbitMetrics.cornerX}px)`, top: `calc(var(--game-playfield-center-y) - ${orbitMetrics.vertical}px)` },
        },
        'top-right': {
          className: centeredAnchor,
          style: { left: `calc(50% + ${orbitMetrics.cornerX}px)`, top: `calc(var(--game-playfield-center-y) - ${orbitMetrics.vertical}px)` },
        },
      }

      if (orbitAnchors[position]) {
        return orbitAnchors[position]
      }
    }
    return {
      className: centeredAnchor,
      style: { top: 'var(--game-playfield-center-y)' },
    }
  }

  return (
    <div className="game-shell felt-bg" style={boardVars}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,rgba(0,0,0,0.34),transparent)]" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(0deg,rgba(0,0,0,0.4),transparent)]" />
        <motion.div
          className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[34px] border ${tableFrameClass}`}
          style={{
            ...tableOrbitStyle,
            top: 'var(--game-playfield-center-y)',
            borderColor: 'rgba(212, 175, 55, 0.18)',
            background: 'radial-gradient(circle at center, rgba(17, 91, 57, 0.56) 0%, rgba(9, 50, 31, 0.28) 58%, rgba(0, 0, 0, 0) 100%)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.03), inset 0 0 54px rgba(0,0,0,0.2), 0 42px 120px rgba(0,0,0,0.25)',
          }}
          animate={{ scale: [1, 1.015, 1], opacity: [0.92, 1, 0.92] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[34px] border border-dashed ${tableFrameClass}`}
          style={{
            ...tableOrbitStyle,
            top: 'var(--game-playfield-center-y)',
            borderColor: 'rgba(212, 175, 55, 0.12)',
          }}
        />
      </div>

      <div
        className="absolute inset-x-0 z-30 px-[var(--game-shell-x)]"
        style={{ top: 'calc(var(--game-safe-top) + var(--game-shell-top-gap))' }}
      >
        <div className="game-shell-lane flex items-center justify-between gap-2 sm:gap-3">
          <div className="flex items-center gap-2 justify-self-start">
            <motion.button
              onClick={handleLeaveRoom}
              className="game-icon-button text-red-300/75 hover:text-red-300 hover:bg-red-500/10 transition-all"
              style={{
                background: 'linear-gradient(180deg, rgba(65, 16, 16, 0.92), rgba(33, 10, 10, 0.92))',
                borderColor: 'rgba(239, 68, 68, 0.18)',
              }}
              whileTap={{ scale: 0.9 }}
              title="Leave game"
            >
              <LogOut size={14} />
            </motion.button>
            <VoiceChat voiceChat={voiceChat} />
          </div>

          <div className="justify-self-end">
            <ScoreBoard layoutTier={layoutTier} />
          </div>
        </div>
      </div>

      {opponents.map((player) => {
        const positionConfig = getPlayerPositionConfig(player.position)
        const compactTopLabel = (
          layoutTier === 'compactPortrait' || layoutTier === 'compactLandscape'
        ) && (player.position === 'top' || player.position === 'top-left' || player.position === 'top-right')

        return (
        <div key={player.id} className={positionConfig.className} style={positionConfig.style}>
          <PlayerStation
            player={player}
            isCurrentTurn={currentTurn === player.id}
            isSelf={false}
            isSpeaking={speakingPeers.has(player.id)}
            density={opponentDensity}
            isExpanded={expandedPlayerId === player.id}
            onToggleDetails={handleToggleStationDetails}
            namePlacement={compactTopLabel ? 'above' : 'below'}
          />
        </div>
      )})}

      <div
        className="absolute left-1/2 z-10 -translate-x-1/2 -translate-y-1/2 px-[var(--game-shell-x)]"
        style={{ top: 'var(--game-playfield-center-y)' }}
      >
        <div className="game-center-card flex justify-center">
          <TrickArea positionedPlayers={positionedPlayers} playerCount={players.length} />
        </div>
      </div>

      {showBottomStation && (
        <div
          className={getPlayerPositionConfig('bottom').className}
          style={getPlayerPositionConfig('bottom').style}
        >
          <PlayerStation
            player={bottomPlayer}
            isCurrentTurn={currentTurn === bottomPlayer.id}
            isSelf={true}
            isSpeaking={isSelfSpeaking}
            density={bottomStationDensity}
            isExpanded={expandedPlayerId === bottomPlayer.id}
            onToggleDetails={handleToggleStationDetails}
          />
        </div>
      )}

      <div className="absolute inset-x-0 bottom-0 z-20 px-[var(--game-shell-x)]">
        <PlayerHand />
      </div>

      {players.length === 0 && (
        <div className="absolute inset-0 z-40 flex items-center justify-center px-6">
          <div className="game-floating-sheet w-full max-w-sm rounded-[28px] p-5 text-center">
            <p className="text-sm uppercase tracking-widest opacity-55">Connecting</p>
            <p className="mt-2 text-sm sm:text-base">Waiting for room data...</p>
          </div>
        </div>
      )}
    </div>
  )
}
