import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Phone, PhoneOff, VolumeX, Volume2 } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'

export default function VoiceChat({ voiceChat }) {
  const { socket } = useSocket()
  const { state } = useGame()
  const { players, playerId } = state

  const {
    isInVoice,
    isMuted,
    isForceMuted,
    isSelfSpeaking,
    speakingPeers,
    mutedPlayers,
    voicePeers,
    joinVoice,
    leaveVoice,
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
        className="flex items-center gap-1.5 glass-panel px-2.5 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm hover:bg-white/10 transition-colors"
        style={{ border: '1px solid rgba(212, 175, 55, 0.3)' }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        title="Join voice chat"
      >
        <Phone size={14} style={{ color: 'var(--gold)' }} />
        <span className="text-gold">Voice</span>
      </motion.button>
    )
  }

  return (
    <motion.div
      className="glass-panel px-2 py-1.5 sm:px-3 sm:py-2 flex flex-col gap-1.5"
      style={{ border: '1px solid rgba(212, 175, 55, 0.3)' }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
    >
      {/* Controls row */}
      <div className="flex items-center gap-1.5">
        {/* Mute toggle */}
        <motion.button
          onClick={toggleMute}
          className={`p-1.5 rounded-lg transition-colors ${
            isMuted || isForceMuted
              ? 'bg-red-500/20 text-red-400'
              : isSelfSpeaking
                ? 'bg-green-500/20 text-green-400'
                : 'bg-white/5 text-white/60 hover:bg-white/10'
          }`}
          whileTap={{ scale: 0.9 }}
          title={isForceMuted ? 'Muted by host' : isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted || isForceMuted ? <MicOff size={14} /> : <Mic size={14} />}
        </motion.button>

        {/* Leave voice */}
        <motion.button
          onClick={leaveVoice}
          className="p-1.5 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
          whileTap={{ scale: 0.9 }}
          title="Leave voice"
        >
          <PhoneOff size={14} />
        </motion.button>

        {isForceMuted && (
          <span className="text-[9px] text-red-400 opacity-70">Host muted</span>
        )}
      </div>

      {/* Connected peers with host mute controls */}
      <AnimatePresence>
        {players
          .filter((p) => p.id !== playerId && voicePeers.has(p.id))
          .map((p) => (
            <motion.div
              key={p.id}
              className="flex items-center gap-1.5 text-[10px] sm:text-xs"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
            >
              {/* Speaking indicator dot */}
              <div
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors ${
                  speakingPeers.has(p.id) ? 'bg-green-400' : 'bg-white/20'
                }`}
              />
              <span className={`truncate max-w-[60px] ${mutedPlayers.has(p.id) ? 'opacity-40 line-through' : 'opacity-70'}`}>
                {p.name}
              </span>
              {/* Host mute button */}
              {isHost && (
                <button
                  onClick={() => handleHostMute(p.id)}
                  className="p-0.5 rounded hover:bg-white/10 transition-colors"
                  title={mutedPlayers.has(p.id) ? `Unmute ${p.name}` : `Mute ${p.name}`}
                >
                  {mutedPlayers.has(p.id)
                    ? <VolumeX size={10} className="text-red-400" />
                    : <Volume2 size={10} className="opacity-40" />
                  }
                </button>
              )}
            </motion.div>
          ))}
      </AnimatePresence>
    </motion.div>
  )
}
