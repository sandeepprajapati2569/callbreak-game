import { useEffect, useMemo } from 'react'
import { AnimatePresence } from 'framer-motion'
import { useParams, useSearchParams } from 'react-router-dom'
import GameBoard from '../components/game/GameBoard'
import BiddingPanel from '../components/game/BiddingPanel'
import RoundScoreModal from '../components/game/RoundScoreModal'
import GameOverModal from '../components/game/GameOverModal'
import DonkeyGameBoard from '../components/donkey/DonkeyGameBoard'
import DonkeyRoundResult from '../components/donkey/DonkeyRoundResult'
import DonkeyGameOver from '../components/donkey/DonkeyGameOver'
import { StaticGameProvider, gameInitialState } from '../context/GameContext'
import { StaticSocketProvider } from '../context/SocketContext'
import { StaticVoiceChatProvider } from '../context/VoiceChatContext'

const CALLBREAK_NAMES = ['You', 'Arjun', 'Maya', 'Ravi', 'Nisha']
const DONKEY_NAMES = ['You', 'Kabir', 'Anita', 'Vikram', 'Leena']

const CALLBREAK_HAND = [
  { suit: 'spades', rank: 'A' },
  { suit: 'spades', rank: '10' },
  { suit: 'spades', rank: '7' },
  { suit: 'hearts', rank: 'K' },
  { suit: 'hearts', rank: '9' },
  { suit: 'hearts', rank: '4' },
  { suit: 'diamonds', rank: 'Q' },
  { suit: 'diamonds', rank: '8' },
  { suit: 'diamonds', rank: '3' },
  { suit: 'clubs', rank: 'J' },
  { suit: 'clubs', rank: '9' },
  { suit: 'clubs', rank: '5' },
  { suit: 'clubs', rank: '2' },
]

const DONKEY_HAND = [
  { suit: 'spades', rank: 'A' },
  { suit: 'spades', rank: 'Q' },
  { suit: 'spades', rank: '8' },
  { suit: 'hearts', rank: 'K' },
  { suit: 'hearts', rank: '7' },
  { suit: 'hearts', rank: '5' },
  { suit: 'diamonds', rank: 'J' },
  { suit: 'diamonds', rank: '8' },
  { suit: 'diamonds', rank: '6' },
  { suit: 'clubs', rank: '10' },
  { suit: 'clubs', rank: '4' },
  { suit: 'clubs', rank: '3' },
]

function buildCallbreakPlayers(count) {
  return CALLBREAK_NAMES.slice(0, count).map((name, index) => ({
    id: `p${index + 1}`,
    name,
    seatIndex: index,
    isConnected: index !== 3,
    cardCount: index === 0 ? CALLBREAK_HAND.length : Math.max(0, 13 - index * 2),
    photoURL: null,
  }))
}

function buildDonkeyPlayers(count) {
  const letters = ['', 'D', 'DO', 'DON', 'DONK']
  const counts = [12, 3, 0, 5, 1]
  return DONKEY_NAMES.slice(0, count).map((name, index) => ({
    id: `p${index + 1}`,
    name,
    seatIndex: index,
    isConnected: index !== 4,
    isActive: counts[index] > 0,
    cardCount: counts[index],
    letters: letters[index],
    photoURL: null,
  }))
}

function buildCallbreakState(scenario, playerCount) {
  const players = buildCallbreakPlayers(playerCount)
  const bids = Object.fromEntries(players.map((player, index) => [player.id, [4, 2, 3, 1, 2][index] ?? 2]))
  const tricksWon = Object.fromEntries(players.map((player, index) => [player.id, [3, 1, 2, 1, 0][index] ?? 0]))
  const totalScores = Object.fromEntries(players.map((player, index) => [player.id, [42, 31, 36, 22, 18][index] ?? 0]))
  const scoreHistory = [{
    round: 3,
    scores: players.map((player, index) => ({
      playerId: player.id,
      bid: bids[player.id],
      tricksWon: tricksWon[player.id],
      roundScore: [4, -2, 3, 1, -2][index] ?? 0,
    })),
  }]

  const baseState = {
    ...gameInitialState,
    gameType: 'callbreak',
    phase: 'PLAYING',
    roomCode: 'CB1234',
    playerId: 'p1',
    playerName: 'You',
    players,
    myHand: CALLBREAK_HAND,
    currentRound: 3,
    currentTrick: 4,
    currentTurn: 'p3',
    myTurn: false,
    playableCards: [CALLBREAK_HAND[6], CALLBREAK_HAND[7], CALLBREAK_HAND[8]],
    bids,
    tricksWon,
    totalScores,
    scores: scoreHistory,
    trickCards: [
      { playerId: 'p2', card: { suit: 'hearts', rank: 'A' } },
      { playerId: 'p3', card: { suit: 'hearts', rank: 'J' } },
    ],
    ledSuit: 'hearts',
    turnTimerStart: Date.now() - 16000,
    turnTimerDuration: 60000,
    turnTimerPlayerId: 'p3',
  }

  if (scenario === 'bidding') {
    return {
      ...baseState,
      phase: 'BIDDING',
      currentTurn: 'p1',
      myTurn: true,
      trickCards: [],
      ledSuit: null,
      bids: { p2: 2, p3: 3 },
      tricksWon: {},
      currentTrick: 0,
      turnTimerPlayerId: 'p1',
      turnTimerStart: Date.now() - 7000,
    }
  }

  if (scenario === 'round-end') {
    return {
      ...baseState,
      phase: 'ROUND_END',
      currentTurn: null,
      myTurn: false,
      trickCards: [],
    }
  }

  if (scenario === 'game-over') {
    return {
      ...baseState,
      phase: 'GAME_OVER',
      currentTurn: null,
      myTurn: false,
      trickCards: [],
    }
  }

  return baseState
}

function buildDonkeyState(scenario, playerCount) {
  const donkeyPlayers = buildDonkeyPlayers(playerCount)

  const baseState = {
    ...gameInitialState,
    gameType: 'donkey',
    phase: 'DONKEY_PLAYING',
    roomCode: 'DK2468',
    playerId: 'p1',
    playerName: 'You',
    myHand: DONKEY_HAND,
    donkeyPlayers,
    activePlayers: donkeyPlayers.filter((player) => player.cardCount > 0).map((player) => player.id),
    donkeyRound: 4,
    donkeyTrickNumber: 6,
    donkeyLeadSuit: 'hearts',
    donkeyTrickCards: [
      { playerId: 'p2', playerName: 'Kabir', card: { suit: 'hearts', rank: '10' } },
      { playerId: 'p3', playerName: 'Anita', card: { suit: 'hearts', rank: '2' } },
    ],
    donkeyPlayableCards: [DONKEY_HAND[3], DONKEY_HAND[4], DONKEY_HAND[5]],
    donkeyLastTrickResult: {
      wasHit: false,
      highestPlayerName: 'Kabir',
    },
    currentTurnPlayerId: 'p1',
    isMyTurn: true,
    donkeyTurnTimerStart: Date.now() - 6000,
    donkeyTurnTimerDuration: 20000,
    donkeyTurnTimerPlayerId: 'p1',
  }

  if (scenario === 'round-result') {
    return {
      ...baseState,
      donkeyRoundResult: {
        round: 4,
        loserId: 'p4',
        loserName: 'Vikram',
        newLetter: 'K',
        players: donkeyPlayers.map((player) => ({
          id: player.id,
          name: player.name,
          letters: player.letters,
        })),
      },
    }
  }

  if (scenario === 'game-over') {
    return {
      ...baseState,
      phase: 'DONKEY_GAME_OVER',
      donkeyGameResult: {
        donkeyPlayerId: 'p5',
        donkeyPlayerName: 'Leena',
        players: donkeyPlayers,
        round: 4,
      },
    }
  }

  return baseState
}

function makeSocketStub() {
  return {
    connected: true,
    auth: {},
    on: () => {},
    off: () => {},
    emit: (...args) => {
      const callback = args.find((arg) => typeof arg === 'function')
      if (callback) callback({ success: true })
    },
  }
}

function buildVoiceValue(playerCount) {
  return {
    isInVoice: true,
    isMuted: false,
    isForceMuted: false,
    isSelfSpeaking: true,
    speakingPeers: new Set(['p2']),
    mutedPlayers: new Set(playerCount > 3 ? ['p4'] : []),
    voicePeers: new Set(Array.from({ length: Math.min(playerCount, 4) - 1 }, (_, index) => `p${index + 2}`)),
    joinVoice: () => {},
    toggleMute: () => {},
    leaveVoice: () => {},
    currentChannel: 'probe:room',
  }
}

export default function DevGameProbePage() {
  const { mode = 'callbreak' } = useParams()
  const [searchParams] = useSearchParams()
  const scenario = searchParams.get('scenario') || 'playing'
  const playerCount = Math.max(4, Math.min(5, Number(searchParams.get('players') || 5)))
  const probeMode = mode === 'donkey' ? 'donkey' : 'callbreak'

  const gameState = useMemo(() => {
    return probeMode === 'donkey'
      ? buildDonkeyState(scenario, playerCount)
      : buildCallbreakState(scenario, playerCount)
  }, [probeMode, scenario, playerCount])

  const socketValue = useMemo(() => ({
    socket: makeSocketStub(),
    isConnected: true,
    playerId: gameState.playerId,
    roomCode: gameState.roomCode,
    activeGame: null,
    setPlayerId: () => {},
    setRoomCode: () => {},
    rejoinGame: () => {},
  }), [gameState.playerId, gameState.roomCode])

  const voiceValue = useMemo(() => buildVoiceValue(playerCount), [playerCount])

  useEffect(() => {
    window.render_game_to_text = () => JSON.stringify({
      route: `/dev-probe/${probeMode}`,
      scenario,
      playerCount,
      phase: gameState.phase,
      gameType: gameState.gameType,
      roomCode: gameState.roomCode,
      currentTurn: gameState.currentTurn || gameState.currentTurnPlayerId,
      trickCards: gameState.trickCards?.length || gameState.donkeyTrickCards?.length || 0,
      handCount: gameState.myHand?.length || 0,
      players: (gameState.players || gameState.donkeyPlayers || []).map((player) => ({
        id: player.id,
        name: player.name,
        cardCount: player.cardCount,
      })),
    })

    window.advanceTime = async () => Promise.resolve()

    return () => {
      delete window.render_game_to_text
      delete window.advanceTime
    }
  }, [gameState, playerCount, probeMode, scenario])

  return (
    <StaticSocketProvider value={socketValue}>
      <StaticGameProvider state={gameState}>
        <StaticVoiceChatProvider value={voiceValue}>
          <div className="fixed inset-0 overflow-hidden">
            {probeMode === 'donkey' ? (
              <>
                <DonkeyGameBoard />
                <AnimatePresence>
                  {gameState.donkeyRoundResult && <DonkeyRoundResult key="donkey-round-result" />}
                  {gameState.phase === 'DONKEY_GAME_OVER' && <DonkeyGameOver key="donkey-game-over" />}
                </AnimatePresence>
              </>
            ) : (
              <>
                <GameBoard />
                <AnimatePresence>
                  {gameState.phase === 'BIDDING' && <BiddingPanel key="probe-bidding" />}
                  {gameState.phase === 'ROUND_END' && <RoundScoreModal key="probe-round-end" />}
                  {gameState.phase === 'GAME_OVER' && <GameOverModal key="probe-game-over" />}
                </AnimatePresence>
              </>
            )}
          </div>
        </StaticVoiceChatProvider>
      </StaticGameProvider>
    </StaticSocketProvider>
  )
}
