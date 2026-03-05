import { useRef, useState, useCallback, useEffect } from 'react'
import { useSocket } from '../context/SocketContext'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

/**
 * Monitors a MediaStream's audio level via AnalyserNode.
 * Calls onSpeakingChange(true/false) with hysteresis to avoid flicker.
 * Returns a cleanup function.
 */
function createSpeakingDetector(stream, onSpeakingChange) {
  let audioContext
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)()
  } catch {
    return () => {}
  }

  const source = audioContext.createMediaStreamSource(stream)
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = 512
  analyser.smoothingTimeConstant = 0.4
  source.connect(analyser)

  const dataArray = new Float32Array(analyser.fftSize)
  let isSpeaking = false
  let speakingFrames = 0
  let silentFrames = 0
  let animationId = null

  const THRESHOLD = 0.01
  const SPEAK_FRAMES = 3
  const SILENT_FRAMES = 12

  function tick() {
    analyser.getFloatTimeDomainData(dataArray)
    let sum = 0
    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i]
    const rms = Math.sqrt(sum / dataArray.length)

    if (rms > THRESHOLD) {
      speakingFrames++
      silentFrames = 0
      if (!isSpeaking && speakingFrames >= SPEAK_FRAMES) {
        isSpeaking = true
        onSpeakingChange(true)
      }
    } else {
      silentFrames++
      speakingFrames = 0
      if (isSpeaking && silentFrames >= SILENT_FRAMES) {
        isSpeaking = false
        onSpeakingChange(false)
      }
    }
    animationId = requestAnimationFrame(tick)
  }

  tick()

  return () => {
    if (animationId) cancelAnimationFrame(animationId)
    source.disconnect()
    analyser.disconnect()
    audioContext.close().catch(() => {})
  }
}

export function useVoiceChat() {
  const { socket, playerId } = useSocket()

  const localStreamRef = useRef(null)
  const peersRef = useRef(new Map())
  const isInVoiceRef = useRef(false)

  const [isInVoice, setIsInVoice] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isForceMuted, setIsForceMuted] = useState(false)
  const [speakingPeers, setSpeakingPeers] = useState(new Set())
  const [mutedPlayers, setMutedPlayers] = useState(new Set())
  const [voicePeers, setVoicePeers] = useState(new Set())
  const [isSelfSpeaking, setIsSelfSpeaking] = useState(false)

  // Track our own speaking state
  const selfDetectorRef = useRef(null)

  const createPeerConnection = useCallback((peerId) => {
    const pc = new RTCPeerConnection(ICE_SERVERS)

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current)
      })
    }

    const audioEl = new Audio()
    audioEl.autoplay = true

    pc.ontrack = (event) => {
      audioEl.srcObject = event.streams[0]

      const cleanup = createSpeakingDetector(event.streams[0], (speaking) => {
        setSpeakingPeers((prev) => {
          const next = new Set(prev)
          if (speaking) next.add(peerId)
          else next.delete(peerId)
          return next
        })
      })

      const peerData = peersRef.current.get(peerId)
      if (peerData) peerData.cleanupDetector = cleanup
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('webrtc-ice-candidate', { targetId: peerId, candidate: event.candidate })
      }
    }

    peersRef.current.set(peerId, { pc, audioEl, cleanupDetector: null })
    return pc
  }, [socket])

  const sendOffer = useCallback(async (peerId) => {
    const pc = createPeerConnection(peerId)
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      socket.emit('webrtc-offer', { targetId: peerId, offer: pc.localDescription })
    } catch (err) {
      console.error('[Voice] Failed to send offer:', err)
    }
  }, [socket, createPeerConnection])

  const joinVoice = useCallback(async () => {
    if (!socket) return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      })

      localStreamRef.current = stream
      isInVoiceRef.current = true
      setIsInVoice(true)

      // Detect own speaking
      selfDetectorRef.current = createSpeakingDetector(stream, setIsSelfSpeaking)

      socket.emit('voice-join')
    } catch (err) {
      console.error('[Voice] Mic access denied:', err)
    }
  }, [socket])

  const leaveVoice = useCallback(() => {
    peersRef.current.forEach(({ pc, audioEl, cleanupDetector }) => {
      if (cleanupDetector) cleanupDetector()
      audioEl.srcObject = null
      pc.close()
    })
    peersRef.current.clear()

    if (selfDetectorRef.current) {
      selfDetectorRef.current()
      selfDetectorRef.current = null
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop())
      localStreamRef.current = null
    }

    isInVoiceRef.current = false
    setIsInVoice(false)
    setIsMuted(false)
    setIsForceMuted(false)
    setSpeakingPeers(new Set())
    setIsSelfSpeaking(false)
    setVoicePeers(new Set())

    if (socket) socket.emit('voice-leave')
  }, [socket])

  const toggleMute = useCallback(() => {
    if (!localStreamRef.current || isForceMuted) return
    const track = localStreamRef.current.getAudioTracks()[0]
    if (track) {
      track.enabled = !track.enabled
      setIsMuted(!track.enabled)
    }
  }, [isForceMuted])

  // Socket handlers
  useEffect(() => {
    if (!socket) return

    const handlePeerJoined = async ({ peerId }) => {
      if (!isInVoiceRef.current || peerId === playerId) return
      setVoicePeers((prev) => new Set(prev).add(peerId))
      await sendOffer(peerId)
    }

    const handlePeerLeft = ({ peerId }) => {
      const peerData = peersRef.current.get(peerId)
      if (peerData) {
        if (peerData.cleanupDetector) peerData.cleanupDetector()
        peerData.audioEl.srcObject = null
        peerData.pc.close()
        peersRef.current.delete(peerId)
      }
      setSpeakingPeers((prev) => {
        const next = new Set(prev)
        next.delete(peerId)
        return next
      })
      setVoicePeers((prev) => {
        const next = new Set(prev)
        next.delete(peerId)
        return next
      })
    }

    const handleOffer = async ({ fromId, offer }) => {
      if (!isInVoiceRef.current) return
      setVoicePeers((prev) => new Set(prev).add(fromId))
      const pc = createPeerConnection(fromId)
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        socket.emit('webrtc-answer', { targetId: fromId, answer: pc.localDescription })
      } catch (err) {
        console.error('[Voice] Failed to handle offer:', err)
      }
    }

    const handleAnswer = async ({ fromId, answer }) => {
      const peerData = peersRef.current.get(fromId)
      if (peerData) {
        try {
          await peerData.pc.setRemoteDescription(new RTCSessionDescription(answer))
        } catch (err) {
          console.error('[Voice] Failed to set answer:', err)
        }
      }
    }

    const handleIceCandidate = async ({ fromId, candidate }) => {
      const peerData = peersRef.current.get(fromId)
      if (peerData) {
        try {
          await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.error('[Voice] Failed to add ICE candidate:', err)
        }
      }
    }

    const handleForceMute = ({ muted }) => {
      setIsForceMuted(muted)
      if (localStreamRef.current) {
        const track = localStreamRef.current.getAudioTracks()[0]
        if (track) {
          track.enabled = !muted
          setIsMuted(muted)
        }
      }
    }

    const handlePlayerMuted = ({ playerId: mutedId, muted }) => {
      setMutedPlayers((prev) => {
        const next = new Set(prev)
        if (muted) next.add(mutedId)
        else next.delete(mutedId)
        return next
      })
    }

    socket.on('voice-peer-joined', handlePeerJoined)
    socket.on('voice-peer-left', handlePeerLeft)
    socket.on('webrtc-offer', handleOffer)
    socket.on('webrtc-answer', handleAnswer)
    socket.on('webrtc-ice-candidate', handleIceCandidate)
    socket.on('voice-force-mute', handleForceMute)
    socket.on('voice-player-muted', handlePlayerMuted)

    return () => {
      socket.off('voice-peer-joined', handlePeerJoined)
      socket.off('voice-peer-left', handlePeerLeft)
      socket.off('webrtc-offer', handleOffer)
      socket.off('webrtc-answer', handleAnswer)
      socket.off('webrtc-ice-candidate', handleIceCandidate)
      socket.off('voice-force-mute', handleForceMute)
      socket.off('voice-player-muted', handlePlayerMuted)
    }
  }, [socket, playerId, sendOffer, createPeerConnection])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isInVoiceRef.current) leaveVoice()
    }
  }, [leaveVoice])

  return {
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
  }
}
