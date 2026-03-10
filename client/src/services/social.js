import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  enableNetwork,
  getDoc,
  getDocs,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { auth, db } from '../firebase'

const USERS_COLLECTION = 'users'
const USERNAMES_COLLECTION = 'usernames'
const PRESENCE_COLLECTION = 'presence'
const FRIEND_REQUESTS_COLLECTION = 'friendRequests'
const FRIENDSHIPS_COLLECTION = 'friendships'
const GAME_INVITES_COLLECTION = 'gameInvites'
const SOCIAL_EDGES_COLLECTION = 'socialEdges'

const GAME_INVITE_TTL_MS = 2 * 60 * 1000
const ONLINE_STALE_MS = 90 * 1000
const FIRESTORE_RETRY_ATTEMPTS = 2
const FIRESTORE_RETRY_DELAY_MS = 450
const FIRESTORE_PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID
const FIRESTORE_REST_BASE = FIRESTORE_PROJECT_ID
  ? `https://firestore.googleapis.com/v1/projects/${FIRESTORE_PROJECT_ID}/databases/(default)/documents`
  : null
const SOCIAL_SERVER_URL = import.meta.env.VITE_SERVER_URL || ''
const SOCIAL_WEB_ORIGIN = import.meta.env.VITE_SOCIAL_WEB_ORIGIN || 'https://cardtrap.com'

function normalize(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 24)
}

function createUsernameFallback(user) {
  const fromProfile = normalizeUsername(user?.username || '')
  if (fromProfile) return fromProfile

  const fromDisplayName = normalizeUsername(user?.displayName || '')
  if (fromDisplayName) return fromDisplayName

  const fromEmail = normalizeUsername(String(user?.email || '').split('@')[0] || '')
  if (fromEmail) return fromEmail

  const uidSeed = normalizeUsername(user?.uid || '')
  return uidSeed ? `player_${uidSeed.slice(0, 8)}` : 'player'
}

function buildFriendshipId(uidA, uidB) {
  return [uidA, uidB].sort().join('__')
}

function buildFriendRequestId(fromUid, toUid) {
  return `${fromUid}__${toUid}`
}

function buildGameInviteId(fromUid, toUid) {
  return `${fromUid}__${toUid}`
}

function buildSocialEdgeId(ownerUid, targetUid) {
  return `${ownerUid}__${targetUid}`
}

export function toMillis(value) {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return value
  return 0
}

export function isPresenceOnline(presence) {
  if (!presence?.online) return false
  const updatedAtMs = toMillis(presence.updatedAt || presence.lastSeen)
  if (!updatedAtMs) return false
  return Date.now() - updatedAtMs <= ONLINE_STALE_MS
}

function isInviteExpired(invite) {
  const expiresAtMs = toMillis(invite?.expiresAt)
  if (!expiresAtMs) return false
  return Date.now() > expiresAtMs
}

function isFirestoreOfflineError(error) {
  const code = String(error?.code || '').toLowerCase()
  const message = String(error?.message || '').toLowerCase()

  return (
    code === 'unavailable'
    || code === 'failed-precondition'
    || code === 'deadline-exceeded'
    || message.includes('client is offline')
    || message.includes('network')
    || message.includes('failed to fetch')
    || message.includes('fetch failed')
  )
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function getStringField(fields, key) {
  return fields?.[key]?.stringValue ?? null
}

function getBoolField(fields, key) {
  return fields?.[key]?.booleanValue ?? false
}

function parseRestUserDocument(document) {
  if (!document?.name) return null

  const uid = document.name.split('/').pop() || null
  const fields = document.fields || {}

  if (!uid) return null

  return {
    uid,
    displayName: getStringField(fields, 'displayName') || 'Player',
    displayNameLower: getStringField(fields, 'displayNameLower') || null,
    username: getStringField(fields, 'username') || null,
    usernameLower: getStringField(fields, 'usernameLower') || null,
    claimedUsername: getStringField(fields, 'claimedUsername') || null,
    claimedUsernameLower: getStringField(fields, 'claimedUsernameLower') || null,
    email: getStringField(fields, 'email') || null,
    emailLower: getStringField(fields, 'emailLower') || null,
    photoURL: getStringField(fields, 'photoURL') || null,
    isGuest: getBoolField(fields, 'isGuest'),
  }
}

function getPreferredUsername(profile) {
  return profile?.claimedUsername || profile?.username || null
}

async function getAuthIdToken(forceRefresh = false) {
  const token = await auth.currentUser?.getIdToken?.(forceRefresh)
  if (!token) {
    throw new Error('Missing Firebase auth token for friend lookup.')
  }
  return token
}

async function fetchFirestoreRest(path, { method = 'GET', body } = {}) {
  if (!FIRESTORE_REST_BASE) {
    throw new Error('Missing Firestore project configuration.')
  }

  const token = await getAuthIdToken()
  const response = await fetch(`${FIRESTORE_REST_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (response.status === 404) return null

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(payload?.error?.message || `Firestore REST error (${response.status})`)
  }
  return payload
}

async function findUserByLookupViaBackend(lookup) {
  let token = await getAuthIdToken()

  const isNativePlatform = Boolean(globalThis?.Capacitor?.isNativePlatform?.())
  const endpoints = []

  if (isNativePlatform && SOCIAL_SERVER_URL) {
    endpoints.push(`${SOCIAL_SERVER_URL}/api/social/find-user`)
    endpoints.push(`${SOCIAL_WEB_ORIGIN}/api/social/find-user`)
    endpoints.push('/api/social/find-user')
  } else {
    endpoints.push('/api/social/find-user')
    endpoints.push(`${SOCIAL_WEB_ORIGIN}/api/social/find-user`)
    if (SOCIAL_SERVER_URL) {
      endpoints.push(`${SOCIAL_SERVER_URL}/api/social/find-user`)
    }
  }

  const uniqueEndpoints = [...new Set(endpoints)]
  let lastError = null

  for (const endpoint of uniqueEndpoints) {
    try {
      const doRequest = async () => fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lookup }),
      })

      let response = await doRequest()
      if (response.status === 401) {
        token = await getAuthIdToken(true)
        response = await doRequest()
      }

      const contentType = String(response.headers.get('content-type') || '').toLowerCase()
      const payload = contentType.includes('application/json')
        ? await response.json().catch(() => null)
        : null

      if (!response.ok) {
        lastError = new Error(payload?.error || `Social lookup failed (${response.status})`)
        continue
      }

      if (!payload || payload.success !== true) {
        // Some hosts can return HTML/index fallback with 200. Treat as invalid and
        // continue to the next endpoint instead of returning "not found".
        lastError = new Error(`Unexpected social lookup response from ${endpoint}`)
        continue
      }

      return payload.user || null
    } catch (error) {
      lastError = error
    }
  }

  throw lastError || new Error('Backend social lookup failed')
}

async function runUserQueryByField(fieldPath, value) {
  const response = await fetchFirestoreRest(':runQuery', {
    method: 'POST',
    body: {
      structuredQuery: {
        from: [{ collectionId: USERS_COLLECTION }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value: { stringValue: value },
          },
        },
        limit: 1,
      },
    },
  })

  const rows = Array.isArray(response) ? response : []
  const docRow = rows.find((row) => row?.document?.name)
  return parseRestUserDocument(docRow?.document)
}

async function findUserByLookupViaRest(lookup, normalized) {
  if (!FIRESTORE_REST_BASE) return null

  const normalizedUsername = normalizeUsername(lookup)
  if (normalizedUsername) {
    const usernameMatch = await runUserQueryByField('claimedUsernameLower', normalizedUsername)
    if (usernameMatch) return usernameMatch
  }

  if (lookup.includes('@')) {
    const emailMatch = await runUserQueryByField('emailLower', normalized)
    if (emailMatch) return emailMatch

    const exactEmailMatch = await runUserQueryByField('email', lookup)
    if (exactEmailMatch) return exactEmailMatch

    if (lookup !== normalized) {
      const normalizedEmailMatch = await runUserQueryByField('email', normalized)
      if (normalizedEmailMatch) return normalizedEmailMatch
    }
  }

  const directDoc = await fetchFirestoreRest(`/users/${encodeURIComponent(lookup)}`)
  const directUser = parseRestUserDocument(directDoc)
  if (directUser) return directUser

  return runUserQueryByField('displayNameLower', normalized)
}

async function withFirestoreRetry(task) {
  let lastError = null

  for (let attempt = 1; attempt <= FIRESTORE_RETRY_ATTEMPTS; attempt += 1) {
    try {
      return await task()
    } catch (error) {
      lastError = error
      if (!isFirestoreOfflineError(error) || attempt >= FIRESTORE_RETRY_ATTEMPTS) {
        throw error
      }
      await enableNetwork(db).catch(() => {})
      await delay(FIRESTORE_RETRY_DELAY_MS * attempt)
    }
  }

  throw lastError || new Error('Firestore request failed')
}

export async function upsertUserProfile(user) {
  if (!user?.uid) return

  const ref = doc(db, USERS_COLLECTION, user.uid)
  const username = createUsernameFallback(user)

  const profile = {
    uid: user.uid,
    displayName: user.displayName || 'Player',
    displayNameLower: normalize(user.displayName || 'Player'),
    username,
    usernameLower: normalizeUsername(username),
    email: user.email || null,
    emailLower: normalize(user.email),
    photoURL: user.photoURL || null,
    isGuest: Boolean(user.isGuest),
    updatedAt: serverTimestamp(),
  }

  try {
    // Avoid read-before-write here. Reads are the first thing to fail in
    // transient mobile networks and trigger noisy "client is offline" errors.
    await withFirestoreRetry(() => setDoc(ref, profile, { merge: true }))
  } catch (error) {
    if (isFirestoreOfflineError(error)) {
      // Best-effort sync: we'll retry on next heartbeat/foreground event.
      return
    }
    throw error
  }
}

export async function setUserPresence(uid, payload = {}) {
  if (!uid) return

  const ref = doc(db, PRESENCE_COLLECTION, uid)
  await setDoc(
    ref,
    {
      uid,
      online: true,
      updatedAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      ...payload,
    },
    { merge: true },
  )
}

export async function setUserOffline(uid) {
  if (!uid) return

  const ref = doc(db, PRESENCE_COLLECTION, uid)
  await setDoc(
    ref,
    {
      uid,
      online: false,
      updatedAt: serverTimestamp(),
      lastSeen: serverTimestamp(),
      currentRoomCode: null,
    },
    { merge: true },
  )
}

export async function findUserByLookup(value) {
  const lookup = String(value || '').trim()
  const normalized = normalize(lookup)
  const normalizedUsername = normalizeUsername(lookup)

  if (!normalized) return null

  let backendLookupError = null

  // Backend-first lookup is more stable than Firestore SDK in WebView or
  // constrained networks. If backend succeeds, treat that result as authoritative.
  try {
    return await findUserByLookupViaBackend(lookup)
  } catch (backendError) {
    backendLookupError = backendError
    console.warn('Backend social lookup failed:', backendError)
  }

  try {
    await enableNetwork(db).catch(() => {})
    return await withFirestoreRetry(async () => {
      if (normalizedUsername) {
        const usernameQuery = query(
          collection(db, USERS_COLLECTION),
          where('claimedUsernameLower', '==', normalizedUsername),
          limit(1),
        )
        const usernameMatches = await getDocs(usernameQuery)
        if (!usernameMatches.empty) {
          const match = usernameMatches.docs[0]
          return { uid: match.id, ...match.data() }
        }
      }

      if (lookup.includes('@')) {
        const emailQuery = query(
          collection(db, USERS_COLLECTION),
          where('emailLower', '==', normalized),
          limit(1),
        )
        const emailMatches = await getDocs(emailQuery)
        if (!emailMatches.empty) {
          const match = emailMatches.docs[0]
          return { uid: match.id, ...match.data() }
        }

        const exactEmailQuery = query(
          collection(db, USERS_COLLECTION),
          where('email', '==', lookup),
          limit(1),
        )
        const exactEmailMatches = await getDocs(exactEmailQuery)
        if (!exactEmailMatches.empty) {
          const match = exactEmailMatches.docs[0]
          return { uid: match.id, ...match.data() }
        }

        if (lookup !== normalized) {
          const normalizedEmailQuery = query(
            collection(db, USERS_COLLECTION),
            where('email', '==', normalized),
            limit(1),
          )
          const normalizedEmailMatches = await getDocs(normalizedEmailQuery)
          if (!normalizedEmailMatches.empty) {
            const match = normalizedEmailMatches.docs[0]
            return { uid: match.id, ...match.data() }
          }
        }
      }

      const directRef = doc(db, USERS_COLLECTION, lookup)
      const directSnap = await getDoc(directRef)
      if (directSnap.exists()) {
        return { uid: directSnap.id, ...directSnap.data() }
      }

      const displayNameQuery = query(
        collection(db, USERS_COLLECTION),
        where('displayNameLower', '==', normalized),
        limit(1),
      )
      const nameMatches = await getDocs(displayNameQuery)
      if (!nameMatches.empty) {
        const match = nameMatches.docs[0]
        return { uid: match.id, ...match.data() }
      }

      return null
    })
  } catch (error) {
    let restLookupError = null

    try {
      const restUser = await findUserByLookupViaRest(lookup, normalized)
      if (restUser) return restUser
    } catch (restError) {
      restLookupError = restError
      const restMessage = String(restError?.message || '').toLowerCase()
      if (restMessage.includes('permission_denied') || restMessage.includes('missing or insufficient permissions')) {
        throw new Error('Firestore rules are blocking user lookup. Please verify Firestore rules deployment.')
      }
      if (!isFirestoreOfflineError(error)) {
        throw error
      }
    }

    if (restLookupError && !isFirestoreOfflineError(restLookupError)) {
      throw restLookupError
    }
    if (backendLookupError && !isFirestoreOfflineError(backendLookupError)) {
      throw backendLookupError
    }

    if (isFirestoreOfflineError(error)) {
      throw new Error('Firebase connection is temporarily offline. Please try again in a few seconds.')
    }
    throw error
  }
}

async function readSocialEdge(ownerUid, targetUid) {
  if (!ownerUid || !targetUid) return null
  const edgeRef = doc(db, SOCIAL_EDGES_COLLECTION, buildSocialEdgeId(ownerUid, targetUid))
  const edgeSnap = await withFirestoreRetry(() => getDoc(edgeRef))
  return edgeSnap.exists() ? edgeSnap.data() : null
}

async function ensureUsersCanInteract(ownerUid, targetUid) {
  const [myEdge, reverseEdge] = await Promise.all([
    readSocialEdge(ownerUid, targetUid),
    readSocialEdge(targetUid, ownerUid),
  ])

  if (myEdge?.blocked) {
    throw new Error('Unblock this user before sending requests or invites.')
  }

  if (reverseEdge?.blocked) {
    throw new Error('This user is not available for requests or invites.')
  }
}

export async function claimUsername({ user, username }) {
  if (!user?.uid) {
    throw new Error('Sign in to claim a username.')
  }

  const normalizedUsername = normalizeUsername(username)
  if (normalizedUsername.length < 3) {
    throw new Error('Username must be at least 3 characters.')
  }
  if (normalizedUsername.length > 24) {
    throw new Error('Username must be 24 characters or fewer.')
  }

  const userRef = doc(db, USERS_COLLECTION, user.uid)
  const usernameRef = doc(db, USERNAMES_COLLECTION, normalizedUsername)

  try {
    return await runTransaction(db, async (tx) => {
      const [userSnap, usernameSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(usernameRef),
      ])

      const existingOwnerUid = usernameSnap.exists() ? usernameSnap.data().ownerUid : null
      if (existingOwnerUid && existingOwnerUid !== user.uid) {
        throw new Error('That username is already taken.')
      }

      const previousUsername = normalizeUsername(userSnap.exists() ? userSnap.data().claimedUsernameLower || userSnap.data().claimedUsername : '')
      if (previousUsername && previousUsername !== normalizedUsername) {
        const previousRef = doc(db, USERNAMES_COLLECTION, previousUsername)
        const previousSnap = await tx.get(previousRef)
        if (previousSnap.exists() && previousSnap.data().ownerUid === user.uid) {
          tx.delete(previousRef)
        }
      }

      tx.set(usernameRef, {
        ownerUid: user.uid,
        username: normalizedUsername,
        usernameLower: normalizedUsername,
        updatedAt: serverTimestamp(),
        claimedAt: serverTimestamp(),
      }, { merge: true })

      tx.set(userRef, {
        uid: user.uid,
        displayName: user.displayName || 'Player',
        displayNameLower: normalize(user.displayName || 'Player'),
        email: user.email || null,
        emailLower: normalize(user.email),
        photoURL: user.photoURL || null,
        isGuest: Boolean(user.isGuest),
        claimedUsername: normalizedUsername,
        claimedUsernameLower: normalizedUsername,
        updatedAt: serverTimestamp(),
      }, { merge: true })

      return {
        username: normalizedUsername,
        claimedUsername: normalizedUsername,
      }
    })
  } catch (error) {
    if (isFirestoreOfflineError(error)) {
      throw new Error('Network issue while claiming username. Please try again.')
    }
    throw error
  }
}

export async function setSocialEdge({
  ownerUser,
  targetUser,
  blocked = false,
  muted = false,
}) {
  if (!ownerUser?.uid) {
    throw new Error('Sign in to update social controls.')
  }
  if (!targetUser?.uid || targetUser.uid === ownerUser.uid) {
    throw new Error('Invalid user selection.')
  }

  const ownerUid = ownerUser.uid
  const targetUid = targetUser.uid
  const edgeRef = doc(db, SOCIAL_EDGES_COLLECTION, buildSocialEdgeId(ownerUid, targetUid))
  const nextBlocked = Boolean(blocked)
  const nextMuted = nextBlocked ? true : Boolean(muted)

  try {
    const existingEdge = await readSocialEdge(ownerUid, targetUid)

    if (!nextBlocked && !nextMuted) {
      if (existingEdge) {
        await withFirestoreRetry(() => deleteDoc(edgeRef))
      }
      return { targetUid, blocked: false, muted: false }
    }

    await withFirestoreRetry(() => setDoc(edgeRef, {
      ownerUid,
      targetUid,
      targetDisplayName: targetUser.displayName || 'Player',
      targetPhotoURL: targetUser.photoURL || null,
      blocked: nextBlocked,
      muted: nextMuted,
      updatedAt: serverTimestamp(),
      createdAt: existingEdge?.createdAt || serverTimestamp(),
    }, { merge: true }))

    if (nextBlocked) {
      const friendshipRef = doc(db, FRIENDSHIPS_COLLECTION, buildFriendshipId(ownerUid, targetUid))
      const forwardRequestRef = doc(db, FRIEND_REQUESTS_COLLECTION, buildFriendRequestId(ownerUid, targetUid))
      const reverseRequestRef = doc(db, FRIEND_REQUESTS_COLLECTION, buildFriendRequestId(targetUid, ownerUid))
      const forwardInviteRef = doc(db, GAME_INVITES_COLLECTION, buildGameInviteId(ownerUid, targetUid))
      const reverseInviteRef = doc(db, GAME_INVITES_COLLECTION, buildGameInviteId(targetUid, ownerUid))

      await Promise.all([
        withFirestoreRetry(async () => {
          const snap = await getDoc(friendshipRef)
          if (snap.exists()) await deleteDoc(friendshipRef)
        }),
        withFirestoreRetry(async () => {
          const snap = await getDoc(forwardRequestRef)
          if (snap.exists()) await deleteDoc(forwardRequestRef)
        }),
        withFirestoreRetry(async () => {
          const snap = await getDoc(reverseRequestRef)
          if (snap.exists()) await deleteDoc(reverseRequestRef)
        }),
        withFirestoreRetry(async () => {
          const snap = await getDoc(forwardInviteRef)
          if (snap.exists()) await deleteDoc(forwardInviteRef)
        }),
        withFirestoreRetry(async () => {
          const snap = await getDoc(reverseInviteRef)
          if (snap.exists()) await deleteDoc(reverseInviteRef)
        }),
      ])
    }

    return { targetUid, blocked: nextBlocked, muted: nextMuted }
  } catch (error) {
    if (isFirestoreOfflineError(error)) {
      throw new Error('Network issue while updating social controls. Please try again.')
    }
    throw error
  }
}

export async function sendFriendRequest({ fromUser, targetLookup }) {
  if (!fromUser?.uid) {
    throw new Error('Sign in to add friends.')
  }

  // Ensure the sender profile exists before searching/creating requests.
  await upsertUserProfile(fromUser).catch(() => {})

  const targetUser = await findUserByLookup(targetLookup)
  if (!targetUser?.uid) {
    throw new Error('No user found for that username, email, or ID. Ask your friend to sign in once on the latest build.')
  }

  if (targetUser.uid === fromUser.uid) {
    throw new Error('You cannot add yourself.')
  }

  await ensureUsersCanInteract(fromUser.uid, targetUser.uid)

  const friendshipRef = doc(
    db,
    FRIENDSHIPS_COLLECTION,
    buildFriendshipId(fromUser.uid, targetUser.uid),
  )
  const requestRef = doc(
    db,
    FRIEND_REQUESTS_COLLECTION,
    buildFriendRequestId(fromUser.uid, targetUser.uid),
  )
  const reverseRequestRef = doc(
    db,
    FRIEND_REQUESTS_COLLECTION,
    buildFriendRequestId(targetUser.uid, fromUser.uid),
  )

  try {
    const friendshipSnap = await withFirestoreRetry(() => getDoc(friendshipRef))
    if (friendshipSnap.exists()) {
      throw new Error('You are already friends.')
    }

    const reverseRequestSnap = await withFirestoreRetry(() => getDoc(reverseRequestRef))
    if (reverseRequestSnap.exists() && reverseRequestSnap.data().status === 'pending') {
      await withFirestoreRetry(async () => {
        await updateDoc(reverseRequestRef, {
          status: 'accepted',
          updatedAt: serverTimestamp(),
          respondedAt: serverTimestamp(),
        })
        await setDoc(friendshipRef, {
          userA: fromUser.uid < targetUser.uid ? fromUser.uid : targetUser.uid,
          userB: fromUser.uid < targetUser.uid ? targetUser.uid : fromUser.uid,
          users: [fromUser.uid, targetUser.uid],
          createdAt: serverTimestamp(),
        })
      })

      return {
        mode: 'auto-accepted',
        targetUser,
      }
    }

    const existingRequestSnap = await withFirestoreRetry(() => getDoc(requestRef))
    if (existingRequestSnap.exists() && existingRequestSnap.data().status === 'pending') {
      throw new Error('Friend request already sent.')
    }

    await withFirestoreRetry(() => setDoc(requestRef, {
      fromUid: fromUser.uid,
      toUid: targetUser.uid,
      fromDisplayName: fromUser.displayName || 'Player',
      fromPhotoURL: fromUser.photoURL || null,
      toDisplayName: targetUser.displayName || 'Player',
      toPhotoURL: targetUser.photoURL || null,
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }))

    return {
      mode: 'sent',
      targetUser,
    }
  } catch (error) {
    if (isFirestoreOfflineError(error)) {
      throw new Error('Network issue while sending request. Please check internet and try again.')
    }
    throw error
  }
}

export async function acceptFriendRequest({ requestId, currentUid }) {
  if (!requestId || !currentUid) {
    throw new Error('Missing friend request details.')
  }

  const requestRef = doc(db, FRIEND_REQUESTS_COLLECTION, requestId)

  try {
    return runTransaction(db, async (tx) => {
      const requestSnap = await tx.get(requestRef)
      if (!requestSnap.exists()) {
        throw new Error('Friend request no longer exists.')
      }

      const request = requestSnap.data()
      if (request.toUid !== currentUid) {
        throw new Error('You cannot accept this request.')
      }
      if (request.status !== 'pending') {
        throw new Error('Friend request is no longer pending.')
      }

      const friendshipRef = doc(
        db,
        FRIENDSHIPS_COLLECTION,
        buildFriendshipId(request.fromUid, request.toUid),
      )

      tx.update(requestRef, {
        status: 'accepted',
        updatedAt: serverTimestamp(),
        respondedAt: serverTimestamp(),
      })

      tx.set(friendshipRef, {
        userA: request.fromUid < request.toUid ? request.fromUid : request.toUid,
        userB: request.fromUid < request.toUid ? request.toUid : request.fromUid,
        users: [request.fromUid, request.toUid],
        createdAt: serverTimestamp(),
      })

      return request
    })
  } catch (error) {
    if (isFirestoreOfflineError(error)) {
      throw new Error('Network issue while accepting friend request. Please try again.')
    }
    throw error
  }
}

export async function declineFriendRequest({ requestId, currentUid }) {
  if (!requestId || !currentUid) {
    throw new Error('Missing friend request details.')
  }

  const requestRef = doc(db, FRIEND_REQUESTS_COLLECTION, requestId)
  const requestSnap = await getDoc(requestRef)

  if (!requestSnap.exists()) {
    throw new Error('Friend request no longer exists.')
  }

  const request = requestSnap.data()
  if (request.toUid !== currentUid) {
    throw new Error('You cannot decline this request.')
  }
  if (request.status !== 'pending') {
    throw new Error('Friend request is no longer pending.')
  }

  await updateDoc(requestRef, {
    status: 'declined',
    updatedAt: serverTimestamp(),
    respondedAt: serverTimestamp(),
  })

  return request
}

export async function cancelFriendRequest({ requestId, currentUid }) {
  if (!requestId || !currentUid) {
    throw new Error('Missing friend request details.')
  }

  const requestRef = doc(db, FRIEND_REQUESTS_COLLECTION, requestId)
  const requestSnap = await getDoc(requestRef)

  if (!requestSnap.exists()) {
    throw new Error('Friend request no longer exists.')
  }

  const request = requestSnap.data()
  if (request.fromUid !== currentUid) {
    throw new Error('You cannot cancel this request.')
  }
  if (request.status !== 'pending') {
    throw new Error('Friend request is no longer pending.')
  }

  await updateDoc(requestRef, {
    status: 'canceled',
    updatedAt: serverTimestamp(),
    respondedAt: serverTimestamp(),
  })

  return request
}

export async function removeFriend({ uid, friendUid }) {
  if (!uid || !friendUid) {
    throw new Error('Missing friend details.')
  }

  const friendshipRef = doc(db, FRIENDSHIPS_COLLECTION, buildFriendshipId(uid, friendUid))

  try {
    await withFirestoreRetry(async () => {
      const currentFriendshipSnap = await getDoc(friendshipRef)
      if (currentFriendshipSnap.exists()) {
        await deleteDoc(friendshipRef)
      }
    })
  } catch (error) {
    if (isFirestoreOfflineError(error)) {
      throw new Error('Network issue while removing friend. Please try again.')
    }
    throw error
  }
}

export async function sendGameInvite({
  fromUser,
  toUid,
  roomCode,
  gameType = 'callbreak',
  maxPlayers = 4,
  message = '',
}) {
  if (!fromUser?.uid) {
    throw new Error('Sign in to invite friends.')
  }
  if (!toUid) {
    throw new Error('Please select a friend to invite.')
  }
  if (!roomCode) {
    throw new Error('Create or join a room before sending an invite.')
  }
  if (toUid === fromUser.uid) {
    throw new Error('You cannot invite yourself.')
  }

  await ensureUsersCanInteract(fromUser.uid, toUid)

  const friendshipRef = doc(db, FRIENDSHIPS_COLLECTION, buildFriendshipId(fromUser.uid, toUid))
  const inviteRef = doc(db, GAME_INVITES_COLLECTION, buildGameInviteId(fromUser.uid, toUid))

  try {
    const friendshipSnap = await withFirestoreRetry(() => getDoc(friendshipRef))
    if (!friendshipSnap.exists()) {
      throw new Error('This user is not in your friends list.')
    }

    await withFirestoreRetry(() => setDoc(inviteRef, {
      fromUid: fromUser.uid,
      toUid,
      fromDisplayName: fromUser.displayName || 'Player',
      fromPhotoURL: fromUser.photoURL || null,
      roomCode: roomCode.toUpperCase(),
      gameType: gameType === 'donkey' ? 'donkey' : 'callbreak',
      maxPlayers: Math.min(Math.max(Number(maxPlayers) || 4, 2), 5),
      message: String(message || '').trim().slice(0, 120),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + GAME_INVITE_TTL_MS),
    }))

    return {
      id: inviteRef.id,
      roomCode: roomCode.toUpperCase(),
    }
  } catch (error) {
    if (isFirestoreOfflineError(error)) {
      throw new Error('Network issue while sending invite. Please try again.')
    }
    throw error
  }
}

export async function acceptGameInvite({ inviteId, currentUid }) {
  if (!inviteId || !currentUid) {
    throw new Error('Missing invite details.')
  }

  const inviteRef = doc(db, GAME_INVITES_COLLECTION, inviteId)

  try {
    const inviteSnap = await withFirestoreRetry(() => getDoc(inviteRef))
    if (!inviteSnap.exists()) {
      throw new Error('Invite not found.')
    }

    const invite = inviteSnap.data()
    if (invite.toUid !== currentUid) {
      throw new Error('You cannot accept this invite.')
    }
    if (invite.status !== 'pending') {
      throw new Error('Invite is no longer pending.')
    }
    if (isInviteExpired(invite)) {
      await withFirestoreRetry(() => updateDoc(inviteRef, {
        status: 'expired',
        updatedAt: serverTimestamp(),
      }))
      throw new Error('Invite has expired.')
    }

    await withFirestoreRetry(() => updateDoc(inviteRef, {
      status: 'accepted',
      updatedAt: serverTimestamp(),
      respondedAt: serverTimestamp(),
    }))

    return {
      id: inviteId,
      ...invite,
    }
  } catch (error) {
    if (isFirestoreOfflineError(error)) {
      throw new Error('Network issue while accepting invite. Please try again.')
    }
    throw error
  }
}

export async function declineGameInvite({ inviteId, currentUid }) {
  if (!inviteId || !currentUid) {
    throw new Error('Missing invite details.')
  }

  const inviteRef = doc(db, GAME_INVITES_COLLECTION, inviteId)
  const inviteSnap = await getDoc(inviteRef)

  if (!inviteSnap.exists()) {
    throw new Error('Invite not found.')
  }

  const invite = inviteSnap.data()
  if (invite.toUid !== currentUid) {
    throw new Error('You cannot decline this invite.')
  }
  if (invite.status !== 'pending') {
    throw new Error('Invite is no longer pending.')
  }

  await updateDoc(inviteRef, {
    status: 'declined',
    updatedAt: serverTimestamp(),
    respondedAt: serverTimestamp(),
  })

  return invite
}

export async function cancelGameInvite({ inviteId, currentUid }) {
  if (!inviteId || !currentUid) {
    throw new Error('Missing invite details.')
  }

  const inviteRef = doc(db, GAME_INVITES_COLLECTION, inviteId)
  const inviteSnap = await getDoc(inviteRef)

  if (!inviteSnap.exists()) {
    throw new Error('Invite not found.')
  }

  const invite = inviteSnap.data()
  if (invite.fromUid !== currentUid) {
    throw new Error('You cannot cancel this invite.')
  }
  if (invite.status !== 'pending') {
    throw new Error('Invite is no longer pending.')
  }

  await updateDoc(inviteRef, {
    status: 'canceled',
    updatedAt: serverTimestamp(),
    respondedAt: serverTimestamp(),
  })

  return invite
}

export async function expireInviteIfNeeded(inviteId, inviteData) {
  if (!inviteId || !inviteData) return false
  if (inviteData.status !== 'pending') return false
  if (!isInviteExpired(inviteData)) return false

  const inviteRef = doc(db, GAME_INVITES_COLLECTION, inviteId)
  await updateDoc(inviteRef, {
    status: 'expired',
    updatedAt: serverTimestamp(),
  })
  return true
}

export {
  USERS_COLLECTION,
  USERNAMES_COLLECTION,
  PRESENCE_COLLECTION,
  FRIEND_REQUESTS_COLLECTION,
  FRIENDSHIPS_COLLECTION,
  GAME_INVITES_COLLECTION,
  SOCIAL_EDGES_COLLECTION,
  getPreferredUsername,
}
