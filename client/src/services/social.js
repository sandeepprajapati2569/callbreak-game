import { auth } from '../firebase'

const SOCIAL_SERVER_URL = import.meta.env.VITE_SERVER_URL || ''
const SOCIAL_WEB_ORIGIN = import.meta.env.VITE_SOCIAL_WEB_ORIGIN || 'https://cardtrap.com'
const ONLINE_STALE_MS = 90 * 1000

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function isNativeRuntime() {
  try {
    return Boolean(globalThis?.Capacitor?.isNativePlatform?.())
  } catch {
    return false
  }
}

function apiCandidates(path) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const endpoints = []

  if (SOCIAL_SERVER_URL) {
    endpoints.push(`${SOCIAL_SERVER_URL}${normalizedPath}`)
  }

  if (!isNativeRuntime()) {
    endpoints.push(normalizedPath)
  }

  endpoints.push(`${SOCIAL_WEB_ORIGIN}${normalizedPath}`)
  return unique(endpoints)
}

async function getAuthToken(forceRefresh = false) {
  const token = await auth.currentUser?.getIdToken?.(forceRefresh)
  if (!token) {
    throw new Error('Sign in to use social features.')
  }
  return token
}

async function socialRequest(path, body = {}, { method = 'POST' } = {}) {
  let token = await getAuthToken()
  let lastError = null

  for (const endpoint of apiCandidates(path)) {
    try {
      const execute = async () => fetch(endpoint, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: method === 'GET' ? undefined : JSON.stringify(body || {}),
      })

      let response = await execute()
      if (response.status === 401) {
        token = await getAuthToken(true)
        response = await execute()
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase()
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : null

      if (!response.ok || payload?.success === false) {
        lastError = new Error(payload?.error || `Social request failed (${response.status})`)
        continue
      }

      return payload || { success: true }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Social request failed')
}

export function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 24)
}

export function toMillis(value) {
  if (!value) return 0
  if (typeof value === 'number') return value
  if (value instanceof Date) return value.getTime()
  if (typeof value?.toMillis === 'function') return value.toMillis()
  return 0
}

export function isPresenceOnline(presence) {
  if (!presence?.online) return false
  const updatedAtMs = toMillis(presence.updatedAt || presence.lastSeen)
  return Boolean(updatedAtMs) && Date.now() - updatedAtMs <= ONLINE_STALE_MS
}

export function getPreferredUsername(profile) {
  return profile?.claimedUsername || profile?.username || null
}

function buildProfilePayload(user) {
  if (!user?.uid) return null
  return {
    uid: user.uid,
    displayName: user.displayName || (user.isGuest ? 'Guest' : 'Player'),
    email: user.email || null,
    photoURL: user.photoURL || null,
    isGuest: Boolean(user.isGuest),
  }
}

export async function syncSocialState({ user, presence }) {
  const response = await socialRequest('/api/social/sync', {
    profile: buildProfilePayload(user),
    presence: presence || {},
  })
  return response.state || null
}

export async function markSocialOffline() {
  await socialRequest('/api/social/presence/offline', {})
}

export async function findUserByLookup(value) {
  const response = await socialRequest('/api/social/find-user', {
    lookup: String(value || '').trim(),
  })
  return response.user || null
}

export async function claimUsername({ user, username }) {
  const response = await socialRequest('/api/social/username/claim', {
    profile: buildProfilePayload(user),
    username,
  })
  return response.profile || null
}

export async function sendFriendRequest({ fromUser, targetLookup }) {
  const response = await socialRequest('/api/social/friend-request/send', {
    profile: buildProfilePayload(fromUser),
    lookup: targetLookup,
  })
  return response.result || null
}

export async function acceptFriendRequest({ requestId }) {
  const response = await socialRequest('/api/social/friend-request/accept', { requestId })
  return response.request || null
}

export async function declineFriendRequest({ requestId }) {
  const response = await socialRequest('/api/social/friend-request/decline', { requestId })
  return response.request || null
}

export async function cancelFriendRequest({ requestId }) {
  const response = await socialRequest('/api/social/friend-request/cancel', { requestId })
  return response.request || null
}

export async function removeFriend({ friendUid }) {
  const response = await socialRequest('/api/social/friend/remove', { friendUid })
  return response.result || null
}

export async function sendGameInvite({ fromUser, toUid, roomCode, gameType, maxPlayers, message }) {
  const response = await socialRequest('/api/social/game-invite/send', {
    profile: buildProfilePayload(fromUser),
    toUid,
    roomCode,
    gameType,
    maxPlayers,
    message,
  })
  return response.invite || null
}

export async function acceptGameInvite({ inviteId }) {
  const response = await socialRequest('/api/social/game-invite/accept', { inviteId })
  return response.invite || null
}

export async function declineGameInvite({ inviteId }) {
  const response = await socialRequest('/api/social/game-invite/decline', { inviteId })
  return response.invite || null
}

export async function cancelGameInvite({ inviteId }) {
  const response = await socialRequest('/api/social/game-invite/cancel', { inviteId })
  return response.invite || null
}

export async function setSocialEdge({ targetUser, blocked = false, muted = false }) {
  const response = await socialRequest('/api/social/edge', {
    targetUid: targetUser?.uid,
    blocked,
    muted,
  })
  return response.edge || null
}
