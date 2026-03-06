import { createContext, useContext, useReducer, useEffect } from 'react'
import { useSocket } from './SocketContext'
import toast from 'react-hot-toast'

const GameContext = createContext(null)

const initialState = {
  phase: 'LANDING',
  gameType: 'callbreak', // 'callbreak' | 'donkey'
  roomCode: null,
  playerId: null,
  playerName: '',
  players: [],
  myHand: [],
  currentRound: 0,
  currentTrick: 0,
  trickCards: [],
  ledSuit: null,
  currentTurn: null,
  myTurn: false,
  playableCards: [],
  bids: {},
  tricksWon: {},
  scores: [],
  totalScores: {},
  trickWinner: null,
  turnTimerStart: null,
  turnTimerDuration: 60000,
  turnTimerPlayerId: null,
  messages: [],
  dealerIndex: 0,
  maxPlayers: 4,
  tricksPerRound: 13,
  queueStatus: null,
  // Donkey-specific state
  donkeyPlayers: [],      // players with letters, isSafe, etc.
  donkeyRound: 0,
  activePlayers: [],      // IDs of players still passing
  safeOrder: [],          // order players completed 4-of-a-kind
  selectedCount: 0,       // how many active players have selected a card
  totalActive: 0,         // total active players in passing
  passTimeout: 15000,     // pass timer duration
  donkeyRoundResult: null, // { loserId, loserName, newLetter, players, round }
  donkeyGameResult: null,  // { donkeyPlayerId, donkeyPlayerName, players }
}

function gameReducer(state, action) {
  switch (action.type) {
    case 'ROOM_CREATED':
      return {
        ...state,
        phase: 'LOBBY',
        roomCode: action.payload.roomCode,
        playerId: action.payload.playerId,
        players: action.payload.players || [],
        maxPlayers: action.payload.maxPlayers || 4,
        gameType: action.payload.gameType || 'callbreak',
      }

    case 'ROOM_JOINED':
      return {
        ...state,
        phase: 'LOBBY',
        roomCode: action.payload.roomCode,
        playerId: action.payload.playerId,
        players: action.payload.players || [],
        maxPlayers: action.payload.maxPlayers || 4,
        gameType: action.payload.gameType || 'callbreak',
      }

    case 'QUEUE_JOINED':
      return {
        ...state,
        phase: 'QUEUING',
        queueStatus: action.payload,
      }

    case 'QUEUE_STATUS':
      return {
        ...state,
        queueStatus: action.payload,
      }

    case 'QUEUE_LEFT':
      return {
        ...state,
        phase: 'LANDING',
        queueStatus: null,
      }

    case 'MATCH_FOUND':
      return {
        ...state,
        phase: 'LOBBY',
        roomCode: action.payload.roomCode,
        playerId: action.payload.playerId,
        players: action.payload.players || [],
        maxPlayers: action.payload.maxPlayers || 4,
        gameType: action.payload.gameType || state.gameType,
        queueStatus: null,
      }

    case 'PLAYER_JOINED':
      return {
        ...state,
        players: action.payload.players,
        maxPlayers: action.payload.maxPlayers || state.maxPlayers,
      }

    case 'PLAYER_LEFT':
      return {
        ...state,
        players: action.payload.players,
      }

    case 'PLAYER_READY_CHANGED':
      return {
        ...state,
        players: action.payload.players || state.players.map((p) =>
          p.id === action.payload.playerId
            ? { ...p, isReady: action.payload.isReady }
            : p
        ),
      }

    case 'GAME_STARTING':
      return {
        ...state,
        phase: 'GAME_STARTING',
        dealerIndex: action.payload.dealerIndex ?? state.dealerIndex,
      }

    case 'HAND_DEALT':
      return {
        ...state,
        phase: 'BIDDING',
        myHand: action.payload.hand,
        currentRound: action.payload.round,
        currentTrick: 0,
        trickCards: [],
        bids: {},
        tricksWon: action.payload.tricksWon || {},
        trickWinner: null,
        playableCards: [],
        tricksPerRound: action.payload.hand?.length || state.tricksPerRound,
      }

    case 'BIDDING_START':
      return {
        ...state,
        phase: 'BIDDING',
        currentTurn: action.payload.currentBidder,
        myTurn: action.payload.currentBidder === state.playerId,
      }

    case 'BID_PLACED':
      return {
        ...state,
        bids: {
          ...state.bids,
          [action.payload.playerId]: action.payload.bid,
        },
        currentTurn: action.payload.nextBidder || state.currentTurn,
        myTurn: action.payload.nextBidder === state.playerId,
      }

    case 'BIDDING_COMPLETE':
      return {
        ...state,
        phase: 'PLAYING',
        bids: action.payload.bids,
      }

    case 'TURN_CHANGED':
      // Broadcast event – update who the current turn belongs to for ALL players
      // Only update if it's NOT our own turn (your-turn handles that with playableCards)
      if (action.payload.playerId === state.playerId) return state
      return {
        ...state,
        currentTurn: action.payload.playerId,
        myTurn: false,
      }

    case 'YOUR_TURN':
      return {
        ...state,
        currentTurn: state.playerId,
        myTurn: true,
        playableCards: action.payload.playableCards || [],
      }

    case 'CARD_PLAYED': {
      const newTrickCards = [
        ...state.trickCards,
        {
          playerId: action.payload.playerId,
          card: action.payload.card,
        },
      ]
      return {
        ...state,
        trickCards: newTrickCards,
        ledSuit: state.trickCards.length === 0 ? action.payload.card.suit : state.ledSuit,
        currentTurn: action.payload.nextPlayer || null,
        myTurn: action.payload.nextPlayer === state.playerId,
        playableCards: action.payload.nextPlayer === state.playerId
          ? (action.payload.playableCards || state.playableCards)
          : [],
      }
    }

    case 'HAND_UPDATED':
      return {
        ...state,
        myHand: action.payload.hand,
      }

    case 'TURN_TIMER_START':
      return {
        ...state,
        turnTimerStart: Date.now(),
        turnTimerDuration: action.payload.duration || 60000,
        turnTimerPlayerId: action.payload.playerId,
      }

    case 'TRICK_RESULT':
      return {
        ...state,
        trickWinner: action.payload.winner,
        tricksWon: action.payload.tricksWon || state.tricksWon,
      }

    case 'TRICK_CLEARED':
      return {
        ...state,
        trickCards: [],
        ledSuit: null,
        trickWinner: null,
        currentTrick: (state.currentTrick || 0) + 1,
      }

    case 'ROUND_END':
      return {
        ...state,
        phase: 'ROUND_END',
        scores: action.payload.scores || [],
        totalScores: action.payload.totalScores || {},
      }

    case 'GAME_OVER':
      return {
        ...state,
        phase: 'GAME_OVER',
        scores: action.payload.scores || state.scores,
        totalScores: action.payload.totalScores || state.totalScores,
      }

    // ------ Donkey game reducer cases ------
    case 'DONKEY_HAND_DEALT':
      return {
        ...state,
        phase: 'DONKEY_PASSING',
        myHand: action.payload.hand,
        donkeyRound: action.payload.round,
        donkeyPlayers: action.payload.players || state.donkeyPlayers,
        selectedCount: 0,
        totalActive: action.payload.players?.length || state.totalActive,
        activePlayers: action.payload.players?.map((p) => p.id) || state.activePlayers,
        safeOrder: [],
        donkeyRoundResult: null,
      }

    case 'DONKEY_PASS_START':
      return {
        ...state,
        phase: 'DONKEY_PASSING',
        activePlayers: action.payload.activePlayers || state.activePlayers,
        passTimeout: action.payload.timeout || 15000,
        selectedCount: 0,
        totalActive: action.payload.activePlayers?.length || state.totalActive,
      }

    case 'DONKEY_CARD_SELECTED':
      return {
        ...state,
        selectedCount: action.payload.selectedCount,
        totalActive: action.payload.totalActive,
      }

    case 'DONKEY_CARDS_PASSED':
      return {
        ...state,
        myHand: action.payload.hand,
        selectedCount: 0,
      }

    case 'DONKEY_PLAYER_SAFE':
      return {
        ...state,
        safeOrder: action.payload.safeOrder || state.safeOrder,
        activePlayers: action.payload.activePlayers || state.activePlayers,
        donkeyPlayers: state.donkeyPlayers.map((p) =>
          p.id === action.payload.playerId ? { ...p, isSafe: true } : p
        ),
      }

    case 'DONKEY_ROUND_RESULT':
      return {
        ...state,
        phase: 'DONKEY_ROUND_RESULT',
        donkeyRoundResult: action.payload,
        donkeyPlayers: action.payload.players?.map((p) => ({
          ...p,
          isSafe: false,
        })) || state.donkeyPlayers,
      }

    case 'DONKEY_GAME_OVER':
      return {
        ...state,
        phase: 'DONKEY_GAME_OVER',
        donkeyGameResult: action.payload,
        donkeyPlayers: action.payload.players || state.donkeyPlayers,
      }

    case 'SET_GAME_TYPE':
      return {
        ...state,
        gameType: action.payload,
      }

    case 'CHAT_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
      }

    case 'PLAYER_DISCONNECTED':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.payload.playerId
            ? { ...p, isConnected: false }
            : p
        ),
      }

    case 'PLAYER_RECONNECTED':
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.payload.playerId
            ? { ...p, isConnected: true }
            : p
        ),
      }

    case 'GAME_STATE_SYNC':
      return {
        ...state,
        ...action.payload,
      }

    case 'SET_PLAYER_NAME':
      return {
        ...state,
        playerName: action.payload,
      }

    case 'RESET':
      return {
        ...initialState,
        playerName: state.playerName,
      }

    case 'ERROR':
      return state

    default:
      return state
  }
}

export function GameProvider({ children }) {
  const [state, dispatch] = useReducer(gameReducer, initialState)
  const { socket, setPlayerId, setRoomCode } = useSocket()

  useEffect(() => {
    if (!socket) return

    const handlers = {
      'room-created': (data) => {
        dispatch({ type: 'ROOM_CREATED', payload: data })
        setPlayerId(data.playerId)
        setRoomCode(data.roomCode)
      },
      'room-joined': (data) => {
        dispatch({ type: 'ROOM_JOINED', payload: data })
        setPlayerId(data.playerId)
        setRoomCode(data.roomCode)
      },
      'player-joined': (data) => {
        dispatch({ type: 'PLAYER_JOINED', payload: data })
        if (data.playerName) {
          toast(`${data.playerName} joined the room`)
        }
      },
      'player-left': (data) => {
        dispatch({ type: 'PLAYER_LEFT', payload: data })
        if (data.playerName) {
          toast(`${data.playerName} left the room`)
        }
      },
      'player-ready-changed': (data) => {
        dispatch({ type: 'PLAYER_READY_CHANGED', payload: data })
      },
      'game-starting': (data) => {
        dispatch({ type: 'GAME_STARTING', payload: data })
      },
      'hand-dealt': (data) => {
        dispatch({ type: 'HAND_DEALT', payload: data })
      },
      'bidding-start': (data) => {
        dispatch({ type: 'BIDDING_START', payload: data })
      },
      'bid-placed': (data) => {
        dispatch({ type: 'BID_PLACED', payload: data })
      },
      'bidding-complete': (data) => {
        dispatch({ type: 'BIDDING_COMPLETE', payload: data })
      },
      'your-turn': (data) => {
        dispatch({ type: 'YOUR_TURN', payload: data })
      },
      'turn-changed': (data) => {
        dispatch({ type: 'TURN_CHANGED', payload: data })
      },
      'card-played': (data) => {
        dispatch({ type: 'CARD_PLAYED', payload: data })
      },
      'hand-updated': (data) => {
        dispatch({ type: 'HAND_UPDATED', payload: data })
      },
      'turn-timer-start': (data) => {
        dispatch({ type: 'TURN_TIMER_START', payload: data })
      },
      'trick-result': (data) => {
        dispatch({ type: 'TRICK_RESULT', payload: data })
      },
      'trick-cleared': (data) => {
        dispatch({ type: 'TRICK_CLEARED', payload: data || {} })
      },
      'round-end': (data) => {
        dispatch({ type: 'ROUND_END', payload: data })
      },
      'game-over': (data) => {
        dispatch({ type: 'GAME_OVER', payload: data })
      },
      'chat-message': (data) => {
        dispatch({ type: 'CHAT_MESSAGE', payload: data })
      },
      'player-disconnected': (data) => {
        dispatch({ type: 'PLAYER_DISCONNECTED', payload: data })
        toast(`${data.playerName || 'A player'} disconnected`)
      },
      'player-reconnected': (data) => {
        dispatch({ type: 'PLAYER_RECONNECTED', payload: data })
        toast.success(`${data.playerName || 'A player'} reconnected`)
      },
      'player-kicked': (data) => {
        dispatch({ type: 'RESET' })
        setPlayerId(null)
        setRoomCode(null)
        toast.error(data.reason || 'You were kicked from the room')
      },
      'queue-status': (data) => {
        dispatch({ type: 'QUEUE_STATUS', payload: data })
      },
      'match-found': (data) => {
        dispatch({ type: 'MATCH_FOUND', payload: data })
        setPlayerId(data.playerId)
        setRoomCode(data.roomCode)
        toast.success('Match found! Game starting...')
      },
      // Donkey game events
      'donkey-hand-dealt': (data) => {
        dispatch({ type: 'DONKEY_HAND_DEALT', payload: data })
      },
      'donkey-pass-start': (data) => {
        dispatch({ type: 'DONKEY_PASS_START', payload: data })
      },
      'donkey-card-selected': (data) => {
        dispatch({ type: 'DONKEY_CARD_SELECTED', payload: data })
      },
      'donkey-cards-passed': (data) => {
        dispatch({ type: 'DONKEY_CARDS_PASSED', payload: data })
      },
      'donkey-player-safe': (data) => {
        dispatch({ type: 'DONKEY_PLAYER_SAFE', payload: data })
        if (data.playerName) {
          toast.success(`${data.playerName} got 4 of a kind!`)
        }
      },
      'donkey-round-result': (data) => {
        dispatch({ type: 'DONKEY_ROUND_RESULT', payload: data })
      },
      'donkey-game-over': (data) => {
        dispatch({ type: 'DONKEY_GAME_OVER', payload: data })
      },
      'game-state-sync': (data) => {
        dispatch({ type: 'GAME_STATE_SYNC', payload: data })
      },
      'error': (data) => {
        dispatch({ type: 'ERROR', payload: data })
        toast.error(data.message || 'An error occurred')
      },
    }

    Object.entries(handlers).forEach(([event, handler]) => {
      socket.on(event, handler)
    })

    return () => {
      Object.entries(handlers).forEach(([event, handler]) => {
        socket.off(event, handler)
      })
    }
  }, [socket, setPlayerId, setRoomCode])

  return (
    <GameContext.Provider value={{ state, dispatch }}>
      {children}
    </GameContext.Provider>
  )
}

export function useGame() {
  const context = useContext(GameContext)
  if (!context) {
    throw new Error('useGame must be used within a GameProvider')
  }
  return context
}
