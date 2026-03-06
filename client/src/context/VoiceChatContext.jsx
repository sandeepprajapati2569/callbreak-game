import { createContext, useContext, useEffect, useRef } from 'react'
import { useVoiceChat } from '../hooks/useVoiceChat'
import { useGame } from './GameContext'

const VoiceChatContext = createContext(null)

export function VoiceChatProvider({ children }) {
  const voiceChat = useVoiceChat()
  const { state } = useGame()
  const leaveVoiceRef = useRef(voiceChat.leaveVoice)
  const joinVoiceRef = useRef(voiceChat.joinVoice)

  // Keep refs in sync
  leaveVoiceRef.current = voiceChat.leaveVoice
  joinVoiceRef.current = voiceChat.joinVoice

  // Auto-join voice when player enters a room (LOBBY phase and beyond)
  const { phase, roomCode } = state
  const isInRoom = roomCode && phase !== 'LANDING'

  useEffect(() => {
    if (isInRoom && !voiceChat.isInVoice) {
      joinVoiceRef.current()
    }
  }, [isInRoom]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-leave voice when player leaves the room (kicked, disconnected, or navigated away)
  useEffect(() => {
    if (!isInRoom && voiceChat.isInVoice) {
      leaveVoiceRef.current()
    }
  }, [isInRoom]) // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup on true app unmount
  useEffect(() => {
    return () => {
      leaveVoiceRef.current()
    }
  }, [])

  return (
    <VoiceChatContext.Provider value={voiceChat}>
      {children}
    </VoiceChatContext.Provider>
  )
}

export function useVoiceChatContext() {
  const context = useContext(VoiceChatContext)
  if (!context) {
    throw new Error('useVoiceChatContext must be used within a VoiceChatProvider')
  }
  return context
}
