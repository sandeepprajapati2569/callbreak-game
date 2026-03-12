import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Volume2, VolumeX, SlidersHorizontal } from 'lucide-react'
import { useGame } from '../../context/GameContext'
import { useSocket } from '../../context/SocketContext'
import { useOrientation } from '../../hooks/useOrientation'

export default function VoiceChat({ voiceChat }) {
  const { socket } = useSocket()
  const { state } = useGame()
  const { layoutTier } = useOrientation()
  const { players = [], playerId } = state
  const [showManagePanel, setShowManagePanel] = useState(false)

  const {
    isInVoice,
    isMuted,
    isForceMuted,
    isSelfSpeaking,
    mutedPlayers,
    voicePeers,
    joinVoice,
    toggleMute,
  } = voiceChat

  const myPlayer = players.find((player) => player.id === playerId)
  const isHost = myPlayer?.seatIndex === 0
  const remoteVoicePlayers = useMemo(() => {
    return players.filter((player) => player.id !== playerId && voicePeers.has(player.id))
  }, [playerId, players, voicePeers])
  const isCompactTier = layoutTier === 'compactPortrait' || layoutTier === 'compactLandscape'

  const handleHostMute = (targetId) => {
    if (!socket || !isHost) return
    const isMutedByHost = mutedPlayers.has(targetId)
    socket.emit('voice-mute-player', { targetId, muted: !isMutedByHost })
  }

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
    <div className="relative flex items-center gap-2">
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

      {!isCompactTier && isForceMuted && (
        <span className="text-[10px] text-red-300/80 whitespace-nowrap">Muted by host</span>
      )}

      {isHost && remoteVoicePlayers.length > 0 && (
        <>
          <motion.button
            onClick={() => setShowManagePanel((current) => !current)}
            data-probe-id="voice-manage-toggle"
            className="game-icon-button text-white/70 hover:text-white transition-all duration-200"
            whileTap={{ scale: 0.85 }}
            title="Manage party voice"
          >
            <SlidersHorizontal size={16} />
          </motion.button>

          <AnimatePresence>
            {showManagePanel && (
              <motion.div
                className="game-floating-sheet absolute left-0 top-full mt-2 min-w-[220px] max-w-[260px] rounded-2xl p-3 z-50"
                initial={{ opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.96 }}
                transition={{ duration: 0.16 }}
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.24em] opacity-50">Voice</p>
                    <p className="mt-1 text-xs font-semibold text-gold">Manage players</p>
                  </div>
                  <span className="game-pill px-2 py-0.5 text-[10px]">
                    {remoteVoicePlayers.length} live
                  </span>
                </div>

                <div className="space-y-2">
                  {remoteVoicePlayers.map((player) => {
                    const hostMuted = mutedPlayers.has(player.id)

                    return (
                      <div
                        key={player.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-black/15 px-2.5 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-white/90">{player.name}</p>
                          <p className="mt-0.5 text-[10px] uppercase tracking-[0.18em] opacity-45">
                            {hostMuted ? 'Muted' : 'Listening'}
                          </p>
                        </div>
                        <motion.button
                          onClick={() => handleHostMute(player.id)}
                          className={`inline-flex min-h-[36px] items-center gap-1 rounded-xl border px-2.5 text-[11px] font-semibold transition-colors ${
                            hostMuted ? 'text-red-200' : 'text-white/80'
                          }`}
                          style={{
                            borderColor: hostMuted ? 'rgba(239, 68, 68, 0.26)' : 'rgba(255,255,255,0.08)',
                            background: hostMuted ? 'rgba(76, 14, 14, 0.82)' : 'rgba(255,255,255,0.05)',
                          }}
                          whileTap={{ scale: 0.96 }}
                        >
                          {hostMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                          {hostMuted ? 'Unmute' : 'Mute'}
                        </motion.button>
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  )
}
