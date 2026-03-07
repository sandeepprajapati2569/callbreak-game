import { createContext, useContext, useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'
import { useAuth } from './AuthContext'

const SocketContext = createContext(null)

// In production, VITE_SERVER_URL points to the deployed backend
// In development, the Vite proxy handles /socket.io → localhost:3001
const SERVER_URL = import.meta.env.VITE_SERVER_URL || ''

export function SocketProvider({ children }) {
  const { user } = useAuth()
  const [socket, setSocket] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [playerId, setPlayerId] = useState(() => localStorage.getItem('callbreak_playerId') || null)
  const [roomCode, setRoomCode] = useState(() => localStorage.getItem('callbreak_roomCode') || null)
  const [activeGame, setActiveGame] = useState(null)
  const socketRef = useRef(null)

  useEffect(() => {
    // Use Firebase UID if logged in, otherwise fall back to stored playerId
    const authPlayerId = user?.uid || playerId

    const socketOptions = {
      auth: {
        playerId: authPlayerId,
        roomCode: roomCode,
      },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    }

    // When connecting to same origin (dev), use path-based config
    // When connecting to external server (prod), use full URL
    const newSocket = SERVER_URL
      ? io(SERVER_URL, socketOptions)
      : io({ ...socketOptions, path: '/socket.io' })

    socketRef.current = newSocket
    setSocket(newSocket)

    newSocket.on('connect', () => {
      setIsConnected(true)

      // Check if the user has an active game they can rejoin
      if (authPlayerId) {
        newSocket.emit('check-active-game', { playerId: authPlayerId }, (response) => {
          if (response?.activeGame) {
            setActiveGame(response.activeGame)
          } else {
            setActiveGame(null)
          }
        })
      }
    })

    newSocket.on('active-game-found', (data) => {
      setActiveGame(data)
    })

    newSocket.on('disconnect', () => {
      setIsConnected(false)
    })

    newSocket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message)
    })

    return () => {
      newSocket.disconnect()
    }
  }, [user?.uid])

  const updatePlayerId = (id) => {
    setPlayerId(id)
    if (id) {
      localStorage.setItem('callbreak_playerId', id)
    } else {
      localStorage.removeItem('callbreak_playerId')
    }
    if (socketRef.current) {
      socketRef.current.auth.playerId = id
    }
  }

  const rejoinGame = (gameRoomCode) => {
    if (!socketRef.current) return
    const pid = user?.uid || playerId
    socketRef.current.emit('reconnect-game', { roomCode: gameRoomCode, playerId: pid }, (response) => {
      if (response?.success) {
        updateRoomCode(gameRoomCode)
        updatePlayerId(pid)
        setActiveGame(null)
      }
    })
  }

  const updateRoomCode = (code) => {
    setRoomCode(code)
    if (code) {
      localStorage.setItem('callbreak_roomCode', code)
    } else {
      localStorage.removeItem('callbreak_roomCode')
    }
    if (socketRef.current) {
      socketRef.current.auth.roomCode = code
    }
  }

  return (
    <SocketContext.Provider
      value={{
        socket,
        isConnected,
        playerId,
        roomCode,
        activeGame,
        setPlayerId: updatePlayerId,
        setRoomCode: updateRoomCode,
        rejoinGame,
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider')
  }
  return context
}
