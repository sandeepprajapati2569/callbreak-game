import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { useVoiceChat } from '../hooks/useVoiceChat'
import { useGame } from './GameContext'
import { useParty } from './PartyContext'

export const VoiceChatContext = createContext(null)

export function VoiceChatProvider({ children }) {
  const voiceChat = useVoiceChat()
  const { state } = useGame()
  const { party } = useParty()
  const leaveVoiceRef = useRef(voiceChat.leaveVoice)
  const joinVoiceRef = useRef(voiceChat.joinVoice)

  // Keep refs in sync
  leaveVoiceRef.current = voiceChat.leaveVoice
  joinVoiceRef.current = voiceChat.joinVoice

  const { phase, roomCode } = state
  const isInRoom = Boolean(roomCode && phase !== 'LANDING')
  const shouldUsePartyVoice = Boolean(
    party
    && party.status !== 'in_match'
    && phase === 'LANDING'
  )

  const desiredVoiceChannel = useMemo(() => {
    if (isInRoom && roomCode) {
      return {
        channelType: 'room',
        channelId: `room:${roomCode}`,
      }
    }

    if (shouldUsePartyVoice && party?.partyId) {
      return {
        channelType: 'party',
        channelId: `party:${party.partyId}`,
      }
    }

    return null
  }, [isInRoom, roomCode, shouldUsePartyVoice, party?.partyId])

  // Auto-join or switch voice channel based on current pre-game/match context.
  useEffect(() => {
    if (!desiredVoiceChannel) {
      if (voiceChat.isInVoice) {
        leaveVoiceRef.current()
      }
      return
    }

    if (!voiceChat.isInVoice || voiceChat.currentChannel !== desiredVoiceChannel.channelId) {
      joinVoiceRef.current(desiredVoiceChannel)
    }
  }, [desiredVoiceChannel, voiceChat.isInVoice, voiceChat.currentChannel]) // eslint-disable-line react-hooks/exhaustive-deps

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

export function StaticVoiceChatProvider({ value, children }) {
  return (
    <VoiceChatContext.Provider value={value}>
      {children}
    </VoiceChatContext.Provider>
  )
}
