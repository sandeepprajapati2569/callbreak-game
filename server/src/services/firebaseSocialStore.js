import { decodeJwtPayload } from './firebasePartyStore.js';

const USERS_COLLECTION = 'users';
const USERNAMES_COLLECTION = 'usernames';
const PRESENCE_COLLECTION = 'presence';
const FRIEND_REQUESTS_COLLECTION = 'friendRequests';
const FRIENDSHIPS_COLLECTION = 'friendships';
const GAME_INVITES_COLLECTION = 'gameInvites';
const SOCIAL_EDGES_COLLECTION = 'socialEdges';

const GAME_INVITE_TTL_MS = 2 * 60 * 1000;
const ONLINE_STALE_MS = 90 * 1000;
const FIRESTORE_API_BASE = 'https://firestore.googleapis.com/v1/projects';

function now() {
  return Date.now();
}

function timestampIso(value = now()) {
  return new Date(value).toISOString();
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 24);
}

function createUsernameBase(profile = {}, uid = '') {
  const fromClaimed = normalizeUsername(profile.claimedUsername || profile.username || '');
  if (fromClaimed) return fromClaimed;

  const fromDisplayName = normalizeUsername(profile.displayName || '');
  if (fromDisplayName) return fromDisplayName;

  const fromEmail = normalizeUsername(String(profile.email || '').split('@')[0] || '');
  if (fromEmail) return fromEmail;

  const uidSeed = normalizeUsername(uid);
  return uidSeed ? `player_${uidSeed.slice(0, 8)}` : 'player';
}

function buildFriendshipId(uidA, uidB) {
  return [uidA, uidB].sort().join('__');
}

function buildFriendRequestId(fromUid, toUid) {
  return `${fromUid}__${toUid}`;
}

function buildGameInviteId(fromUid, toUid) {
  return `${fromUid}__${toUid}`;
}

function buildSocialEdgeId(ownerUid, targetUid) {
  return `${ownerUid}__${targetUid}`;
}

function firestoreRestBase(projectId) {
  return `${FIRESTORE_API_BASE}/${projectId}/databases/(default)/documents`;
}

function collectionUrl(projectId, collectionName) {
  return `${firestoreRestBase(projectId)}/${collectionName}`;
}

function documentUrl(projectId, collectionName, documentId) {
  return `${collectionUrl(projectId, collectionName)}/${encodeURIComponent(documentId)}`;
}

function base64UrlToBuffer(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), '=');
  return Buffer.from(padded, 'base64');
}

function decodeTokenClaims(idToken) {
  try {
    return decodeJwtPayload(idToken) || {};
  } catch {
    return {};
  }
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) {
    return { nullValue: null };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((entry) => toFirestoreValue(entry)),
      },
    };
  }

  switch (typeof value) {
    case 'string':
      return { stringValue: value };
    case 'boolean':
      return { booleanValue: value };
    case 'number':
      if (Number.isInteger(value)) {
        return { integerValue: String(value) };
      }
      return { doubleValue: value };
    case 'object':
      if (value instanceof Date) {
        return { timestampValue: value.toISOString() };
      }
      return {
        mapValue: {
          fields: Object.fromEntries(
            Object.entries(value)
              .filter(([, nested]) => nested !== undefined)
              .map(([key, nested]) => [key, toFirestoreValue(nested)]),
          ),
        },
      };
    default:
      return { stringValue: String(value) };
  }
}

function objectToFirestoreFields(value) {
  return Object.fromEntries(
    Object.entries(value || {})
      .filter(([, fieldValue]) => fieldValue !== undefined)
      .map(([key, fieldValue]) => [key, toFirestoreValue(fieldValue)]),
  );
}

function fromFirestoreValue(value) {
  if (!value || typeof value !== 'object') return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return new Date(value.timestampValue).getTime();
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) {
    const values = Array.isArray(value.arrayValue?.values) ? value.arrayValue.values : [];
    return values.map((entry) => fromFirestoreValue(entry));
  }
  if ('mapValue' in value) {
    const fields = value.mapValue?.fields || {};
    return Object.fromEntries(Object.entries(fields).map(([key, entry]) => [key, fromFirestoreValue(entry)]));
  }
  return null;
}

function documentToObject(document) {
  if (!document?.name) return null;
  const id = String(document.name).split('/').pop();
  const fields = document.fields || {};
  const data = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, fromFirestoreValue(value)]));
  return {
    id,
    ...data,
  };
}

async function fetchFirestore(projectId, idToken, urlOrPath, { method = 'GET', body } = {}) {
  const url = String(urlOrPath).startsWith('http')
    ? urlOrPath
    : `${firestoreRestBase(projectId)}${urlOrPath}`;

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (response.status === 404) return null;

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Firestore REST error (${response.status})`);
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function getDocument(ctx, collectionName, documentId) {
  if (!documentId) return null;
  const response = await fetchFirestore(ctx.projectId, ctx.idToken, documentUrl(ctx.projectId, collectionName, documentId));
  return documentToObject(response);
}

async function setDocument(ctx, collectionName, documentId, data) {
  const response = await fetchFirestore(ctx.projectId, ctx.idToken, documentUrl(ctx.projectId, collectionName, documentId), {
    method: 'PATCH',
    body: {
      fields: objectToFirestoreFields(data),
    },
  });
  return documentToObject(response);
}

async function deleteDocument(ctx, collectionName, documentId) {
  await fetchFirestore(ctx.projectId, ctx.idToken, documentUrl(ctx.projectId, collectionName, documentId), {
    method: 'DELETE',
  });
}

async function createDocument(ctx, collectionName, documentId, data) {
  const url = `${collectionUrl(ctx.projectId, collectionName)}?documentId=${encodeURIComponent(documentId)}`;
  const response = await fetchFirestore(ctx.projectId, ctx.idToken, url, {
    method: 'POST',
    body: {
      fields: objectToFirestoreFields(data),
    },
  });
  return documentToObject(response);
}

async function runQuery(ctx, structuredQuery) {
  const response = await fetchFirestore(ctx.projectId, ctx.idToken, ':runQuery', {
    method: 'POST',
    body: { structuredQuery },
  });

  if (!Array.isArray(response)) return [];
  return response
    .map((row) => documentToObject(row?.document))
    .filter(Boolean);
}

async function queryByField(ctx, collectionName, fieldPath, op, value, limit = 50) {
  return runQuery(ctx, {
    from: [{ collectionId: collectionName }],
    where: {
      fieldFilter: {
        field: { fieldPath },
        op,
        value: toFirestoreValue(value),
      },
    },
    limit,
  });
}

async function queryArrayContains(ctx, collectionName, fieldPath, value, limit = 50) {
  return queryByField(ctx, collectionName, fieldPath, 'ARRAY_CONTAINS', value, limit);
}

function toMillis(value) {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return 0;
}

function isPresenceOnline(presence) {
  if (!presence?.online) return false;
  const updatedAtMs = toMillis(presence.updatedAt || presence.lastSeen);
  return Boolean(updatedAtMs) && now() - updatedAtMs <= ONLINE_STALE_MS;
}

function getPreferredUsername(profile) {
  return profile?.claimedUsername || profile?.username || null;
}

async function ensureUsernameReservation(ctx, uid, profile, previousProfile = null) {
  const existingClaim = normalizeUsername(previousProfile?.claimedUsername || previousProfile?.username || '');
  if (existingClaim) {
    const reservation = await getDocument(ctx, USERNAMES_COLLECTION, existingClaim).catch(() => null);
    if (reservation?.ownerUid === uid) {
      return existingClaim;
    }
  }

  const base = createUsernameBase(profile, uid);
  const candidates = [];
  for (let index = 0; index < 50; index += 1) {
    const suffix = index === 0 ? '' : String(index + 1);
    const candidate = normalizeUsername(`${base}${suffix}`.slice(0, 24));
    if (candidate && !candidates.includes(candidate)) {
      candidates.push(candidate);
    }
  }

  const uidCandidate = normalizeUsername(`player_${String(uid || '').replace(/[^a-z0-9]/gi, '').slice(0, 8)}`);
  if (uidCandidate && !candidates.includes(uidCandidate)) {
    candidates.push(uidCandidate);
  }

  for (const candidate of candidates) {
    const reservation = await getDocument(ctx, USERNAMES_COLLECTION, candidate).catch(() => null);
    if (reservation?.ownerUid === uid) {
      return candidate;
    }
    if (reservation) continue;

    try {
      await createDocument(ctx, USERNAMES_COLLECTION, candidate, {
        ownerUid: uid,
        username: candidate,
        usernameLower: candidate,
        claimedAt: timestampIso(),
        updatedAt: timestampIso(),
      });
      return candidate;
    } catch (error) {
      if (Number(error?.status) === 409 || String(error?.message || '').toLowerCase().includes('already exists')) {
        continue;
      }
      throw error;
    }
  }

  throw new Error('Unable to reserve a username right now.');
}

function buildProfileFromClaims(ctx, payloadProfile = {}, existingProfile = null) {
  const claims = ctx.claims || {};
  const signInProvider = String(claims?.firebase?.sign_in_provider || '');
  const isGuest = signInProvider === 'anonymous' || Boolean(payloadProfile?.isGuest);
  const displayName = String(
    payloadProfile.displayName
    || claims.name
    || existingProfile?.displayName
    || (isGuest ? 'Guest' : 'Player')
  ).trim() || (isGuest ? 'Guest' : 'Player');

  return {
    uid: ctx.uid,
    displayName,
    displayNameLower: normalize(displayName),
    username: normalizeUsername(payloadProfile.username || existingProfile?.username || displayName),
    usernameLower: normalizeUsername(payloadProfile.username || existingProfile?.username || displayName),
    email: payloadProfile.email || claims.email || existingProfile?.email || null,
    emailLower: normalize(payloadProfile.email || claims.email || existingProfile?.email || null),
    photoURL: payloadProfile.photoURL || claims.picture || existingProfile?.photoURL || null,
    isGuest,
    updatedAt: timestampIso(),
    createdAt: existingProfile?.createdAt || timestampIso(),
  };
}

async function upsertUserProfile(ctx, payloadProfile = {}) {
  const existingProfile = await getDocument(ctx, USERS_COLLECTION, ctx.uid).catch(() => null);
  const nextProfile = buildProfileFromClaims(ctx, payloadProfile, existingProfile);
  const reservedUsername = await ensureUsernameReservation(ctx, ctx.uid, nextProfile, existingProfile);

  if (
    existingProfile?.claimedUsernameLower
    && existingProfile.claimedUsernameLower !== reservedUsername
  ) {
    const previousReservation = await getDocument(ctx, USERNAMES_COLLECTION, existingProfile.claimedUsernameLower).catch(() => null);
    if (previousReservation?.ownerUid === ctx.uid) {
      await deleteDocument(ctx, USERNAMES_COLLECTION, existingProfile.claimedUsernameLower).catch(() => {});
    }
  }

  nextProfile.claimedUsername = reservedUsername;
  nextProfile.claimedUsernameLower = reservedUsername;

  await setDocument(ctx, USERS_COLLECTION, ctx.uid, {
    ...(existingProfile || {}),
    ...nextProfile,
  });

  return {
    ...(existingProfile || {}),
    ...nextProfile,
  };
}

async function setPresence(ctx, payload = {}, online = true) {
  const existing = await getDocument(ctx, PRESENCE_COLLECTION, ctx.uid).catch(() => null);
  const next = {
    ...(existing || {}),
    uid: ctx.uid,
    online,
    updatedAt: timestampIso(),
    lastSeen: timestampIso(),
    currentRoomCode: online ? (payload.currentRoomCode || null) : null,
    currentPhase: online ? (payload.currentPhase || 'LANDING') : 'LANDING',
    gameType: online ? (payload.gameType || null) : null,
    socketConnected: Boolean(online && payload.socketConnected),
    platform: online ? (payload.platform || existing?.platform || 'web') : (existing?.platform || 'web'),
  };
  await setDocument(ctx, PRESENCE_COLLECTION, ctx.uid, next);
  return next;
}

async function ensureInteractionAllowed(ctx, targetUid) {
  const [myEdge, reverseEdge] = await Promise.all([
    getDocument(ctx, SOCIAL_EDGES_COLLECTION, buildSocialEdgeId(ctx.uid, targetUid)).catch(() => null),
    getDocument(ctx, SOCIAL_EDGES_COLLECTION, buildSocialEdgeId(targetUid, ctx.uid)).catch(() => null),
  ]);

  if (myEdge?.blocked) {
    throw new Error('Unblock this user before sending requests or invites.');
  }
  if (reverseEdge?.blocked) {
    throw new Error('This user is not available for requests or invites.');
  }
}

export async function findUserByLookup(ctx, lookup) {
  const normalized = normalize(lookup);
  const normalizedUsername = normalizeUsername(lookup);
  if (!normalized) return null;

  if (normalizedUsername) {
    const usernameMatches = await queryByField(ctx, USERS_COLLECTION, 'claimedUsernameLower', 'EQUAL', normalizedUsername, 1);
    if (usernameMatches[0]) return usernameMatches[0];
  }

  if (lookup.includes('@')) {
    const emailMatches = await queryByField(ctx, USERS_COLLECTION, 'emailLower', 'EQUAL', normalized, 1);
    if (emailMatches[0]) return emailMatches[0];
  }

  const directMatch = await getDocument(ctx, USERS_COLLECTION, lookup).catch(() => null);
  if (directMatch) return directMatch;

  const displayMatches = await queryByField(ctx, USERS_COLLECTION, 'displayNameLower', 'EQUAL', normalized, 1);
  return displayMatches[0] || null;
}

async function loadProfilesMap(ctx, uids = []) {
  const uniqueIds = [...new Set(uids.filter(Boolean))];
  const entries = await Promise.all(
    uniqueIds.map(async (uid) => [uid, await getDocument(ctx, USERS_COLLECTION, uid).catch(() => null)]),
  );
  return Object.fromEntries(entries.filter(([, value]) => value));
}

async function loadPresenceMap(ctx, uids = []) {
  const uniqueIds = [...new Set(uids.filter(Boolean))];
  const entries = await Promise.all(
    uniqueIds.map(async (uid) => [uid, await getDocument(ctx, PRESENCE_COLLECTION, uid).catch(() => null)]),
  );
  return Object.fromEntries(entries.filter(([, value]) => value));
}

function sortByNewest(items = []) {
  return [...items].sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
}

async function loadFriendRequestRows(ctx, direction) {
  const field = direction === 'incoming' ? 'toUid' : 'fromUid';
  return queryByField(ctx, FRIEND_REQUESTS_COLLECTION, field, 'EQUAL', ctx.uid, 200);
}

async function loadEdges(ctx) {
  const edges = await queryByField(ctx, SOCIAL_EDGES_COLLECTION, 'ownerUid', 'EQUAL', ctx.uid, 200);
  return Object.fromEntries(edges.filter((edge) => edge?.targetUid).map((edge) => [edge.targetUid, edge]));
}

async function loadPendingRequests(ctx, direction) {
  const rows = await loadFriendRequestRows(ctx, direction);
  return sortByNewest(rows.filter((row) => row.status === 'pending'));
}

async function loadPendingGameInvites(ctx, direction) {
  const field = direction === 'incoming' ? 'toUid' : 'fromUid';
  const rows = await queryByField(ctx, GAME_INVITES_COLLECTION, field, 'EQUAL', ctx.uid, 200);
  const liveInvites = [];

  for (const invite of rows) {
    if (invite.status !== 'pending') continue;
    if (Number(invite.expiresAt || 0) <= now()) {
      await setDocument(ctx, GAME_INVITES_COLLECTION, invite.id, {
        ...invite,
        status: 'expired',
        updatedAt: timestampIso(),
      }).catch(() => {});
      continue;
    }
    liveInvites.push(invite);
  }

  return sortByNewest(liveInvites);
}

function buildFriendEntry(friendUid, profilesMap, presenceMap, edgesMap) {
  const profile = profilesMap[friendUid] || { uid: friendUid, displayName: 'Player' };
  const presence = presenceMap[friendUid] || null;
  const edge = edgesMap[friendUid] || null;

  return {
    uid: friendUid,
    displayName: profile.displayName || 'Player',
    username: getPreferredUsername(profile),
    email: profile.email || null,
    photoURL: profile.photoURL || null,
    isOnline: isPresenceOnline(presence),
    lastSeenAt: presence?.lastSeen || null,
    currentRoomCode: presence?.currentRoomCode || null,
    currentPhase: presence?.currentPhase || null,
    gameType: presence?.gameType || null,
    isBlocked: Boolean(edge?.blocked),
    isMuted: Boolean(edge?.muted),
  };
}

export async function getSocialState(ctx, payload = {}) {
  const profile = await upsertUserProfile(ctx, payload.profile || {});
  await setPresence(ctx, payload.presence || {}, true).catch(() => {});

  const [incomingRequestRows, outgoingRequestRows, edgesMap, incomingGameInvites, outgoingGameInvites] = await Promise.all([
    loadFriendRequestRows(ctx, 'incoming'),
    loadFriendRequestRows(ctx, 'outgoing'),
    loadEdges(ctx),
    loadPendingGameInvites(ctx, 'incoming'),
    loadPendingGameInvites(ctx, 'outgoing'),
  ]);

  const incomingFriendRequests = sortByNewest(incomingRequestRows.filter((row) => row.status === 'pending'));
  const outgoingFriendRequests = sortByNewest(outgoingRequestRows.filter((row) => row.status === 'pending'));

  const friendIds = [...incomingRequestRows, ...outgoingRequestRows]
    .filter((row) => row.status === 'accepted')
    .map((row) => (row.fromUid === ctx.uid ? row.toUid : row.fromUid))
    .filter(Boolean);
  const relatedIds = Object.keys(edgesMap);
  const profileMap = await loadProfilesMap(ctx, [...friendIds, ...relatedIds]);
  const presenceMap = await loadPresenceMap(ctx, friendIds);

  const friends = friendIds
    .map((friendUid) => buildFriendEntry(friendUid, profileMap, presenceMap, edgesMap))
    .sort((a, b) => {
      if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
      return a.displayName.localeCompare(b.displayName);
    });

  const blockedUsers = Object.entries(edgesMap)
    .filter(([, edge]) => edge?.blocked)
    .map(([targetUid, edge]) => {
      const profileForTarget = profileMap[targetUid] || {};
      return {
        uid: targetUid,
        displayName: profileForTarget.displayName || edge.targetDisplayName || 'Player',
        username: getPreferredUsername(profileForTarget),
        photoURL: profileForTarget.photoURL || edge.targetPhotoURL || null,
        isBlocked: true,
        isMuted: Boolean(edge?.muted),
      };
    })
    .sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {
    profile,
    friends,
    blockedUsers,
    incomingFriendRequests,
    outgoingFriendRequests,
    incomingGameInvites,
    outgoingGameInvites,
  };
}

export async function markUserOffline(ctx) {
  return setPresence(ctx, {}, false);
}

export async function claimUsername(ctx, payload = {}) {
  const profile = await upsertUserProfile(ctx, payload.profile || {});
  const desired = normalizeUsername(payload.username);
  if (desired.length < 3) {
    throw new Error('Username must be at least 3 characters.');
  }

  const existingReservation = await getDocument(ctx, USERNAMES_COLLECTION, desired).catch(() => null);
  if (existingReservation && existingReservation.ownerUid !== ctx.uid) {
    throw new Error('That username is already taken.');
  }

  const previousClaim = normalizeUsername(profile.claimedUsernameLower || profile.claimedUsername || '');
  if (!existingReservation) {
    await createDocument(ctx, USERNAMES_COLLECTION, desired, {
      ownerUid: ctx.uid,
      username: desired,
      usernameLower: desired,
      claimedAt: timestampIso(),
      updatedAt: timestampIso(),
    }).catch(async (error) => {
      if (Number(error?.status) === 409) {
        const retryReservation = await getDocument(ctx, USERNAMES_COLLECTION, desired).catch(() => null);
        if (retryReservation?.ownerUid !== ctx.uid) {
          throw new Error('That username is already taken.');
        }
        return retryReservation;
      }
      throw error;
    });
  }

  if (previousClaim && previousClaim !== desired) {
    const previousReservation = await getDocument(ctx, USERNAMES_COLLECTION, previousClaim).catch(() => null);
    if (previousReservation?.ownerUid === ctx.uid) {
      await deleteDocument(ctx, USERNAMES_COLLECTION, previousClaim).catch(() => {});
    }
  }

  const nextProfile = {
    ...profile,
    claimedUsername: desired,
    claimedUsernameLower: desired,
    updatedAt: timestampIso(),
  };
  await setDocument(ctx, USERS_COLLECTION, ctx.uid, nextProfile);
  return nextProfile;
}

export async function sendFriendRequest(ctx, payload = {}) {
  const requesterProfile = await upsertUserProfile(ctx, payload.profile || {});
  const targetLookup = String(payload.lookup || '').trim();
  const targetUser = await findUserByLookup(ctx, targetLookup);

  if (!targetUser?.uid) {
    throw new Error('No user found for that username, email, or ID. Ask your friend to sign in once on the latest build.');
  }
  if (targetUser.uid === ctx.uid) {
    throw new Error('You cannot add yourself.');
  }

  await ensureInteractionAllowed(ctx, targetUser.uid);

  const friendshipId = buildFriendshipId(ctx.uid, targetUser.uid);
  const requestId = buildFriendRequestId(ctx.uid, targetUser.uid);
  const reverseRequestId = buildFriendRequestId(targetUser.uid, ctx.uid);

  const [friendship, existingRequest, reverseRequest] = await Promise.all([
    areUsersFriends(ctx, targetUser.uid),
    getDocument(ctx, FRIEND_REQUESTS_COLLECTION, requestId).catch(() => null),
    getDocument(ctx, FRIEND_REQUESTS_COLLECTION, reverseRequestId).catch(() => null),
  ]);

  if (friendship) {
    throw new Error('You are already friends.');
  }

  if (reverseRequest?.status === 'pending') {
    await Promise.all([
      setDocument(ctx, FRIEND_REQUESTS_COLLECTION, reverseRequestId, {
        ...reverseRequest,
        status: 'accepted',
        updatedAt: timestampIso(),
        respondedAt: timestampIso(),
      }),
      setDocument(ctx, FRIENDSHIPS_COLLECTION, friendshipId, {
        userA: ctx.uid < targetUser.uid ? ctx.uid : targetUser.uid,
        userB: ctx.uid < targetUser.uid ? targetUser.uid : ctx.uid,
        users: [ctx.uid, targetUser.uid],
        createdAt: timestampIso(),
      }),
    ]);

    return {
      mode: 'auto-accepted',
      targetUser,
    };
  }

  if (existingRequest?.status === 'pending') {
    throw new Error('Friend request already sent.');
  }

  await setDocument(ctx, FRIEND_REQUESTS_COLLECTION, requestId, {
    fromUid: ctx.uid,
    toUid: targetUser.uid,
    fromDisplayName: requesterProfile.displayName || 'Player',
    fromPhotoURL: requesterProfile.photoURL || null,
    toDisplayName: targetUser.displayName || 'Player',
    toPhotoURL: targetUser.photoURL || null,
    status: 'pending',
    createdAt: timestampIso(),
    updatedAt: timestampIso(),
  });

  return {
    mode: 'sent',
    targetUser,
  };
}

export async function acceptFriendRequest(ctx, payload = {}) {
  const requestId = String(payload.requestId || '').trim();
  if (!requestId) {
    throw new Error('Missing friend request details.');
  }

  const request = await getDocument(ctx, FRIEND_REQUESTS_COLLECTION, requestId).catch(() => null);
  if (!request) {
    throw new Error('Friend request no longer exists.');
  }
  if (request.toUid !== ctx.uid) {
    throw new Error('You cannot accept this request.');
  }
  if (request.status !== 'pending') {
    throw new Error('Friend request is no longer pending.');
  }

  const friendshipId = buildFriendshipId(request.fromUid, request.toUid);
  await Promise.all([
    setDocument(ctx, FRIEND_REQUESTS_COLLECTION, requestId, {
      ...request,
      status: 'accepted',
      updatedAt: timestampIso(),
      respondedAt: timestampIso(),
    }),
    setDocument(ctx, FRIENDSHIPS_COLLECTION, friendshipId, {
      userA: request.fromUid < request.toUid ? request.fromUid : request.toUid,
      userB: request.fromUid < request.toUid ? request.toUid : request.fromUid,
      users: [request.fromUid, request.toUid],
      createdAt: timestampIso(),
    }),
  ]);

  return request;
}

export async function declineFriendRequest(ctx, payload = {}) {
  const requestId = String(payload.requestId || '').trim();
  const request = await getDocument(ctx, FRIEND_REQUESTS_COLLECTION, requestId).catch(() => null);
  if (!request) throw new Error('Friend request no longer exists.');
  if (request.toUid !== ctx.uid) throw new Error('You cannot decline this request.');
  if (request.status !== 'pending') throw new Error('Friend request is no longer pending.');

  await setDocument(ctx, FRIEND_REQUESTS_COLLECTION, requestId, {
    ...request,
    status: 'declined',
    updatedAt: timestampIso(),
    respondedAt: timestampIso(),
  });

  return request;
}

export async function cancelFriendRequest(ctx, payload = {}) {
  const requestId = String(payload.requestId || '').trim();
  const request = await getDocument(ctx, FRIEND_REQUESTS_COLLECTION, requestId).catch(() => null);
  if (!request) throw new Error('Friend request no longer exists.');
  if (request.fromUid !== ctx.uid) throw new Error('You cannot cancel this request.');
  if (request.status !== 'pending') throw new Error('Friend request is no longer pending.');

  await setDocument(ctx, FRIEND_REQUESTS_COLLECTION, requestId, {
    ...request,
    status: 'canceled',
    updatedAt: timestampIso(),
    respondedAt: timestampIso(),
  });

  return request;
}

export async function removeFriend(ctx, payload = {}) {
  const friendUid = String(payload.friendUid || '').trim();
  if (!friendUid) {
    throw new Error('Missing friend details.');
  }
  const friendshipId = buildFriendshipId(ctx.uid, friendUid);
  const requestIds = [
    buildFriendRequestId(ctx.uid, friendUid),
    buildFriendRequestId(friendUid, ctx.uid),
  ];

  await deleteDocument(ctx, FRIENDSHIPS_COLLECTION, friendshipId).catch(() => {});

  await Promise.all(
    requestIds.map(async (requestId) => {
      const request = await getDocument(ctx, FRIEND_REQUESTS_COLLECTION, requestId).catch(() => null);
      if (!request || request.status !== 'accepted') return;
      await setDocument(ctx, FRIEND_REQUESTS_COLLECTION, requestId, {
        ...request,
        status: 'removed',
        updatedAt: timestampIso(),
        respondedAt: timestampIso(),
      }).catch(() => {});
    }),
  );

  return { friendUid };
}

async function areUsersFriends(ctx, otherUid) {
  const friendship = await getDocument(ctx, FRIENDSHIPS_COLLECTION, buildFriendshipId(ctx.uid, otherUid)).catch(() => null);
  if (friendship) return true;

  const [forwardRequest, reverseRequest] = await Promise.all([
    getDocument(ctx, FRIEND_REQUESTS_COLLECTION, buildFriendRequestId(ctx.uid, otherUid)).catch(() => null),
    getDocument(ctx, FRIEND_REQUESTS_COLLECTION, buildFriendRequestId(otherUid, ctx.uid)).catch(() => null),
  ]);

  return forwardRequest?.status === 'accepted' || reverseRequest?.status === 'accepted';
}

export async function sendGameInvite(ctx, payload = {}) {
  const senderProfile = await upsertUserProfile(ctx, payload.profile || {});
  const toUid = String(payload.toUid || '').trim();
  const roomCode = String(payload.roomCode || '').trim().toUpperCase();
  const gameType = payload.gameType === 'donkey' ? 'donkey' : 'callbreak';
  const maxPlayers = Math.min(Math.max(Number(payload.maxPlayers) || 4, 2), 5);

  if (!toUid) throw new Error('Please select a friend to invite.');
  if (!roomCode) throw new Error('Create or join a room before sending an invite.');
  if (toUid === ctx.uid) throw new Error('You cannot invite yourself.');

  await ensureInteractionAllowed(ctx, toUid);

  const friendship = await areUsersFriends(ctx, toUid);
  if (!friendship) {
    throw new Error('This user is not in your friends list.');
  }

  const inviteId = buildGameInviteId(ctx.uid, toUid);
  await setDocument(ctx, GAME_INVITES_COLLECTION, inviteId, {
    fromUid: ctx.uid,
    toUid,
    fromDisplayName: senderProfile.displayName || 'Player',
    fromPhotoURL: senderProfile.photoURL || null,
    roomCode,
    gameType,
    maxPlayers,
    message: String(payload.message || '').trim().slice(0, 120),
    status: 'pending',
    createdAt: timestampIso(),
    updatedAt: timestampIso(),
    expiresAt: now() + GAME_INVITE_TTL_MS,
  });

  return {
    id: inviteId,
    roomCode,
  };
}

export async function acceptGameInvite(ctx, payload = {}) {
  const inviteId = String(payload.inviteId || '').trim();
  const invite = await getDocument(ctx, GAME_INVITES_COLLECTION, inviteId).catch(() => null);
  if (!invite) throw new Error('Invite not found.');
  if (invite.toUid !== ctx.uid) throw new Error('You cannot accept this invite.');
  if (invite.status !== 'pending') throw new Error('Invite is no longer pending.');
  if (Number(invite.expiresAt || 0) <= now()) {
    await setDocument(ctx, GAME_INVITES_COLLECTION, inviteId, {
      ...invite,
      status: 'expired',
      updatedAt: timestampIso(),
    });
    throw new Error('Invite has expired.');
  }

  await setDocument(ctx, GAME_INVITES_COLLECTION, inviteId, {
    ...invite,
    status: 'accepted',
    updatedAt: timestampIso(),
    respondedAt: timestampIso(),
  });

  return invite;
}

export async function declineGameInvite(ctx, payload = {}) {
  const inviteId = String(payload.inviteId || '').trim();
  const invite = await getDocument(ctx, GAME_INVITES_COLLECTION, inviteId).catch(() => null);
  if (!invite) throw new Error('Invite not found.');
  if (invite.toUid !== ctx.uid) throw new Error('You cannot decline this invite.');
  if (invite.status !== 'pending') throw new Error('Invite is no longer pending.');

  await setDocument(ctx, GAME_INVITES_COLLECTION, inviteId, {
    ...invite,
    status: 'declined',
    updatedAt: timestampIso(),
    respondedAt: timestampIso(),
  });

  return invite;
}

export async function cancelGameInvite(ctx, payload = {}) {
  const inviteId = String(payload.inviteId || '').trim();
  const invite = await getDocument(ctx, GAME_INVITES_COLLECTION, inviteId).catch(() => null);
  if (!invite) throw new Error('Invite not found.');
  if (invite.fromUid !== ctx.uid) throw new Error('You cannot cancel this invite.');
  if (invite.status !== 'pending') throw new Error('Invite is no longer pending.');

  await setDocument(ctx, GAME_INVITES_COLLECTION, inviteId, {
    ...invite,
    status: 'canceled',
    updatedAt: timestampIso(),
    respondedAt: timestampIso(),
  });

  return invite;
}

export async function setSocialEdge(ctx, payload = {}) {
  const targetUid = String(payload.targetUid || '').trim();
  if (!targetUid || targetUid === ctx.uid) {
    throw new Error('Invalid user selection.');
  }

  const targetProfile = await getDocument(ctx, USERS_COLLECTION, targetUid).catch(() => null);
  const edgeId = buildSocialEdgeId(ctx.uid, targetUid);
  const existingEdge = await getDocument(ctx, SOCIAL_EDGES_COLLECTION, edgeId).catch(() => null);
  const blocked = Boolean(payload.blocked);
  const muted = blocked ? true : Boolean(payload.muted);

  if (!blocked && !muted) {
    if (existingEdge) {
      await deleteDocument(ctx, SOCIAL_EDGES_COLLECTION, edgeId).catch(() => {});
    }
    return { targetUid, blocked: false, muted: false };
  }

  await setDocument(ctx, SOCIAL_EDGES_COLLECTION, edgeId, {
    ownerUid: ctx.uid,
    targetUid,
    targetDisplayName: targetProfile?.displayName || 'Player',
    targetPhotoURL: targetProfile?.photoURL || null,
    blocked,
    muted,
    createdAt: existingEdge?.createdAt || timestampIso(),
    updatedAt: timestampIso(),
  });

  if (blocked) {
    await Promise.all([
      deleteDocument(ctx, FRIENDSHIPS_COLLECTION, buildFriendshipId(ctx.uid, targetUid)).catch(() => {}),
      Promise.all([
        buildFriendRequestId(ctx.uid, targetUid),
        buildFriendRequestId(targetUid, ctx.uid),
      ].map(async (requestId) => {
        const request = await getDocument(ctx, FRIEND_REQUESTS_COLLECTION, requestId).catch(() => null);
        if (!request) return;
        await setDocument(ctx, FRIEND_REQUESTS_COLLECTION, requestId, {
          ...request,
          status: request.status === 'pending' ? 'canceled' : 'removed',
          updatedAt: timestampIso(),
          respondedAt: timestampIso(),
        }).catch(() => {});
      })),
      deleteDocument(ctx, GAME_INVITES_COLLECTION, buildGameInviteId(ctx.uid, targetUid)).catch(() => {}),
      deleteDocument(ctx, GAME_INVITES_COLLECTION, buildGameInviteId(targetUid, ctx.uid)).catch(() => {}),
    ]);
  }

  return { targetUid, blocked, muted };
}

export function buildSocialContext({ uid, projectId, idToken }) {
  return {
    uid,
    projectId,
    idToken,
    claims: decodeTokenClaims(idToken),
  };
}

export {
  USERS_COLLECTION,
  USERNAMES_COLLECTION,
  PRESENCE_COLLECTION,
  FRIEND_REQUESTS_COLLECTION,
  FRIENDSHIPS_COLLECTION,
  GAME_INVITES_COLLECTION,
  SOCIAL_EDGES_COLLECTION,
};
