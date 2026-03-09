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
  // Donkey (Gadha Ladan) specific state
  donkeyPlayers: [],           // players with isActive, cardCount, seatIndex
  donkeyRound: 0,
  donkeyTrickNumber: 1,
  donkeyLeadSuit: null,
  donkeyTrickCards: [],        // current trick cards on table
  donkeyPlayableCards: [],     // cards I can legally play now
  donkeyLastTrickResult: null, // latest resolved trick payload
  activePlayers: [],           // IDs of players still holding cards
  currentTurnPlayerId: null,   // whose turn it is to pick
  isMyTurn: false,
  donkeyTurnTimerStart: null,
  donkeyTurnTimerDuration: 20000,
  donkeyTurnTimerPlayerId: null,
  lastDiscardedSet: null,
  donkeyRoundResult: null,
  donkeyGameResult: null,      // { donkeyPlayerId, donkeyPlayerName, players, round }
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
      // If this is the first card of a new trick, defensively clear old trick state
      const isNewTrick = state.trickCards.length === 0
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
        ledSuit: isNewTrick ? action.payload.card.suit : state.ledSuit,
        trickWinner: isNewTrick ? null : state.trickWinner,
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

    // ------ Donkey (Gadha Ladan) game reducer cases ------
    case 'DONKEY_HAND_DEALT':
      return {
        ...state,
        phase: 'DONKEY_PLAYING',
        myHand: action.payload.hand || [],
        donkeyRound: action.payload.round || state.donkeyRound,
        donkeyTrickNumber: 1,
        donkeyLeadSuit: null,
        donkeyTrickCards: [],
        donkeyPlayableCards: [],
        donkeyLastTrickResult: null,
        donkeyPlayers: action.payload.players || state.donkeyPlayers,
        activePlayers: (action.payload.players || []).filter((p) => (p.cardCount || 0) > 0).map((p) => p.id),
        currentTurnPlayerId: null,
        isMyTurn: false,
        donkeyTurnTimerStart: null,
        donkeyTurnTimerPlayerId: null,
        lastDiscardedSet: null,
        donkeyRoundResult: null,
        donkeyGameResult: null,
      }

    case 'DONKEY_YOUR_TURN':
      return {
        ...state,
        currentTurnPlayerId: action.payload.playerId,
        isMyTurn: true,
        donkeyPlayableCards: action.payload.playableCards || [],
        donkeyLeadSuit: action.payload.leadSuit ?? state.donkeyLeadSuit,
        donkeyTrickNumber: action.payload.trickNumber || state.donkeyTrickNumber,
      }

    case 'DONKEY_TURN_CHANGED':
      return {
        ...state,
        currentTurnPlayerId: action.payload.playerId,
        isMyTurn: action.payload.playerId === state.playerId ? state.isMyTurn : false,
        donkeyPlayableCards: action.payload.playerId === state.playerId ? state.donkeyPlayableCards : [],
        donkeyLeadSuit: action.payload.leadSuit ?? state.donkeyLeadSuit,
        donkeyTrickNumber: action.payload.trickNumber || state.donkeyTrickNumber,
      }

    case 'DONKEY_CARD_PLAYED': {
      const trickCards = [...state.donkeyTrickCards]
      const alreadyPlayed = trickCards.some((entry) => entry.playerId === action.payload.playerId)
      if (!alreadyPlayed && action.payload.card && action.payload.playerId) {
        trickCards.push({
          playerId: action.payload.playerId,
          playerName: action.payload.playerName,
          card: action.payload.card,
        })
      }

      return {
        ...state,
        donkeyTrickCards: trickCards,
        donkeyLeadSuit: action.payload.leadSuit ?? state.donkeyLeadSuit,
        isMyTurn: action.payload.playerId === state.playerId ? false : state.isMyTurn,
        donkeyPlayableCards: action.payload.playerId === state.playerId ? [] : state.donkeyPlayableCards,
        donkeyPlayers: state.donkeyPlayers.map((p) => {
          if (p.id === action.payload.playerId && Number.isInteger(action.payload.remainingCards)) {
            return { ...p, cardCount: action.payload.remainingCards }
          }
          return p
        }),
      }
    }

    case 'DONKEY_HAND_UPDATED':
      return {
        ...state,
        myHand: action.payload.hand || [],
      }

    case 'DONKEY_PLAYER_SAFE':
      return {
        ...state,
        activePlayers: state.activePlayers.filter((id) => id !== action.payload.playerId),
        donkeyPlayers: state.donkeyPlayers.map((p) =>
          p.id === action.payload.playerId ? { ...p, isActive: false, cardCount: 0 } : p
        ),
      }

    case 'DONKEY_TURN_TIMER_START':
      return {
        ...state,
        donkeyTurnTimerStart: Date.now(),
        donkeyTurnTimerDuration: action.payload.duration || 20000,
        donkeyTurnTimerPlayerId: action.payload.playerId,
      }

    case 'DONKEY_PLAYERS_UPDATE':
      {
        const players = action.payload.players || state.donkeyPlayers
        const activePlayers = action.payload.activePlayers
          || players.filter((p) => (p.cardCount || 0) > 0).map((p) => p.id)
        return {
          ...state,
          donkeyPlayers: players,
          activePlayers,
        }
      }

    case 'DONKEY_TRICK_RESULT':
      return {
        ...state,
        donkeyTrickNumber: action.payload.trickNumber || state.donkeyTrickNumber,
        donkeyLeadSuit: action.payload.leadSuit ?? state.donkeyLeadSuit,
        donkeyTrickCards: action.payload.cards || state.donkeyTrickCards,
        donkeyLastTrickResult: action.payload,
        currentTurnPlayerId: null,
        isMyTurn: false,
        donkeyPlayableCards: [],
      }

    case 'DONKEY_TRICK_CLEARED':
      return {
        ...state,
        donkeyTrickCards: [],
        donkeyLeadSuit: null,
        donkeyTrickNumber: action.payload.trickNumber || state.donkeyTrickNumber,
        currentTurnPlayerId: action.payload.nextPlayerId || state.currentTurnPlayerId,
        isMyTurn: false,
        donkeyPlayableCards: [],
      }

    case 'DONKEY_GAME_OVER':
      return {
        ...state,
        phase: 'DONKEY_GAME_OVER',
        donkeyGameResult: action.payload,
        donkeyPlayers: action.payload.players || state.donkeyPlayers,
        activePlayers: (action.payload.players || []).filter((p) => (p.cardCount || 0) > 0).map((p) => p.id),
        isMyTurn: false,
        currentTurnPlayerId: null,
        donkeyPlayableCards: [],
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

    case 'GAME_STATE_SYNC': {
      const s = action.payload
      if (!s) return state

      // Use playerId from sync payload (set during reconnection), fall back to current state
      const syncedPlayerId = s.playerId || state.playerId
      const syncedGameType = s.gameType || state.gameType

      if (syncedGameType === 'donkey' || String(s.phase || '').startsWith('DONKEY_')) {
        const donkeyPlayers = s.donkeyPlayers || state.donkeyPlayers
        const activePlayers = s.activePlayers
          || donkeyPlayers.filter((p) => (p.cardCount || 0) > 0).map((p) => p.id)
        const donkeyTrickCards = s.donkeyTrickCards || s.trickCards || []

        return {
          ...state,
          phase: s.phase || state.phase,
          playerId: syncedPlayerId,
          gameType: 'donkey',
          roomCode: s.roomCode || state.roomCode,
          myHand: s.myHand || state.myHand,
          donkeyPlayers,
          activePlayers,
          donkeyRound: s.donkeyRound || s.roundNumber || state.donkeyRound,
          donkeyTrickNumber: s.donkeyTrickNumber || s.trickNumber || state.donkeyTrickNumber,
          donkeyLeadSuit: s.donkeyLeadSuit ?? s.leadSuit ?? state.donkeyLeadSuit,
          donkeyTrickCards,
          currentTurnPlayerId: s.currentTurnPlayerId || null,
          isMyTurn: s.currentTurnPlayerId === syncedPlayerId,
          donkeyPlayableCards: s.playableCards || [],
          donkeyTurnTimerStart: null,
          donkeyTurnTimerPlayerId: null,
        }
      }

      // Find my player data from the server state
      const myPlayer = s.players?.find((p) => p.id === syncedPlayerId) || null
      const myHand = myPlayer?.hand || state.myHand

      // Build bids map
      const bids = {}
      s.players?.forEach((p) => { if (p.bid !== null && p.bid !== undefined) bids[p.id] = p.bid })

      // Build tricksWon map
      const tricksWon = {}
      s.players?.forEach((p) => { if (p.tricksWon !== undefined) tricksWon[p.id] = p.tricksWon })

      // Map trick cards
      const trickCards = s.currentTrick?.cards?.map((c) => ({
        playerId: c.playerId,
        card: { suit: c.suit, rank: c.rank, value: c.value },
      })) || []

      // Map phase from server to client
      let phase = s.phase
      if (phase === 'TRICK_END') phase = 'PLAYING'

      return {
        ...state,
        phase,
        playerId: syncedPlayerId,
        playerName: myPlayer?.name || state.playerName,
        gameType: syncedGameType,
        roomCode: s.roomCode || state.roomCode,
        players: s.players?.map((p) => ({
          id: p.id,
          name: p.name,
          seatIndex: p.seatIndex,
          bid: p.bid,
          tricksWon: p.tricksWon,
          isConnected: p.isConnected,
          cardCount: p.cardCount,
          photoURL: p.photoURL || null,
        })) || state.players,
        myHand,
        currentRound: s.currentRound ?? state.currentRound,
        currentTrick: s.currentTrickNumber ?? state.currentTrick,
        trickCards,
        ledSuit: s.currentTrick?.ledSuit || null,
        currentTurn: s.currentTurnPlayerId || null,
        myTurn: s.currentTurnPlayerId === syncedPlayerId,
        bids,
        tricksWon,
        scores: s.scoreHistory || state.scores,
        dealerIndex: s.dealerIndex ?? state.dealerIndex,
        numPlayers: s.numPlayers || state.numPlayers,
        tricksPerRound: s.tricksPerRound || state.tricksPerRound,
        maxBid: s.maxBid || state.maxBid,
      }
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
      // Donkey (Gadha Ladan) game events
      'donkey-hand-dealt': (data) => {
        dispatch({ type: 'DONKEY_HAND_DEALT', payload: data })
      },
      'donkey-your-turn': (data) => {
        dispatch({ type: 'DONKEY_YOUR_TURN', payload: data })
      },
      'donkey-turn-changed': (data) => {
        dispatch({ type: 'DONKEY_TURN_CHANGED', payload: data })
      },
      'donkey-card-played': (data) => {
        dispatch({ type: 'DONKEY_CARD_PLAYED', payload: data })
      },
      // Legacy fallback for old event name
      'donkey-card-picked': (data) => {
        dispatch({ type: 'DONKEY_CARD_PLAYED', payload: data })
      },
      'donkey-hand-updated': (data) => {
        dispatch({ type: 'DONKEY_HAND_UPDATED', payload: data })
      },
      'donkey-player-safe': (data) => {
        dispatch({ type: 'DONKEY_PLAYER_SAFE', payload: data })
        if (data.playerName) {
          toast.success(`${data.playerName} emptied their hand!`)
        }
      },
      'donkey-turn-timer-start': (data) => {
        dispatch({ type: 'DONKEY_TURN_TIMER_START', payload: data })
      },
      'donkey-players-update': (data) => {
        dispatch({ type: 'DONKEY_PLAYERS_UPDATE', payload: data })
      },
      'donkey-trick-result': (data) => {
        dispatch({ type: 'DONKEY_TRICK_RESULT', payload: data })
      },
      'donkey-trick-cleared': (data) => {
        dispatch({ type: 'DONKEY_TRICK_CLEARED', payload: data || {} })
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
