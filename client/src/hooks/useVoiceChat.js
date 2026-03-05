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

/**
 * Helper: remove an audio element from DOM safely.
 */
function removeAudioEl(audioEl) {
  if (audioEl) {
    audioEl.pause()
    audioEl.srcObject = null
    if (audioEl.parentNode) audioEl.parentNode.removeChild(audioEl)
  }
}

/**
 * Helper: flush queued ICE candidates after remote description is set.
 */
async function flushIceCandidateQueue(peerData) {
  if (!peerData || !peerData.iceCandidateQueue) return
  for (const candidate of peerData.iceCandidateQueue) {
    try {
      await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate))
    } catch (err) {
      console.warn('[Voice] Failed to add queued ICE candidate:', err)
    }
  }
  peerData.iceCandidateQueue = []
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
    // Deduplicate: if a connection already exists, return it
    const existing = peersRef.current.get(peerId)
    if (existing) return existing.pc

    const pc = new RTCPeerConnection(ICE_SERVERS)

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current)
      })
    }

    // Create audio element in DOM for reliable playback
    const audioEl = document.createElement('audio')
    audioEl.autoplay = true
    audioEl.playsInline = true
    audioEl.setAttribute('data-voice-peer', peerId)
    document.body.appendChild(audioEl)

    pc.ontrack = (event) => {
      audioEl.srcObject = event.streams[0]

      // Explicitly play to handle autoplay policy
      audioEl.play().catch((err) => {
        console.warn('[Voice] Audio autoplay blocked, will retry:', err)
      })

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

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'failed') {
        console.warn(`[Voice] ICE connection failed for peer ${peerId}, attempting restart`)
        pc.restartIce()
      }
    }

    peersRef.current.set(peerId, { pc, audioEl, cleanupDetector: null, iceCandidateQueue: [] })
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
    if (!socket || isInVoiceRef.current) return
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

      // Tell server we joined voice — server will respond with existing peers
      socket.emit('voice-join')
    } catch (err) {
      console.error('[Voice] Mic access denied:', err)
    }
  }, [socket])

  const leaveVoice = useCallback(() => {
    peersRef.current.forEach(({ pc, audioEl, cleanupDetector }) => {
      if (cleanupDetector) cleanupDetector()
      removeAudioEl(audioEl)
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

    // CRITICAL FIX: Handle list of existing voice peers when we join
    const handleExistingPeers = async ({ peerIds }) => {
      if (!isInVoiceRef.current) return
      for (const peerId of peerIds) {
        if (peerId === playerId) continue
        setVoicePeers((prev) => new Set(prev).add(peerId))
        await sendOffer(peerId)
      }
    }

    const handlePeerJoined = async ({ peerId }) => {
      if (!isInVoiceRef.current || peerId === playerId) return
      setVoicePeers((prev) => new Set(prev).add(peerId))
      await sendOffer(peerId)
    }

    const handlePeerLeft = ({ peerId }) => {
      const peerData = peersRef.current.get(peerId)
      if (peerData) {
        if (peerData.cleanupDetector) peerData.cleanupDetector()
        removeAudioEl(peerData.audioEl)
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

      // Perfect negotiation: handle glare (both sides sent offers)
      const existingPeer = peersRef.current.get(fromId)
      if (existingPeer) {
        // Use playerId comparison as tiebreaker — lower ID is "polite" and yields
        if (playerId < fromId) {
          // We are polite: discard our connection, accept theirs
          if (existingPeer.cleanupDetector) existingPeer.cleanupDetector()
          removeAudioEl(existingPeer.audioEl)
          existingPeer.pc.close()
          peersRef.current.delete(fromId)
        } else {
          // We are impolite: ignore their offer, they should accept our answer
          return
        }
      }

      setVoicePeers((prev) => new Set(prev).add(fromId))
      const pc = createPeerConnection(fromId)
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer))

        // Flush any ICE candidates that arrived before remote description
        const peerData = peersRef.current.get(fromId)
        await flushIceCandidateQueue(peerData)

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

          // Flush any ICE candidates that arrived before remote description
          await flushIceCandidateQueue(peerData)
        } catch (err) {
          console.error('[Voice] Failed to set answer:', err)
        }
      }
    }

    const handleIceCandidate = async ({ fromId, candidate }) => {
      const peerData = peersRef.current.get(fromId)
      if (!peerData) return

      // Queue ICE candidates if remote description not yet set
      if (peerData.pc.remoteDescription) {
        try {
          await peerData.pc.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
          console.warn('[Voice] Failed to add ICE candidate:', err)
        }
      } else {
        peerData.iceCandidateQueue.push(candidate)
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

    socket.on('voice-existing-peers', handleExistingPeers)
    socket.on('voice-peer-joined', handlePeerJoined)
    socket.on('voice-peer-left', handlePeerLeft)
    socket.on('webrtc-offer', handleOffer)
    socket.on('webrtc-answer', handleAnswer)
    socket.on('webrtc-ice-candidate', handleIceCandidate)
    socket.on('voice-force-mute', handleForceMute)
    socket.on('voice-player-muted', handlePlayerMuted)

    return () => {
      socket.off('voice-existing-peers', handleExistingPeers)
      socket.off('voice-peer-joined', handlePeerJoined)
      socket.off('voice-peer-left', handlePeerLeft)
      socket.off('webrtc-offer', handleOffer)
      socket.off('webrtc-answer', handleAnswer)
      socket.off('webrtc-ice-candidate', handleIceCandidate)
      socket.off('voice-force-mute', handleForceMute)
      socket.off('voice-player-muted', handlePlayerMuted)
    }
  }, [socket, playerId, sendOffer, createPeerConnection])

  // NOTE: No cleanup-on-unmount here — that's handled by VoiceChatProvider

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
