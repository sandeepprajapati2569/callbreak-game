import { motion } from 'framer-motion'
import { Mic, MicOff } from 'lucide-react'

export default function VoiceChat({ voiceChat }) {
  const {
    isInVoice,
    isMuted,
    isForceMuted,
    isSelfSpeaking,
    joinVoice,
    toggleMute,
  } = voiceChat

  if (!isInVoice) {
    return (
      <motion.button
        onClick={joinVoice}
        data-probe-id="voice-join-toggle"
        className="game-icon-button text-white/65 hover:text-white transition-all duration-200"
        whileTap={{ scale: 0.85 }}
        title="Join voice chat"
      >
        <Mic size={16} />
      </motion.button>
    )
  }

  return (
    <div className="relative flex items-center">
      <motion.button
        onClick={toggleMute}
        data-probe-id="voice-self-toggle"
        className={`game-icon-button transition-all duration-200 ${
          isMuted || isForceMuted
            ? 'text-red-300'
            : isSelfSpeaking
              ? 'text-green-300'
              : 'text-white/75 hover:text-white'
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
                  borderColor: 'rgba(34, 197, 94, 0.24)',
                }
              : undefined
        }
        whileTap={{ scale: 0.85 }}
        title={isForceMuted ? 'Muted by host' : isMuted ? 'Unmute microphone' : 'Mute microphone'}
      >
        {isMuted || isForceMuted ? <MicOff size={16} /> : <Mic size={16} />}
      </motion.button>
    </div>
  )
}
