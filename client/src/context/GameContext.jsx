import { createContext, useContext, useReducer, useEffect } from 'react'
import { useSocket } from './SocketContext'
import toast from 'react-hot-toast'

const GameContext = createContext(null)

const initialState = {
  phase: 'LANDING',
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
  messages: [],
  dealerIndex: 0,
  maxPlayers: 4,
  tricksPerRound: 13,
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
      }

    case 'ROOM_JOINED':
      return {
        ...state,
        phase: 'LOBBY',
        roomCode: action.payload.roomCode,
        playerId: action.payload.playerId,
        players: action.payload.players || [],
        maxPlayers: action.payload.maxPlayers || 4,
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
      'card-played': (data) => {
        dispatch({ type: 'CARD_PLAYED', payload: data })
      },
      'hand-updated': (data) => {
        dispatch({ type: 'HAND_UPDATED', payload: data })
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
