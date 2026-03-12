import { motion } from 'framer-motion'
import { Mic, MicOff, VolumeX, Volume2 } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'

export default function VoiceChat({ voiceChat }) {
  const { socket } = useSocket()
  const { state } = useGame()
  const { players = [], playerId } = state

  const {
    isInVoice,
    isMuted,
    isForceMuted,
    isSelfSpeaking,
    speakingPeers,
    mutedPlayers,
    voicePeers,
    joinVoice,
    toggleMute,
  } = voiceChat

  // Check if current player is host (seat 0)
  const myPlayer = players.find((p) => p.id === playerId)
  const isHost = myPlayer?.seatIndex === 0

  const handleHostMute = (targetId) => {
    if (!socket || !isHost) return
    const isMutedByHost = mutedPlayers.has(targetId)
    socket.emit('voice-mute-player', { targetId, muted: !isMutedByHost })
  }

  if (!isInVoice) {
    return (
      <motion.button
        onClick={joinVoice}
        className="game-icon-button text-white/60 hover:text-white transition-all duration-200"
        whileTap={{ scale: 0.85 }}
        title="Join voice chat"
      >
        <Mic size={16} />
      </motion.button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* Self mute toggle */}
      <motion.button
        onClick={toggleMute}
        className={`game-icon-button transition-all duration-200 ${
          isMuted || isForceMuted
            ? 'text-red-300'
            : isSelfSpeaking
              ? 'text-green-300'
              : 'text-white/60 hover:text-white'
        }`}
        style={
          isMuted || isForceMuted
            ? {
                background: 'linear-gradient(180deg, rgba(76, 14, 14, 0.94), rgba(47, 8, 8, 0.94))',
                borderColor: 'rgba(239, 68, 68, 0.24)',
              }
            : isSelfSpeaking
              ? {
                  background: 'linear-gradient(180deg, rgba(10, 56, 28, 0.96), rgba(4, 22, 12, 0.94))',
                  borderColor: 'rgba(34, 197, 94, 0.2)',
                }
              : undefined
        }
        whileTap={{ scale: 0.85 }}
        title={isForceMuted ? 'Muted by host' : isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted || isForceMuted ? <MicOff size={16} /> : <Mic size={16} />}
      </motion.button>

      {isForceMuted && (
        <span className="hidden sm:inline text-[10px] text-red-300/80 whitespace-nowrap">Muted by host</span>
      )}

      {/* Host mute controls for other players in voice */}
      {isHost && players
        .filter((p) => p.id !== playerId && voicePeers.has(p.id))
        .map((p) => (
          <motion.button
            key={p.id}
            onClick={() => handleHostMute(p.id)}
            className={`w-8 h-8 rounded-xl border transition-colors ${
              mutedPlayers.has(p.id) ? 'text-red-300' : 'text-white/40 hover:text-white/70'
            }`}
            style={{
              borderColor: mutedPlayers.has(p.id) ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255,255,255,0.08)',
              background: mutedPlayers.has(p.id) ? 'rgba(76, 14, 14, 0.78)' : 'rgba(255,255,255,0.04)',
            }}
            whileTap={{ scale: 0.85 }}
            title={mutedPlayers.has(p.id) ? `Unmute ${p.name}` : `Mute ${p.name}`}
          >
            {mutedPlayers.has(p.id)
              ? <VolumeX size={12} />
              : <Volume2 size={12} />
            }
          </motion.button>
        ))
      }
    </div>
  )
}
