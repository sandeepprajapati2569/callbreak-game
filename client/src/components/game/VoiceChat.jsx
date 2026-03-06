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

  // Don't render anything if not connected to voice yet
  if (!isInVoice) return null

  return (
    <div className="flex items-center gap-1.5">
      {/* Self mute toggle */}
      <motion.button
        onClick={toggleMute}
        className={`p-1.5 sm:p-2 rounded-full transition-all duration-200 ${
          isMuted || isForceMuted
            ? 'bg-red-500/25 text-red-400'
            : isSelfSpeaking
              ? 'bg-green-500/25 text-green-400'
              : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
        }`}
        whileTap={{ scale: 0.85 }}
        title={isForceMuted ? 'Muted by host' : isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted || isForceMuted ? <MicOff size={14} /> : <Mic size={14} />}
      </motion.button>

      {isForceMuted && (
        <span className="text-[9px] text-red-400/70">Muted by host</span>
      )}

      {/* Host mute controls for other players in voice */}
      {isHost && players
        .filter((p) => p.id !== playerId && voicePeers.has(p.id))
        .map((p) => (
          <motion.button
            key={p.id}
            onClick={() => handleHostMute(p.id)}
            className={`p-1 rounded-full transition-colors ${
              mutedPlayers.has(p.id) ? 'text-red-400' : 'text-white/30 hover:text-white/60'
            }`}
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
