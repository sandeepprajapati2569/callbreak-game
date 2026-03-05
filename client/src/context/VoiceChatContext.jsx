import { createContext, useContext, useEffect, useRef } from 'react'
import { useVoiceChat } from '../hooks/useVoiceChat'

const VoiceChatContext = createContext(null)

export function VoiceChatProvider({ children }) {
  const voiceChat = useVoiceChat()
  const leaveVoiceRef = useRef(voiceChat.leaveVoice)

  // Keep ref in sync
  leaveVoiceRef.current = voiceChat.leaveVoice

  // Cleanup only on true app unmount (provider never unmounts during route changes)
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
