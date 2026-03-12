import { useMemo, useCallback } from 'react'
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
  5: ['bottom', 'bottom-left', 'top-left', 'top', 'top-right'],
}

const POSITION_STYLES = {
  compactPortrait: {
    top: 'absolute top-[124px] left-1/2 -translate-x-1/2 z-20',
    left: 'absolute left-1 top-[48%] -translate-y-1/2 z-20',
    right: 'absolute right-1 top-[48%] -translate-y-1/2 z-20',
    'top-left': 'absolute top-[104px] left-[5%] z-20',
    'top-right': 'absolute top-[104px] right-[5%] z-20',
    'bottom-left': 'absolute bottom-[164px] left-[5%] z-20',
    'bottom-right': 'absolute bottom-[164px] right-[5%] z-20',
  },
  compactLandscape: {
    top: 'absolute top-[66px] left-1/2 -translate-x-1/2 z-20',
    left: 'absolute left-1 top-[45%] -translate-y-1/2 z-20',
    right: 'absolute right-1 top-[45%] -translate-y-1/2 z-20',
    'top-left': 'absolute top-[72px] left-[12%] z-20',
    'top-right': 'absolute top-[72px] right-[12%] z-20',
    'bottom-left': 'absolute bottom-[112px] left-[12%] z-20',
    'bottom-right': 'absolute bottom-[112px] right-[12%] z-20',
  },
  medium: {
    top: 'absolute top-[102px] left-1/2 -translate-x-1/2 z-20',
    left: 'absolute left-3 top-[46%] -translate-y-1/2 z-20',
    right: 'absolute right-3 top-[46%] -translate-y-1/2 z-20',
    'top-left': 'absolute top-[110px] left-[15%] z-20',
    'top-right': 'absolute top-[110px] right-[15%] z-20',
    'bottom-left': 'absolute bottom-[180px] left-[15%] z-20',
    'bottom-right': 'absolute bottom-[180px] right-[15%] z-20',
  },
  wide: {
    top: 'absolute top-[112px] left-1/2 -translate-x-1/2 z-20',
    left: 'absolute left-6 top-[47%] -translate-y-1/2 z-20',
    right: 'absolute right-6 top-[47%] -translate-y-1/2 z-20',
    'top-left': 'absolute top-[118px] left-[18%] z-20',
    'top-right': 'absolute top-[118px] right-[18%] z-20',
    'bottom-left': 'absolute bottom-[198px] left-[18%] z-20',
    'bottom-right': 'absolute bottom-[198px] right-[18%] z-20',
  },
}

export default function GameBoard() {
  const navigate = useNavigate()
  const { socket, setPlayerId, setRoomCode } = useSocket()
  const { state, dispatch } = useGame()
  const {
    players,
    playerId,
    currentTurn,
    currentRound,
    currentTrick,
    roomCode,
    phase,
  } = state
  const {
    layoutTier,
    stationDensity,
    width,
  } = useOrientation()
  const voiceChat = useVoiceChatContext()
  const { speakingPeers, isSelfSpeaking } = voiceChat

  const handleLeaveRoom = useCallback(() => {
    if (!socket) return
    socket.emit('leave-room')
    dispatch({ type: 'RESET' })
    setPlayerId(null)
    setRoomCode(null)
    navigate('/')
  }, [socket, dispatch, setPlayerId, setRoomCode, navigate])

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
  const phaseLabel = phase === 'BIDDING' ? 'Bidding' : phase === 'PLAYING' ? 'Live trick' : 'Starting'
  const isCompactLandscape = layoutTier === 'compactLandscape'
  const isCompactPortrait = layoutTier === 'compactPortrait'
  const showRoomCode = !isCompactLandscape || width > 760
  const showBottomStation = Boolean(bottomPlayer) && phase !== 'BIDDING'
  const opponentDensity = isCompactLandscape || (isCompactPortrait && players.length >= 5)
    ? 'compact'
    : stationDensity
  const boardVars = {
    '--game-summary-max': isCompactLandscape
      ? 'min(72vw, 280px)'
      : isCompactPortrait
        ? 'min(88vw, 320px)'
        : layoutTier === 'wide'
          ? 'min(34vw, 380px)'
          : 'min(72vw, 340px)',
    '--game-center-card-max': isCompactLandscape
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
  }
  const tableFrameClass = {
    compactPortrait: 'w-[min(88vw,360px)] h-[min(34vh,248px)]',
    compactLandscape: 'w-[min(72vw,420px)] h-[min(44vh,228px)]',
    medium: 'w-[min(64vw,560px)] h-[min(44vh,340px)]',
    wide: 'w-[min(52vw,620px)] h-[min(46vh,390px)]',
  }[layoutTier]
  const centerRingSize = {
    compactPortrait: '104px',
    compactLandscape: '88px',
    medium: '118px',
    wide: '136px',
  }[layoutTier]
  const turnBannerTop = {
    compactPortrait: 'calc(50% - 146px)',
    compactLandscape: 'calc(50% - 120px)',
    medium: 'calc(50% - 158px)',
    wide: 'calc(50% - 176px)',
  }[layoutTier]
  const bottomStationBottom = {
    compactPortrait: 'calc(var(--game-safe-bottom) + 148px)',
    compactLandscape: 'calc(var(--game-safe-bottom) + 108px)',
    medium: 'calc(var(--game-safe-bottom) + 162px)',
    wide: 'calc(var(--game-safe-bottom) + 176px)',
  }[layoutTier]
  const positionClasses = POSITION_STYLES[layoutTier] || POSITION_STYLES.medium

  return (
    <div className="game-shell felt-bg" style={boardVars}>
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-32 bg-[linear-gradient(180deg,rgba(0,0,0,0.34),transparent)]" />
        <div className="absolute inset-x-0 bottom-0 h-44 bg-[linear-gradient(0deg,rgba(0,0,0,0.4),transparent)]" />
        <motion.div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[42%] border ${tableFrameClass}`}
          style={{
            borderColor: 'rgba(212, 175, 55, 0.18)',
            background: 'radial-gradient(circle at center, rgba(17, 91, 57, 0.56) 0%, rgba(9, 50, 31, 0.28) 58%, rgba(0, 0, 0, 0) 100%)',
            boxShadow: '0 0 0 1px rgba(255,255,255,0.03), inset 0 0 54px rgba(0,0,0,0.2), 0 42px 120px rgba(0,0,0,0.25)',
          }}
          animate={{ scale: [1, 1.015, 1], opacity: [0.92, 1, 0.92] }}
          transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div
          className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-[42%] border border-dashed ${tableFrameClass}`}
          style={{ borderColor: 'rgba(212, 175, 55, 0.12)' }}
        />
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border"
          style={{
            width: centerRingSize,
            height: centerRingSize,
            borderColor: 'rgba(212, 175, 55, 0.14)',
            boxShadow: '0 0 30px rgba(212, 175, 55, 0.08)',
          }}
        />
      </div>

      <div
        className="absolute inset-x-0 z-30 px-[var(--game-shell-x)]"
        style={{ top: 'calc(var(--game-safe-top) + var(--game-shell-top-gap))' }}
      >
        <div className="game-shell-lane grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 sm:gap-3">
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
            <div className="game-hud-surface rounded-2xl px-1.5 py-1.5 sm:px-2 sm:py-2">
              <VoiceChat voiceChat={voiceChat} />
            </div>
          </div>

          <div className="min-w-0 justify-self-center">
            <div className="game-hud-surface game-summary-card px-3 py-2.5 text-center sm:px-4 sm:py-3">
              <div className="flex items-center justify-center gap-2 text-[9px] uppercase tracking-[0.26em] sm:text-[10px]">
                <span className="game-pill px-2 py-0.5">{phaseLabel}</span>
                {showRoomCode && roomCode && (
                  <span className="max-w-[118px] truncate opacity-45 sm:max-w-none">Table {roomCode}</span>
                )}
              </div>
              <div className="mt-2 flex items-center justify-center gap-4 sm:gap-6">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.24em] opacity-45 sm:text-[10px]">Round</p>
                  <p className="mt-1 text-sm font-semibold text-gold sm:text-base">{currentRound || 1}</p>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div>
                  <p className="text-[9px] uppercase tracking-[0.24em] opacity-45 sm:text-[10px]">Trick</p>
                  <p className="mt-1 text-sm font-semibold text-gold sm:text-base">{(currentTrick || 0) + 1}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="justify-self-end">
            <ScoreBoard layoutTier={layoutTier} />
          </div>
        </div>
      </div>

      {opponents.map((player) => (
        <div key={player.id} className={positionClasses[player.position] || positionClasses.top}>
          <PlayerStation
            player={player}
            isCurrentTurn={currentTurn === player.id}
            isSelf={false}
            isSpeaking={speakingPeers.has(player.id)}
            density={opponentDensity}
          />
        </div>
      ))}

      {phase === 'PLAYING' && currentTurn && (
        <div className="absolute left-1/2 z-20 -translate-x-1/2" style={{ top: turnBannerTop }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTurn}
              className="game-turn-banner rounded-[20px] border px-3 py-1.5 text-center text-xs font-medium sm:px-4 sm:py-2 sm:text-sm"
              style={{
                background: currentTurn === playerId
                  ? 'linear-gradient(135deg, rgba(240, 208, 96, 0.98), rgba(212, 175, 55, 0.95))'
                  : 'linear-gradient(180deg, rgba(8, 42, 26, 0.92), rgba(4, 22, 14, 0.96))',
                color: currentTurn === playerId ? '#000' : 'var(--gold)',
                borderColor: 'rgba(212, 175, 55, 0.45)',
                boxShadow: currentTurn === playerId
                  ? '0 10px 30px rgba(212, 175, 55, 0.34)'
                  : '0 10px 24px rgba(0, 0, 0, 0.22)',
              }}
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ duration: 0.22 }}
            >
              <div className="text-[9px] uppercase tracking-[0.24em] opacity-65 sm:text-[10px]">
                {currentTurn === playerId ? 'Now playing' : 'Turn'}
              </div>
              <span className="block truncate">
                {currentTurn === playerId
                  ? 'Your turn'
                  : `${players.find((player) => player.id === currentTurn)?.name || 'Player'}'s turn`}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      <div className="absolute inset-0 z-10 flex items-center justify-center px-[var(--game-shell-x)] pb-[120px] pt-[94px] sm:pb-[136px]">
        <div className="game-center-card flex justify-center">
          <TrickArea positionedPlayers={positionedPlayers} />
        </div>
      </div>

      {showBottomStation && (
        <div className="absolute left-1/2 z-20 -translate-x-1/2" style={{ bottom: bottomStationBottom }}>
          <PlayerStation
            player={bottomPlayer}
            isCurrentTurn={currentTurn === bottomPlayer.id}
            isSelf={true}
            isSpeaking={isSelfSpeaking}
            density={layoutTier === 'wide' ? 'expanded' : 'standard'}
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
