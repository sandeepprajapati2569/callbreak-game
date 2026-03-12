import { useState, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Clock, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import { useVoiceChatContext } from '../../context/VoiceChatContext'
import { useOrientation } from '../../hooks/useOrientation'
import VoiceChat from '../game/VoiceChat'
import Card, { SUIT_SYMBOLS } from '../game/Card'

const PLAY_CARD_ACK_TIMEOUT_MS = 7000
const DONKEY_WORD = 'DONKEY'

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
    'top-left': 'absolute top-[102px] left-[5%] z-20',
    'top-right': 'absolute top-[102px] right-[5%] z-20',
    'bottom-left': 'absolute bottom-[160px] left-[5%] z-20',
    'bottom-right': 'absolute bottom-[160px] right-[5%] z-20',
  },
  compactLandscape: {
    top: 'absolute top-[66px] left-1/2 -translate-x-1/2 z-20',
    left: 'absolute left-1 top-[50%] -translate-y-1/2 z-20',
    right: 'absolute right-1 top-[50%] -translate-y-1/2 z-20',
    'top-left': 'absolute top-[70px] left-[8%] z-20',
    'top-right': 'absolute top-[70px] right-[8%] z-20',
    'bottom-left': 'absolute bottom-[108px] left-[12%] z-20',
    'bottom-right': 'absolute bottom-[108px] right-[12%] z-20',
  },
  medium: {
    top: 'absolute top-[102px] left-1/2 -translate-x-1/2 z-20',
    left: 'absolute left-3 top-[46%] -translate-y-1/2 z-20',
    right: 'absolute right-3 top-[46%] -translate-y-1/2 z-20',
    'top-left': 'absolute top-[110px] left-[15%] z-20',
    'top-right': 'absolute top-[110px] right-[15%] z-20',
    'bottom-left': 'absolute bottom-[176px] left-[15%] z-20',
    'bottom-right': 'absolute bottom-[176px] right-[15%] z-20',
  },
  wide: {
    top: 'absolute top-[112px] left-1/2 -translate-x-1/2 z-20',
    left: 'absolute left-6 top-[47%] -translate-y-1/2 z-20',
    right: 'absolute right-6 top-[47%] -translate-y-1/2 z-20',
    'top-left': 'absolute top-[118px] left-[18%] z-20',
    'top-right': 'absolute top-[118px] right-[18%] z-20',
    'bottom-left': 'absolute bottom-[188px] left-[18%] z-20',
    'bottom-right': 'absolute bottom-[188px] right-[18%] z-20',
  },
}

const RANK_ORDER = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
}

const SUIT_ORDER = {
  spades: 0,
  hearts: 1,
  diamonds: 2,
  clubs: 3,
}

const DENSITY_STYLES = {
  compact: {
    wrapper: 'gap-1.5 px-2 py-1.5 min-w-[98px] max-w-[150px]',
    avatar: 'w-6 h-6',
    avatarText: 'text-[11px]',
    name: 'max-w-[70px] text-[9px]',
    badgeText: 'text-[8px] px-1.5 py-0.5',
  },
  standard: {
    wrapper: 'gap-2.5 px-3 py-3 min-w-[132px] max-w-[192px]',
    avatar: 'w-9 h-9',
    avatarText: 'text-sm',
    name: 'max-w-[108px] text-xs',
    badgeText: 'text-[11px] px-2 py-0.5',
  },
  expanded: {
    wrapper: 'gap-3 px-4 py-4 min-w-[152px] max-w-[220px]',
    avatar: 'w-10 h-10',
    avatarText: 'text-base',
    name: 'max-w-[126px] text-sm',
    badgeText: 'text-xs px-2.5 py-0.5',
  },
}

function sameCard(a, b) {
  if (!a || !b) return false
  return a.suit === b.suit && a.rank === b.rank
}

function formatSuit(suit) {
  if (!suit) return 'None'
  return `${SUIT_SYMBOLS[suit] || ''} ${suit}`.trim()
}

export default function DonkeyGameBoard() {
  const navigate = useNavigate()
  const { state, dispatch } = useGame()
  const { socket, isConnected, setPlayerId, setRoomCode } = useSocket()
  const voiceChat = useVoiceChatContext()
  const { layoutTier, stationDensity, width } = useOrientation()
  const [playDisabled, setPlayDisabled] = useState(false)

  const {
    myHand = [],
    donkeyPlayers = [],
    donkeyRound = 0,
    donkeyTrickNumber = 1,
    donkeyLeadSuit = null,
    donkeyTrickCards = [],
    donkeyPlayableCards = [],
    donkeyLastTrickResult = null,
    activePlayers = [],
    currentTurnPlayerId,
    isMyTurn,
    donkeyTurnTimerStart,
    donkeyTurnTimerDuration = 20000,
    donkeyTurnTimerPlayerId,
    playerId,
    phase,
    roomCode,
  } = state

  const isPlaying = phase === 'DONKEY_PLAYING'
  const isCompactLandscape = layoutTier === 'compactLandscape'
  const isCompactPortrait = layoutTier === 'compactPortrait'
  const showRoomCode = !isCompactLandscape || width > 760
  const myPlayer = donkeyPlayers.find((player) => player.id === playerId)
  const currentTurnPlayer = donkeyPlayers.find((player) => player.id === currentTurnPlayerId)
  const myLetters = myPlayer?.letters || ''

  useEffect(() => {
    if (isMyTurn) setPlayDisabled(false)
  }, [isMyTurn, donkeyTrickNumber])

  const myIdx = donkeyPlayers.findIndex((player) => player.id === playerId)
  const numPlayers = donkeyPlayers.length
  const posMap = POSITION_MAPS[numPlayers] || POSITION_MAPS[4]

  const reorderedPlayers = useMemo(() => {
    if (myIdx === -1 || numPlayers === 0) return []

    const nextPlayers = []
    for (let index = 0; index < numPlayers; index += 1) {
      const playerIndex = (myIdx + index) % numPlayers
      if (donkeyPlayers[playerIndex]) {
        nextPlayers.push({ ...donkeyPlayers[playerIndex], position: posMap[index] })
      }
    }

    return nextPlayers
  }, [donkeyPlayers, myIdx, numPlayers, posMap])

  const opponents = reorderedPlayers.filter((player) => player.id !== playerId)

  const sortedHand = useMemo(() => {
    return [...myHand].sort((a, b) => {
      const suitDiff = (SUIT_ORDER[a.suit] ?? 99) - (SUIT_ORDER[b.suit] ?? 99)
      if (suitDiff !== 0) return suitDiff
      return (RANK_ORDER[a.rank] || 0) - (RANK_ORDER[b.rank] || 0)
    })
  }, [myHand])

  const isCardPlayable = useCallback((card) => {
    if (!isMyTurn || playDisabled) return false
    return donkeyPlayableCards.some((allowed) => sameCard(allowed, card))
  }, [donkeyPlayableCards, isMyTurn, playDisabled])

  const handlePlayCard = useCallback((card) => {
    if (!socket || !isCardPlayable(card)) return
    if (!isConnected || !socket.connected) {
      toast.error('Network reconnecting. Please wait a moment.')
      return
    }

    setPlayDisabled(true)
    socket
      .timeout(PLAY_CARD_ACK_TIMEOUT_MS)
      .emit('donkey-play-card', { card }, (err, response) => {
        if (err) {
          setPlayDisabled(false)
          toast.error('Play timed out. Check internet and try again.')
          return
        }

        if (response?.success === false) {
          setPlayDisabled(false)
          toast.error(response.error || 'Unable to play this card.')
        }
      })
  }, [isCardPlayable, isConnected, socket])

  const handleLeaveRoom = useCallback(() => {
    if (socket) socket.emit('leave-room')
    dispatch({ type: 'RESET' })
    setPlayerId(null)
    setRoomCode(null)
    navigate('/')
  }, [socket, dispatch, setPlayerId, setRoomCode, navigate])

  const trickCardsWithNames = donkeyTrickCards.map((entry) => {
    const playerName = entry.playerName || donkeyPlayers.find((player) => player.id === entry.playerId)?.name || 'Player'
    return { ...entry, playerName }
  })

  const boardVars = {
    '--game-summary-max': isCompactLandscape
      ? 'min(72vw, 286px)'
      : isCompactPortrait
        ? 'min(88vw, 324px)'
        : layoutTier === 'wide'
          ? 'min(34vw, 380px)'
          : 'min(72vw, 346px)',
    '--game-center-card-max': isCompactLandscape
      ? 'min(72vw, 360px)'
      : isCompactPortrait
        ? 'min(88vw, 324px)'
        : layoutTier === 'wide'
          ? 'min(48vw, 520px)'
          : 'min(76vw, 430px)',
    '--game-hand-tray-max': layoutTier === 'wide' ? '980px' : layoutTier === 'medium' ? '860px' : '100%',
  }
  const tableFrameClass = {
    compactPortrait: 'w-[min(88vw,360px)] h-[min(34vh,248px)]',
    compactLandscape: 'w-[min(72vw,420px)] h-[min(44vh,228px)]',
    medium: 'w-[min(64vw,560px)] h-[min(44vh,340px)]',
    wide: 'w-[min(52vw,620px)] h-[min(46vh,390px)]',
  }[layoutTier]
  const turnBannerTop = {
    compactPortrait: 'calc(50% - 156px)',
    compactLandscape: 'calc(50% - 126px)',
    medium: 'calc(50% - 166px)',
    wide: 'calc(50% - 182px)',
  }[layoutTier]
  const handTrayMinHeight = {
    compactPortrait: '152px',
    compactLandscape: '104px',
    medium: '168px',
    wide: '184px',
  }[layoutTier]
  const positionClasses = POSITION_STYLES[layoutTier] || POSITION_STYLES.medium
  const centerRingSize = {
    compactPortrait: '104px',
    compactLandscape: '88px',
    medium: '118px',
    wide: '136px',
  }[layoutTier]
  const cardSizeIsCompact = layoutTier !== 'wide' || myHand.length > 10

  return (
    <div
      className="game-shell"
      style={{
        ...boardVars,
        background: 'radial-gradient(ellipse at center, #0e4a2e 0%, #0A3622 35%, #072818 70%, #051a10 100%)',
      }}
    >
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
                <span className="game-pill px-2 py-0.5">Gadha Ladan</span>
                <span className="opacity-45">{activePlayers.length} active</span>
                {showRoomCode && roomCode && <span className="max-w-[96px] truncate opacity-35">Table {roomCode}</span>}
              </div>
              <div className="mt-2 flex items-center justify-center gap-3 sm:gap-5">
                <div>
                  <p className="text-[9px] uppercase tracking-[0.24em] opacity-45 sm:text-[10px]">Round</p>
                  <p className="mt-1 text-sm font-semibold text-gold sm:text-base">{donkeyRound || 1}</p>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div>
                  <p className="text-[9px] uppercase tracking-[0.24em] opacity-45 sm:text-[10px]">Trick</p>
                  <p className="mt-1 text-sm font-semibold text-gold sm:text-base">{donkeyTrickNumber}</p>
                </div>
                <div className="h-8 w-px bg-white/10" />
                <div>
                  <p className="text-[9px] uppercase tracking-[0.24em] opacity-45 sm:text-[10px]">Lead</p>
                  <p className="mt-1 text-sm font-semibold text-gold sm:text-base">{donkeyLeadSuit ? SUIT_SYMBOLS[donkeyLeadSuit] || '-' : '-'}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="justify-self-end">
            <div className="game-hud-surface min-w-[86px] rounded-2xl px-3 py-2 text-right">
              <div className="text-[10px] uppercase tracking-[0.22em] opacity-45">Letters</div>
              <div className="mt-1 flex justify-end">
                <DonkeyLetters letters={myLetters} small />
              </div>
            </div>
          </div>
        </div>
      </div>

      {opponents.map((player) => (
        <div key={player.id} className={positionClasses[player.position] || positionClasses.top}>
          <DonkeyStation
            player={player}
            density={stationDensity}
            isActive={activePlayers.includes(player.id)}
            isCurrentTurn={currentTurnPlayerId === player.id}
            timerPlayerId={donkeyTurnTimerPlayerId}
            timerStart={donkeyTurnTimerStart}
            timerDuration={donkeyTurnTimerDuration}
          />
        </div>
      ))}

      {isPlaying && currentTurnPlayerId && (
        <div className="absolute left-1/2 z-20 -translate-x-1/2" style={{ top: turnBannerTop }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTurnPlayerId}
              className="game-turn-banner rounded-[20px] border px-3 py-1.5 text-center text-xs font-medium sm:px-4 sm:py-2 sm:text-sm"
              style={{
                background: isMyTurn
                  ? 'linear-gradient(135deg, rgba(240, 208, 96, 0.98), rgba(212, 175, 55, 0.95))'
                  : 'linear-gradient(180deg, rgba(8, 42, 26, 0.92), rgba(4, 22, 14, 0.96))',
                color: isMyTurn ? '#000' : 'var(--gold)',
                borderColor: 'rgba(212, 175, 55, 0.45)',
                boxShadow: isMyTurn
                  ? '0 10px 30px rgba(212, 175, 55, 0.34)'
                  : '0 10px 24px rgba(0, 0, 0, 0.22)',
              }}
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.9 }}
              transition={{ duration: 0.22 }}
            >
              <div className="text-[9px] uppercase tracking-[0.24em] opacity-65 sm:text-[10px]">
                {isMyTurn ? 'Now playing' : 'Turn'}
              </div>
              <span className="block truncate">
                {isMyTurn ? 'Your turn' : `${currentTurnPlayer?.name || 'Player'}'s turn`}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
      )}

      <div className="absolute inset-0 z-10 flex items-center justify-center px-[var(--game-shell-x)] pb-[112px] pt-[94px] sm:pb-[132px]">
        <div className="game-center-card">
          <motion.div
            className="game-floating-sheet relative overflow-hidden rounded-[30px] px-3 py-3 sm:px-4 sm:py-4"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.12)_0%,rgba(14,74,46,0.14)_38%,rgba(0,0,0,0)_72%)]" />
            <div className="relative z-10">
              <div className="mb-2 flex flex-wrap items-center justify-center gap-2 text-[10px] uppercase tracking-[0.22em] opacity-55 sm:text-[11px]">
                <span className="game-pill px-2 py-0.5">Trick table</span>
                {donkeyLeadSuit && <span>Lead {formatSuit(donkeyLeadSuit)}</span>}
              </div>

              {donkeyLeadSuit && isMyTurn && (
                <div className="mb-3 text-center text-[11px] text-blue-300">
                  Follow suit: {formatSuit(donkeyLeadSuit)}
                </div>
              )}

              <div
                className="rounded-[24px] border border-[rgba(212,175,55,0.14)] bg-black/14 px-3 py-4"
                style={{ boxShadow: 'inset 0 0 30px rgba(0,0,0,0.14)' }}
              >
                <div className="flex min-h-[116px] flex-wrap items-end justify-center gap-2 sm:min-h-[128px]">
                  {trickCardsWithNames.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-3">
                      <div className="flex h-16 w-12 items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/10">
                        <span className="text-xl text-white/10">{'\u2660'}</span>
                      </div>
                      <div className="mt-2 text-[10px] uppercase tracking-[0.2em] opacity-35">
                        Waiting for first play
                      </div>
                    </div>
                  ) : (
                    trickCardsWithNames.map((entry, index) => (
                      <motion.div
                        key={`${entry.playerId}-${entry.card?.suit}-${entry.card?.rank}-${index}`}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex flex-col items-center"
                      >
                        <Card suit={entry.card?.suit} rank={entry.card?.rank} faceUp small />
                        <span className="mt-1 max-w-[58px] truncate text-[10px] opacity-70">{entry.playerName}</span>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>

              {donkeyLastTrickResult && (
                <div className="mt-3 text-center text-[11px] opacity-75">
                  {donkeyLastTrickResult.wasHit
                    ? `${donkeyLastTrickResult.collectorName} collected ${donkeyLastTrickResult.collectedCount} cards`
                    : `${donkeyLastTrickResult.highestPlayerName} won the lead`}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 px-[var(--game-shell-x)]">
        <div className="game-hand-tray relative overflow-x-auto scrollbar-hide" style={{ minHeight: handTrayMinHeight, paddingBottom: isCompactLandscape ? 'max(6px, var(--game-safe-bottom))' : 'max(12px, var(--game-safe-bottom))' }}>
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 top-4 rounded-t-[30px] border"
            style={{
              borderColor: 'rgba(212, 175, 55, 0.18)',
              background: 'linear-gradient(180deg, rgba(6, 30, 19, 0.16), rgba(6, 24, 16, 0.62) 42%, rgba(4, 14, 10, 0.82) 100%)',
              boxShadow: '0 -12px 42px rgba(0,0,0,0.24)',
            }}
          />
          <div className="pointer-events-none absolute inset-x-6 top-4 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0),rgba(240,208,96,0.58),rgba(255,255,255,0))]" />
          <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2">
            <span
              className="game-pill px-3 py-1 text-[9px] uppercase tracking-[0.24em]"
              style={{
                background: 'rgba(4, 18, 12, 0.9)',
                boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
              }}
            >
              {isMyTurn ? 'Play a card' : `${myHand.length} cards in hand`}
            </span>
          </div>

          <div className="relative px-2 pb-2 pt-6 sm:px-4">
            <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
              {myHand.length === 0 && myPlayer?.isActive === false ? (
                <span className="game-pill border-green-500/20 bg-green-500/12 px-2 py-1 text-xs text-green-300">Safe</span>
              ) : (
                <span className="game-pill px-2 py-1 text-xs">{myHand.length} cards</span>
              )}
              {isMyTurn && <span className="game-pill px-2 py-1 text-xs font-semibold">Your turn</span>}
              <div className="game-hud-surface rounded-full px-2 py-1">
                <DonkeyLetters letters={myLetters} small />
              </div>
            </div>

            <div className="flex min-w-max justify-center gap-1.5">
              {sortedHand.map((card, index) => {
                const playable = isCardPlayable(card)
                return (
                  <motion.div
                    key={`${card.rank}-${card.suit}-${index}`}
                    layout
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  >
                    <Card
                      suit={card.suit}
                      rank={card.rank}
                      faceUp
                      playable={playable}
                      onClick={() => handlePlayCard(card)}
                      small={cardSizeIsCompact}
                    />
                  </motion.div>
                )
              })}
              {myHand.length === 0 && <div className="py-4 text-sm opacity-30">No cards remaining</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function DonkeyStation({ player, density = 'standard', isActive, isCurrentTurn, timerPlayerId, timerStart, timerDuration }) {
  const [timerProgress, setTimerProgress] = useState(1)
  const densityStyle = DENSITY_STYLES[density] || DENSITY_STYLES.standard
  const isCompact = density === 'compact'

  useEffect(() => {
    if (timerPlayerId !== player.id || !timerStart) {
      setTimerProgress(1)
      return
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - timerStart
      const remaining = Math.max(0, 1 - elapsed / timerDuration)
      setTimerProgress(remaining)
      if (remaining <= 0) clearInterval(interval)
    }, 100)

    return () => clearInterval(interval)
  }, [player.id, timerDuration, timerPlayerId, timerStart])

  const isSafe = !isActive && player.cardCount === 0
  const letters = player.letters || ''
  const timerSeconds = timerPlayerId === player.id && timerStart
    ? Math.ceil((timerProgress * timerDuration) / 1000)
    : 0

  return (
    <motion.div
      className={`game-hud-surface flex flex-col items-center ${densityStyle.wrapper}`}
      style={{
        borderColor: isCurrentTurn
          ? 'rgba(212, 175, 55, 0.4)'
          : isSafe
            ? 'rgba(34, 197, 94, 0.24)'
            : 'rgba(255,255,255,0.08)',
        background: isCurrentTurn
          ? 'linear-gradient(180deg, rgba(212, 175, 55, 0.14), rgba(7, 40, 24, 0.92))'
          : isSafe
            ? 'linear-gradient(180deg, rgba(12, 72, 32, 0.26), rgba(4, 22, 12, 0.92))'
            : 'linear-gradient(180deg, rgba(8, 42, 26, 0.94), rgba(4, 22, 14, 0.92))',
        opacity: isActive || isCurrentTurn || isSafe ? 1 : 0.6,
      }}
      initial={{ opacity: 0, scale: 0.82 }}
      animate={{ opacity: isActive || isCurrentTurn || isSafe ? 1 : 0.6, scale: 1 }}
    >
      <div className="relative">
        <div
          className={`${densityStyle.avatar} rounded-full flex items-center justify-center font-bold ${densityStyle.avatarText} ${
            isSafe
              ? 'bg-green-500/30 text-green-300'
              : isCurrentTurn
                ? 'text-black'
                : 'bg-white/10 text-white/80'
          }`}
          style={isCurrentTurn ? { background: 'linear-gradient(135deg, var(--gold), var(--gold-light))' } : undefined}
        >
          {isSafe ? 'S' : player.name?.[0]?.toUpperCase()}
        </div>

        {isCurrentTurn && (
          <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 36 36">
            <circle
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke={timerProgress < 0.25 ? '#ef4444' : 'rgba(212,175,55,0.6)'}
              strokeWidth="2"
              strokeDasharray={`${timerProgress * 100} 100`}
              strokeLinecap="round"
            />
          </svg>
        )}
      </div>

      <span className={`${densityStyle.name} truncate font-medium`}>{player.name}</span>
      <DonkeyLetters letters={letters} small />

      <div className={`flex flex-wrap items-center gap-1 ${isCompact ? '' : 'justify-center'}`}>
        <span className={`game-pill ${densityStyle.badgeText}`}>
          {isSafe ? 'Safe' : `${player.cardCount || 0} cards`}
        </span>
        {isCurrentTurn && (
          <span className={`rounded-full bg-[rgba(212,175,55,0.12)] text-gold ${densityStyle.badgeText}`}>
            {timerSeconds}s
          </span>
        )}
      </div>

      {isCurrentTurn && !isCompact && (
        <span className="flex items-center gap-0.5 text-[9px] font-semibold text-gold">
          <Clock size={10} />
          Playing
        </span>
      )}
    </motion.div>
  )
}

export function DonkeyLetters({ letters = '', small = false }) {
  return (
    <div className={`flex ${small ? 'gap-0.5' : 'gap-1'}`}>
      {DONKEY_WORD.split('').map((letter, index) => {
        const earned = index < letters.length
        return (
          <span
            key={letter}
            className={`${small ? 'h-4 w-4 text-[8px]' : 'h-5 w-5 text-[10px]'} flex items-center justify-center rounded font-bold transition-all ${
              earned
                ? 'border border-red-500/40 bg-red-500/30 text-red-400'
                : 'border border-white/5 bg-white/5 text-white/20'
            }`}
          >
            {letter}
          </span>
        )
      })}
    </div>
  )
}
