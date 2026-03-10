import { randomBytes } from 'crypto';
import Room from '../models/Room.js';
import Player from '../models/Player.js';
import PartySession from '../models/PartySession.js';
import Game from '../game/Game.js';
import DonkeyGame from '../game/DonkeyGame.js';
import {
  loadPendingPartyInvitesForUid,
  loadPartyInviteById,
  loadPersistedPartyForUid,
  savePartyInvite,
  savePartySnapshot,
  verifyFirebaseIdToken,
} from '../services/firebasePartyStore.js';

// Characters that avoid ambiguity (no 0/O, 1/I/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

// Delay before clearing the trick cards on the client
const TRICK_CLEAR_DELAY_MS = 1500;

// Time before cleaning up an empty room
const ROOM_CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes

// Party and social layer constants
const PARTY_INVITE_TTL_MS = 2 * 60 * 1000;
const PARTY_ACTION_CACHE_LIMIT = 200;
const PARTY_MIN_SIZE = 2;
const PARTY_MAX_SIZE = 5;

// ---- Matchmaking queues (module-level, shared across all connections) ----
// Map<queueKey, Array<{ socketId, playerId, playerName }>>
// queueKey = `${gameType}-${playerCount}` e.g. "callbreak-4", "donkey-3"
const matchmakingQueues = new Map();
// Reverse lookup: Map<socketId, queueKey> — for disconnect cleanup
const queuedPlayers = new Map();
const partyMatchmakingQueues = new Map(); // Map<queueKey, Array<{ partyId, partySize, queuedAt }>>
const queuedPartyById = new Map(); // Map<partyId, queueKey>

// ---- Party layer (module-level, shared across all connections) ----
const partySessions = new Map(); // Map<partyId, PartySession>
const partyByMemberUid = new Map(); // Map<uid, partyId>
const partyInvites = new Map(); // Map<inviteId, Invite>
const partyByRoomCode = new Map(); // Map<roomCode, Set<partyId>>
const socketsByUid = new Map(); // Map<uid, Set<socketId>>
const seenActionIds = new Map(); // Map<uid:scope, string[]>
const voiceChannelByUid = new Map(); // Map<uid, channelId>
const voiceParticipantsByChannel = new Map(); // Map<channelId, Set<uid>>
const authContextByUid = new Map(); // Map<uid, { uid, projectId, idToken, updatedAt }>

function now() {
  return Date.now();
}

function normalizePartyGameType(value) {
  return value === 'donkey' ? 'donkey' : 'callbreak';
}

function normalizePartySize(value) {
  return Math.min(Math.max(Number(value) || 4, PARTY_MIN_SIZE), PARTY_MAX_SIZE);
}

function getSocketUid(socket) {
  return (
    socket?.data?.authUid
    || socket?.data?.playerId
    || socket?.handshake?.auth?.playerId
    || socket?.id
  );
}

function isSocketIdentityVerified(socket) {
  return Boolean(socket?.data?.uidVerified);
}

function getPartyRoomName(partyId) {
  return `party:${partyId}`;
}

function getVoiceSocketRoomName(channelId) {
  return `voice:${channelId}`;
}

function getPartyMatchQueueKey(gameType, count) {
  return `${gameType}-${count}`;
}

function getPartyMatchQueue(key) {
  if (!partyMatchmakingQueues.has(key)) {
    partyMatchmakingQueues.set(key, []);
  }
  return partyMatchmakingQueues.get(key);
}

function getDefaultVoiceChannelForSocket(socket) {
  const roomCode = socket?.data?.roomCode || null;
  if (!roomCode) return null;
  return `room:${roomCode}`;
}

function withActionDedupe(uid, scope, actionId) {
  if (!uid || !scope || !actionId) return false;
  const key = `${uid}:${scope}`;
  const used = seenActionIds.get(key) || [];
  if (used.includes(actionId)) return true;
  used.push(actionId);
  if (used.length > PARTY_ACTION_CACHE_LIMIT) {
    used.splice(0, used.length - PARTY_ACTION_CACHE_LIMIT);
  }
  seenActionIds.set(key, used);
  return false;
}

function trackSocketUid(uid, socketId) {
  if (!uid || !socketId) return;
  const current = socketsByUid.get(uid) || new Set();
  current.add(socketId);
  socketsByUid.set(uid, current);
}

function untrackSocketUid(uid, socketId) {
  if (!uid || !socketId) return;
  const current = socketsByUid.get(uid);
  if (!current) return;
  current.delete(socketId);
  if (current.size === 0) {
    socketsByUid.delete(uid);
    return;
  }
  socketsByUid.set(uid, current);
}

function emitToUid(io, uid, eventName, payload) {
  const sockets = socketsByUid.get(uid);
  if (!sockets || sockets.size === 0) return;
  sockets.forEach((socketId) => {
    io.to(socketId).emit(eventName, payload);
  });
}

function rememberAuthContext(uid, projectId, idToken) {
  if (!uid || !projectId || !idToken) return;
  authContextByUid.set(uid, {
    uid,
    projectId,
    idToken,
    updatedAt: now(),
  });
}

function getAuthContextForParty(party, preferredUid = null) {
  const candidateUids = [
    preferredUid,
    party?.leaderUid,
    ...(party?.members || []).map((member) => member.uid),
  ].filter(Boolean);

  for (const uid of candidateUids) {
    const context = authContextByUid.get(uid);
    if (context?.projectId && context?.idToken) {
      return context;
    }
  }

  return null;
}

function persistPartySnapshot(party, preferredUid = null) {
  if (!party) return;
  const authContext = getAuthContextForParty(party, preferredUid);
  if (!authContext) return;

  savePartySnapshot({
    projectId: authContext.projectId,
    idToken: authContext.idToken,
    party: serializeParty(party),
  }).catch((error) => {
    console.error('[party-persist] Failed to save snapshot:', error?.message || error);
  });
}

function persistPartyInvite(invite, preferredUid = null) {
  if (!invite) return;
  const party = partySessions.get(invite.partyId) || null;
  const authContext = getAuthContextForParty(party, preferredUid)
    || authContextByUid.get(invite.fromUid)
    || authContextByUid.get(invite.toUid);
  if (!authContext) return;

  savePartyInvite({
    projectId: authContext.projectId,
    idToken: authContext.idToken,
    invite,
  }).catch((error) => {
    console.error('[party-persist] Failed to save invite:', error?.message || error);
  });
}

function serializeParty(party) {
  return party ? party.toJSON() : null;
}

function logPartyMetric(eventName, party, extra = {}) {
  try {
    const payload = {
      event: eventName,
      partyId: party?.id || null,
      status: party?.status || null,
      members: party?.members?.length || 0,
      connected: party?.getConnectedMembers?.().length || 0,
      gameType: party?.gameType || null,
      targetSize: party?.targetSize || null,
      timestamp: now(),
      ...extra,
    };
    console.log('[party-metric]', JSON.stringify(payload));
  } catch {
    // noop
  }
}

function refreshPartyStatus(party) {
  if (!party) return;
  if (party.status === 'in_match' || party.status === 'launching' || party.status === 'queueing' || party.status === 'disbanded') return;
  const connected = party.getConnectedMembers();
  const allConnectedReady = connected.length > 0 && connected.every((member) => member.ready);
  party.setStatus(allConnectedReady ? 'ready' : 'forming');
}

function emitPartyState(io, party, reason = 'state-sync') {
  if (!party) return;
  refreshPartyStatus(party);
  const payload = serializeParty(party);
  io.to(getPartyRoomName(party.id)).emit('party:state:sync', payload);
  logPartyMetric('state_sync', party, { reason });
  persistPartySnapshot(party);
}

function removeInviteFromParty(party, inviteId) {
  if (!party || !inviteId) return;
  party.pendingInvites = party.pendingInvites.filter((invite) => invite.id !== inviteId);
}

function expirePartyInvites(io, party) {
  if (!party) return;
  const nowMs = now();
  party.pendingInvites.forEach((invite) => {
    if (invite.status !== 'pending') return;
    if ((invite.expiresAt || 0) > nowMs) return;
    invite.status = 'expired';
    invite.updatedAt = nowMs;
    partyInvites.set(invite.id, invite);
    emitToUid(io, invite.toUid, 'party:invite:updated', invite);
    persistPartyInvite(invite, invite.fromUid);
  });
  party.pendingInvites = party.pendingInvites.filter((invite) => invite.status === 'pending');
}

function removeMemberFromPartyLookup(uid, partyId) {
  if (!uid) return;
  if (partyByMemberUid.get(uid) === partyId) {
    partyByMemberUid.delete(uid);
  }
}

function setPartyRoomCodeMapping(roomCode, partyIds = []) {
  if (!roomCode) return;
  const normalizedPartyIds = [...new Set((partyIds || []).filter(Boolean))];
  if (normalizedPartyIds.length === 0) {
    partyByRoomCode.delete(roomCode);
    return;
  }
  partyByRoomCode.set(roomCode, new Set(normalizedPartyIds));
}

function getPartyIdsForRoomCode(roomCode) {
  const partyIds = partyByRoomCode.get(roomCode);
  if (!partyIds) return [];
  return Array.from(partyIds).filter(Boolean);
}

function restorePartiesForRoom(io, roomCode, reason = 'room-finished') {
  const partyIds = getPartyIdsForRoomCode(roomCode);
  if (partyIds.length === 0) return;

  partyIds.forEach((partyId) => {
    const party = partySessions.get(partyId);
    if (!party) return;
    party.setStatus('forming');
    party.setCurrentRoomCode(null);
    party.setMatchmaking(null);
    party.clearReadyStates();
    emitPartyState(io, party, reason);
  });

  partyByRoomCode.delete(roomCode);
}

function buildPartyQueueEntry(party) {
  const connectedMembers = party?.getConnectedMembers?.() || [];
  return {
    partyId: party?.id || null,
    partySize: connectedMembers.length,
    queuedAt: now(),
  };
}

function broadcastPartyQueueStatus(io, queueKey) {
  const queue = getPartyMatchQueue(queueKey);
  queue.forEach((entry, index) => {
    const party = partySessions.get(entry.partyId);
    if (!party) return;
    party.setMatchmaking({
      queueKey,
      position: index + 1,
      total: queue.length,
      queuedAt: entry.queuedAt,
    });
    party.setStatus('queueing');
    emitPartyState(io, party, 'party-matchmaking-status');
  });
}

function removePartyFromMatchmakingQueue(io, partyId, reason = 'party-matchmaking-canceled') {
  if (!partyId) return null;
  const queueKey = queuedPartyById.get(partyId);
  if (!queueKey) return null;

  const queue = getPartyMatchQueue(queueKey);
  const index = queue.findIndex((entry) => entry.partyId === partyId);
  if (index !== -1) {
    queue.splice(index, 1);
  }

  queuedPartyById.delete(partyId);

  if (queue.length === 0) {
    partyMatchmakingQueues.delete(queueKey);
  } else {
    broadcastPartyQueueStatus(io, queueKey);
  }

  const party = partySessions.get(partyId);
  if (party && party.status !== 'in_match' && party.status !== 'disbanded') {
    party.setMatchmaking(null);
    refreshPartyStatus(party);
    emitPartyState(io, party, reason);
  }

  return queueKey;
}

function cleanupPartyIfEmpty(io, party) {
  if (!party) return;
  if (party.members.length > 0) return;
  removePartyFromMatchmakingQueue(io, party.id, 'party-disbanded');
  party.status = 'disbanded';
  partySessions.delete(party.id);
  io.to(getPartyRoomName(party.id)).emit('party:state:sync', serializeParty(party));
  logPartyMetric('party_disbanded', party, { reason: 'empty' });
  persistPartySnapshot(party);
}

function getVoiceParticipants(channelId) {
  if (!voiceParticipantsByChannel.has(channelId)) {
    voiceParticipantsByChannel.set(channelId, new Set());
  }
  return voiceParticipantsByChannel.get(channelId);
}

function leaveVoiceChannel(io, uid, channelId) {
  if (!uid || !channelId) return;
  const participants = voiceParticipantsByChannel.get(channelId);
  if (participants) {
    participants.delete(uid);
    if (participants.size === 0) {
      voiceParticipantsByChannel.delete(channelId);
    }
  }
  voiceChannelByUid.delete(uid);
  io.to(getVoiceSocketRoomName(channelId)).emit('voice-peer-left', { peerId: uid, channelId });
}

function joinVoiceChannel(io, socket, uid, channelId) {
  if (!uid || !channelId) return;

  const currentChannel = voiceChannelByUid.get(uid);
  if (currentChannel && currentChannel !== channelId) {
    leaveVoiceChannel(io, uid, currentChannel);
    socket.leave(getVoiceSocketRoomName(currentChannel));
  }

  const participants = getVoiceParticipants(channelId);
  const existingPeers = Array.from(participants).filter((peerId) => peerId !== uid);

  socket.join(getVoiceSocketRoomName(channelId));
  socket.emit('voice-existing-peers', { peerIds: existingPeers, channelId });

  participants.add(uid);
  voiceChannelByUid.set(uid, channelId);

  socket.to(getVoiceSocketRoomName(channelId)).emit('voice-peer-joined', { peerId: uid, channelId });
}

function getQueueKey(gameType, count) {
  return `${gameType}-${count}`;
}

function getQueue(key) {
  if (!matchmakingQueues.has(key)) matchmakingQueues.set(key, []);
  return matchmakingQueues.get(key);
}

function parseQueueKey(key) {
  const parts = key.split('-');
  return { gameType: parts[0], count: Number(parts[1]) };
}

function toRoomPlayerPayload(player) {
  if (!player) return null;
  return {
    id: player.id,
    name: player.name,
    seatIndex: player.seatIndex,
    isReady: player.isReady,
    isConnected: player.isConnected,
    photoURL: player.photoURL || null,
  };
}

function toRoomPlayersPayload(room) {
  return room.players.map((player) => toRoomPlayerPayload(player));
}

function mergeSocketSession(socket, patch = {}) {
  socket.data = {
    ...(socket.data || {}),
    ...patch,
  };
}

function clearSocketRoomSession(socket) {
  const next = {
    ...(socket.data || {}),
  };
  delete next.playerId;
  delete next.playerName;
  delete next.photoURL;
  delete next.roomCode;
  socket.data = next;
}

function getSocketActor(socket) {
  const uid = getSocketUid(socket);
  const playerName = String(
    socket?.data?.playerName
      || socket?.handshake?.auth?.playerName
      || 'Player'
  ).slice(0, 24);
  const photoURL = socket?.data?.photoURL || socket?.handshake?.auth?.photoURL || null;
  return { uid, playerName, photoURL };
}

function findPartyByUid(uid) {
  if (!uid) return null;
  const partyId = partyByMemberUid.get(uid);
  if (!partyId) return null;
  return partySessions.get(partyId) || null;
}

function joinAllSocketsForUidToRoom(io, uid, roomCode, payload = {}) {
  const sockets = socketsByUid.get(uid);
  if (!sockets || sockets.size === 0) return;

  sockets.forEach((socketId) => {
    const targetSocket = io.sockets.sockets.get(socketId);
    if (!targetSocket) return;
    targetSocket.join(roomCode);
    mergeSocketSession(targetSocket, {
      playerId: uid,
      roomCode,
      playerName: payload.playerName || targetSocket.data?.playerName || 'Player',
      photoURL: payload.photoURL ?? targetSocket.data?.photoURL ?? null,
    });
  });
}

function leaveAllSocketsForUidFromParty(io, uid, partyId) {
  const sockets = socketsByUid.get(uid);
  if (!sockets || sockets.size === 0) return;
  sockets.forEach((socketId) => {
    const targetSocket = io.sockets.sockets.get(socketId);
    if (!targetSocket) return;
    targetSocket.leave(getPartyRoomName(partyId));
  });
}

function removeInviteFromGlobal(inviteId) {
  if (!inviteId) return null;
  const invite = partyInvites.get(inviteId) || null;
  if (!invite) return null;
  partyInvites.delete(inviteId);
  return invite;
}

function updateInviteStatus(io, invite, status, reason = null) {
  if (!invite || !status) return null;
  invite.status = status;
  invite.updatedAt = now();
  if (reason) invite.reason = reason;
  partyInvites.set(invite.id, invite);
  emitToUid(io, invite.toUid, 'party:invite:updated', invite);
  emitToUid(io, invite.fromUid, 'party:invite:updated', invite);
  persistPartyInvite(invite, invite.fromUid);
  return invite;
}

function normalizePartyMemberName(value) {
  const trimmed = String(value || '').trim();
  return trimmed ? trimmed.slice(0, 24) : 'Player';
}

function findPartyInviteForRecipient(party, toUid) {
  if (!party || !toUid) return null;
  return party.pendingInvites.find((invite) => (
    invite.toUid === toUid
      && invite.status === 'pending'
      && (invite.expiresAt || 0) > now()
  )) || null;
}

function createPartyInvite({
  party,
  fromUid,
  fromName,
  toUid,
  toName,
}) {
  const id = `PIV${randomBytes(8).toString('hex').slice(0, 12).toUpperCase()}`;
  const timestamp = now();
  return {
    id,
    partyId: party.id,
    fromUid,
    toUid,
    fromName: normalizePartyMemberName(fromName),
    toName: normalizePartyMemberName(toName),
    status: 'pending',
    createdAt: timestamp,
    updatedAt: timestamp,
    expiresAt: timestamp + PARTY_INVITE_TTL_MS,
  };
}

function getPendingInvitesForUid(uid) {
  if (!uid) return [];
  const timestamp = now();
  return Array.from(partyInvites.values())
    .filter((invite) => (
      invite.toUid === uid
      && invite.status === 'pending'
      && (invite.expiresAt || 0) > timestamp
    ))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
}

function resolveVoiceChannelId(socket, requestedChannelId) {
  if (requestedChannelId && typeof requestedChannelId === 'string') {
    return requestedChannelId;
  }
  const uid = getSocketUid(socket);
  const party = findPartyByUid(uid);
  if (party && party.status !== 'in_match') {
    return `party:${party.id}`;
  }
  return getDefaultVoiceChannelForSocket(socket);
}

function isMemberInVoiceChannel(uid, channelId) {
  if (!uid || !channelId) return false;
  const participants = voiceParticipantsByChannel.get(channelId);
  if (!participants) return false;
  return participants.has(uid);
}

function sanitizePartyConfig(payload = {}) {
  return {
    gameType: normalizePartyGameType(payload.gameType),
    targetSize: normalizePartySize(payload.targetSize),
  };
}

/**
 * Generates a random room code using unambiguous characters.
 * @returns {string} A 6-character room code.
 */
function generateRoomCode() {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';

  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }

  return code;
}

function generatePartyId() {
  const bytes = randomBytes(6);
  return `PTY${bytes.toString('hex').slice(0, 10).toUpperCase()}`;
}

/**
 * Broadcasts updated queue status to all players in a matchmaking queue.
 */
function broadcastQueueStatus(io, queueKey) {
  const queue = getQueue(queueKey);
  const { count } = parseQueueKey(queueKey);
  queue.forEach((entry, idx) => {
    io.to(entry.socketId).emit('queue-status', {
      position: idx + 1,
      total: queue.length,
      maxPlayers: count,
    });
  });
}

/**
 * Attempts to form a match from the queue for a given key.
 * If enough players are queued, creates a room and starts the game.
 */
function tryMatchQueue(io, queueKey, rooms, games) {
  const { gameType, count } = parseQueueKey(queueKey);
  const queue = getQueue(queueKey);
  if (queue.length < count) return;

  // Pop the first count entries
  const matched = queue.splice(0, count);

  // Generate a room
  let code;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const room = new Room(code, matched[0].socketId, count, gameType);
  rooms.set(code, room);

  const playerList = [];

  matched.forEach((entry) => {
    // Remove from reverse lookup
    queuedPlayers.delete(entry.socketId);

    // Create player and add to room (use persistent playerId from auth)
    const player = new Player(entry.playerId, entry.playerName, entry.socketId, entry.photoURL || null);
    player.isReady = true;
    room.addPlayer(player);

    // Join socket room and set socket data
    const sock = io.sockets.sockets.get(entry.socketId);
    if (sock) {
      sock.join(code);
      mergeSocketSession(sock, {
        playerId: entry.playerId,
        roomCode: code,
        playerName: entry.playerName,
        photoURL: entry.photoURL || null,
      });
    }
  });

  // Build player list for emission
  room.players.forEach((p) => {
    playerList.push({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
      isReady: p.isReady,
      isConnected: p.isConnected,
      photoURL: p.photoURL || null,
    });
  });

  // Emit match-found to each matched player
  matched.forEach((entry) => {
    io.to(entry.socketId).emit('match-found', {
      roomCode: code,
      playerId: entry.playerId,
      maxPlayers: room.maxPlayers,
      gameType: room.gameType,
      players: playerList,
    });
  });

  // Start the game immediately
  room.status = 'in-progress';

  if (gameType === 'donkey') {
    const game = new DonkeyGame(code, room.players);
    games.set(code, game);
    room.game = game;
    wireDonkeyGameEvents(io, game, room);
    game.startGame();
  } else {
    const game = new Game(code, room.players);
    games.set(code, game);
    room.game = game;
    wireGameEvents(io, game, room);
    game.startGame();
  }

  // Broadcast updated queue status to remaining players
  broadcastQueueStatus(io, queueKey);
}

function findPartyMatchCombination(queue, targetSize) {
  let bestMatch = null;

  function search(startIndex, remaining, selected) {
    if (remaining === 0) {
      bestMatch = [...selected];
      return true;
    }

    for (let index = startIndex; index < queue.length; index += 1) {
      const entry = queue[index];
      if (!entry || entry.partySize > remaining) continue;
      selected.push(entry);
      if (search(index + 1, remaining - entry.partySize, selected)) {
        return true;
      }
      selected.pop();
    }

    return false;
  }

  search(0, targetSize, []);
  return bestMatch;
}

function createRoomFromQueuedParties(io, rooms, games, matchedEntries, queueKey) {
  const { gameType, count } = parseQueueKey(queueKey);
  if (!Array.isArray(matchedEntries) || matchedEntries.length === 0) {
    throw new Error('No parties available for matchmaking');
  }

  let code;
  do {
    code = generateRoomCode();
  } while (rooms.has(code));

  const firstParty = partySessions.get(matchedEntries[0].partyId);
  const room = new Room(code, firstParty?.leaderUid || matchedEntries[0].partyId, count, gameType);
  rooms.set(code, room);

  const playerList = [];
  const matchedPartyIds = [];

  matchedEntries.forEach((entry) => {
    const partySession = partySessions.get(entry.partyId);
    if (!partySession || partySession.status === 'disbanded') {
      return;
    }

    const connectedMembers = partySession.getConnectedMembers();
    if (connectedMembers.length !== entry.partySize || !partySession.canLaunch()) {
      throw new Error('Queued party is no longer ready');
    }

    matchedPartyIds.push(partySession.id);

    connectedMembers.forEach((member) => {
      const sockets = socketsByUid.get(member.uid);
      const primarySocketId = sockets && sockets.size > 0 ? sockets.values().next().value : null;
      if (!primarySocketId) {
        throw new Error('Queued party member disconnected');
      }

      const player = new Player(
        member.uid,
        normalizePartyMemberName(member.name),
        primarySocketId,
        member.photoURL || null,
      );
      player.isReady = true;
      room.addPlayer(player);

      joinAllSocketsForUidToRoom(io, member.uid, code, {
        playerName: player.name,
        photoURL: player.photoURL || null,
      });
    });
  });

  if (room.players.length !== count) {
    rooms.delete(code);
    throw new Error('Unable to form a full party match');
  }

  room.players.forEach((player) => {
    playerList.push({
      id: player.id,
      name: player.name,
      seatIndex: player.seatIndex,
      isReady: player.isReady,
      isConnected: player.isConnected,
      photoURL: player.photoURL || null,
    });
  });

  room.status = 'in-progress';

  if (gameType === 'donkey') {
    const game = new DonkeyGame(code, room.players);
    games.set(code, game);
    room.game = game;
    wireDonkeyGameEvents(io, game, room);
    game.startGame();
  } else {
    const game = new Game(code, room.players);
    games.set(code, game);
    room.game = game;
    wireGameEvents(io, game, room);
    game.startGame();
  }

  matchedPartyIds.forEach((partyId) => {
    queuedPartyById.delete(partyId);
    const partySession = partySessions.get(partyId);
    if (!partySession) return;
    partySession.setMatchmaking(null);
    partySession.setStatus('in_match');
    partySession.setCurrentRoomCode(code);
    partySession.clearReadyStates();
    emitPartyState(io, partySession, 'party-matchmaking-launched');
  });
  setPartyRoomCodeMapping(code, matchedPartyIds);

  room.players.forEach((player) => {
    emitToUid(io, player.id, 'match-found', {
      roomCode: code,
      playerId: player.id,
      maxPlayers: room.maxPlayers,
      gameType: room.gameType,
      players: playerList,
    });
  });

  return {
    roomCode: code,
    gameType: room.gameType,
    launchedPlayers: room.players.length,
    parties: matchedPartyIds,
  };
}

function tryMatchPartyQueue(io, queueKey, rooms, games) {
  const queue = getPartyMatchQueue(queueKey);
  const { count } = parseQueueKey(queueKey);

  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const entry = queue[index];
    const party = partySessions.get(entry.partyId);
    if (!party || party.status === 'disbanded' || party.status === 'in_match') {
      queue.splice(index, 1);
      queuedPartyById.delete(entry.partyId);
      continue;
    }

    const connectedMembers = party.getConnectedMembers();
    if (connectedMembers.length !== entry.partySize || !party.canLaunch()) {
      queue.splice(index, 1);
      queuedPartyById.delete(entry.partyId);
      party.setMatchmaking(null);
      refreshPartyStatus(party);
      emitPartyState(io, party, 'party-matchmaking-invalidated');
    }
  }

  if (queue.length === 0) {
    partyMatchmakingQueues.delete(queueKey);
    return null;
  }

  const matchedEntries = findPartyMatchCombination(queue, count);
  if (!matchedEntries) {
    broadcastPartyQueueStatus(io, queueKey);
    return null;
  }

  const matchedPartyIds = new Set(matchedEntries.map((entry) => entry.partyId));
  const remainingEntries = queue.filter((entry) => !matchedPartyIds.has(entry.partyId));
  partyMatchmakingQueues.set(queueKey, remainingEntries);

  let launchResult;
  try {
    launchResult = createRoomFromQueuedParties(io, rooms, games, matchedEntries, queueKey);
  } catch (error) {
    matchedEntries.forEach((entry) => {
      const party = partySessions.get(entry.partyId);
      if (!party || party.status === 'disbanded' || party.status === 'in_match') {
        queuedPartyById.delete(entry.partyId);
        return;
      }

      const connectedMembers = party.getConnectedMembers();
      if (!party.canLaunch() || connectedMembers.length !== entry.partySize) {
        queuedPartyById.delete(entry.partyId);
        party.setMatchmaking(null);
        refreshPartyStatus(party);
        emitPartyState(io, party, 'party-matchmaking-invalidated');
        return;
      }

      queuedPartyById.set(entry.partyId, queueKey);
      remainingEntries.push(entry);
    });

    if (remainingEntries.length === 0) {
      partyMatchmakingQueues.delete(queueKey);
    } else {
      partyMatchmakingQueues.set(queueKey, remainingEntries);
      broadcastPartyQueueStatus(io, queueKey);
    }

    throw error;
  }

  if (remainingEntries.length === 0) {
    partyMatchmakingQueues.delete(queueKey);
  } else {
    broadcastPartyQueueStatus(io, queueKey);
  }

  return launchResult;
}

/**
 * Wires up all Game events to Socket.IO broadcasts for a room.
 *
 * @param {Object} io - Socket.IO server instance.
 * @param {Game} game - The game instance.
 * @param {Room} room - The room instance.
 */
function wireGameEvents(io, game, room) {
  game.on('hand-dealt', ({ playerId, hand, round }) => {
    const player = room.getPlayer(playerId);
    if (player && player.socketId) {
      io.to(player.socketId).emit('hand-dealt', { hand, round });
    }
  });

  game.on('bidding-start', (data) => {
    io.to(room.code).emit('bidding-start', data);
  });

  game.on('bid-placed', (data) => {
    io.to(room.code).emit('bid-placed', data);
  });

  game.on('bidding-complete', (data) => {
    io.to(room.code).emit('bidding-complete', data);
  });

  game.on('your-turn', ({ playerId, playableCards, ...rest }) => {
    const player = room.getPlayer(playerId);
    if (player && player.socketId) {
      io.to(player.socketId).emit('your-turn', {
        playerId,
        playableCards: playableCards || [],
        ...rest,
      });
    }

    // Broadcast whose turn it is to the room (without playable cards)
    io.to(room.code).emit('turn-changed', {
      playerId,
      playerName: rest.playerName,
      seatIndex: rest.seatIndex,
      phase: rest.phase,
    });
  });

  game.on('card-played', (data) => {
    io.to(room.code).emit('card-played', data);
  });

  game.on('hand-updated', ({ playerId, hand }) => {
    const player = room.getPlayer(playerId);
    if (player && player.socketId) {
      io.to(player.socketId).emit('hand-updated', { hand });
    }
  });

  game.on('trick-result', (data) => {
    io.to(room.code).emit('trick-result', data);
  });

  game.on('trick-cleared', (data) => {
    io.to(room.code).emit('trick-cleared', data);
  });

  game.on('round-end', (data) => {
    io.to(room.code).emit('round-end', data);
  });

  game.on('game-over', (data) => {
    io.to(room.code).emit('game-over', data);
    room.status = 'finished';
    restorePartiesForRoom(io, room.code, 'game-over');
  });

  game.on('turn-timeout', (data) => {
    io.to(room.code).emit('turn-timeout', data);
  });

  game.on('turn-timer-start', (data) => {
    io.to(room.code).emit('turn-timer-start', data);
  });
}

/**
 * Wires up Donkey (Gadha Ladan) game events to Socket.IO broadcasts.
 */
function wireDonkeyGameEvents(io, game, room) {
  // Individual: hand dealt to each player
  game.on('donkey-hand-dealt', ({ playerId, hand, round, players }) => {
    const player = room.getPlayer(playerId);
    if (player && player.socketId) {
      io.to(player.socketId).emit('donkey-hand-dealt', { hand, round, players });
    }
  });

  // Individual: it's your turn
  game.on('donkey-your-turn', ({ playerId, ...rest }) => {
    const player = room.getPlayer(playerId);
    if (player && player.socketId) {
      io.to(player.socketId).emit('donkey-your-turn', { playerId, ...rest });
    }
  });

  // Broadcast: whose turn changed
  game.on('donkey-turn-changed', (data) => {
    io.to(room.code).emit('donkey-turn-changed', data);
  });

  // Broadcast: card played into current trick
  game.on('donkey-card-played', (data) => {
    io.to(room.code).emit('donkey-card-played', data);
  });

  // Individual: updated hand after card play / collection
  game.on('donkey-hand-updated', ({ playerId, hand }) => {
    const player = room.getPlayer(playerId);
    if (player && player.socketId) {
      io.to(player.socketId).emit('donkey-hand-updated', { hand });
    }
  });

  // Broadcast: player emptied their hand
  game.on('donkey-player-safe', (data) => {
    io.to(room.code).emit('donkey-player-safe', data);
  });

  // Broadcast: turn timer info
  game.on('donkey-turn-timer-start', (data) => {
    io.to(room.code).emit('donkey-turn-timer-start', data);
  });

  // Broadcast: updated player info (card counts etc.)
  game.on('donkey-players-update', (data) => {
    io.to(room.code).emit('donkey-players-update', data);
  });

  // Broadcast: trick resolution (winner / hit / collector)
  game.on('donkey-trick-result', (data) => {
    io.to(room.code).emit('donkey-trick-result', data);
  });

  // Broadcast: trick table cleared and next trick starts
  game.on('donkey-trick-cleared', (data) => {
    io.to(room.code).emit('donkey-trick-cleared', data);
  });

  // Broadcast: game over
  game.on('donkey-game-over', (data) => {
    io.to(room.code).emit('donkey-game-over', data);
    room.status = 'finished';
    restorePartiesForRoom(io, room.code, 'donkey-game-over');
  });
}

/**
 * Registers all Socket.IO event handlers for a connection.
 *
 * @param {Object} io - Socket.IO server instance.
 * @param {Object} socket - The connected socket.
 * @param {Map} rooms - Map<roomCode, Room>.
 * @param {Map} games - Map<roomCode, Game>.
 */
export default function registerHandlers(io, socket, rooms, games) {
  const claimedUid = String(socket.handshake.auth?.playerId || '').trim();
  const initialUid = claimedUid && claimedUid.startsWith('guest_') ? claimedUid : socket.id;
  mergeSocketSession(socket, {
    authUid: initialUid,
    uidVerified: false,
  });
  trackSocketUid(initialUid, socket.id);

  const identityReady = (async () => {
    const authToken = String(socket.handshake.auth?.authToken || '').trim();
    const playerName = normalizePartyMemberName(socket.handshake.auth?.playerName || 'Player');
    const photoURL = socket.handshake.auth?.photoURL || null;

    mergeSocketSession(socket, {
      playerName,
      photoURL,
    });

    if (!authToken) {
      return {
        uid: initialUid,
        verified: false,
      };
    }

    try {
      const verified = await verifyFirebaseIdToken(authToken);
      if (claimedUid && claimedUid !== verified.uid) {
        throw new Error('Socket identity does not match Firebase token');
      }

      if (initialUid !== verified.uid) {
        untrackSocketUid(initialUid, socket.id);
        trackSocketUid(verified.uid, socket.id);
      }

      rememberAuthContext(verified.uid, verified.projectId, authToken);
      mergeSocketSession(socket, {
        authUid: verified.uid,
        uidVerified: true,
        authProjectId: verified.projectId,
        authToken,
      });

      return {
        uid: verified.uid,
        verified: true,
      };
    } catch (error) {
      console.error('[socket-auth] Failed to verify Firebase token:', error?.message || error);
      mergeSocketSession(socket, {
        authUid: initialUid,
        uidVerified: false,
        authProjectId: null,
        authToken: null,
      });
      return {
        uid: initialUid,
        verified: false,
        error,
      };
    }
  })();
  mergeSocketSession(socket, { identityReady });

  const ensureIdentity = async (requireVerified = false) => {
    await identityReady.catch(() => null);
    if (requireVerified && !isSocketIdentityVerified(socket)) {
      throw new Error('Please sign in with Google to use party features.');
    }
    return getSocketActor(socket);
  };

  const getActor = () => {
    const actor = getSocketActor(socket);
    return {
      uid: actor.uid,
      playerName: normalizePartyMemberName(actor.playerName),
      photoURL: actor.photoURL || null,
    };
  };

  const syncPartyForCurrentSocket = (reason = 'connect-sync') => {
    const actor = getActor();
    const party = findPartyByUid(actor.uid);
    if (!party) return null;

    party.markConnected(actor.uid, socket.id);
    const member = party.getMember(actor.uid);
    if (member) {
      member.name = actor.playerName || member.name;
      member.photoURL = actor.photoURL ?? member.photoURL ?? null;
    }
    socket.join(getPartyRoomName(party.id));
    emitPartyState(io, party, reason);
    return party;
  };

  const hydratePersistedPartyState = async () => {
    await identityReady.catch(() => null);
    const actor = getActor();

    if (!isSocketIdentityVerified(socket)) {
      return syncPartyForCurrentSocket('guest-connect-sync');
    }

    let party = findPartyByUid(actor.uid);
    if (!party) {
      const snapshot = await loadPersistedPartyForUid({
        projectId: socket.data?.authProjectId,
        idToken: socket.data?.authToken,
        uid: actor.uid,
      }).catch((error) => {
        console.error('[party-persist] Failed to restore party snapshot:', error?.message || error);
        return null;
      });

      if (snapshot?.partyId) {
        party = partySessions.get(snapshot.partyId) || PartySession.fromSnapshot(snapshot);
        partySessions.set(party.id, party);
        party.members.forEach((member) => {
          partyByMemberUid.set(member.uid, party.id);
        });
        party.pendingInvites.forEach((invite) => {
          partyInvites.set(invite.id, invite);
        });
        if (party.currentRoomCode) {
          const existingPartyIds = getPartyIdsForRoomCode(party.currentRoomCode);
          setPartyRoomCodeMapping(party.currentRoomCode, [...existingPartyIds, party.id]);
        }
      }
    }

    const syncedParty = syncPartyForCurrentSocket('connect-sync');

    let pendingInvites = getPendingInvitesForUid(actor.uid);
    if (pendingInvites.length === 0) {
      pendingInvites = await loadPendingPartyInvitesForUid({
        projectId: socket.data?.authProjectId,
        idToken: socket.data?.authToken,
        uid: actor.uid,
      }).catch((error) => {
        console.error('[party-persist] Failed to restore pending invites:', error?.message || error);
        return [];
      });

      pendingInvites.forEach((invite) => {
        partyInvites.set(invite.id, invite);
        const targetParty = partySessions.get(invite.partyId);
        if (targetParty && !targetParty.pendingInvites.some((entry) => entry.id === invite.id)) {
          targetParty.pendingInvites.push(invite);
        }
      });
    }

    if (pendingInvites.length > 0) {
      socket.emit('party:invite:list', pendingInvites);
    }

    return syncedParty;
  };

  identityReady
    .then(() => hydratePersistedPartyState())
    .catch(() => {});

  const cancelPartyQueueIfNeeded = (partySession, reason = 'party-matchmaking-canceled') => {
    if (!partySession?.id) return;
    if (!queuedPartyById.has(partySession.id)) return;
    removePartyFromMatchmakingQueue(io, partySession.id, reason);
  };

  const createRoomFromParty = (partySession, launchMode = 'private-room') => {
    if (!partySession) {
      throw new Error('Party not found');
    }

    cancelPartyQueueIfNeeded(partySession, 'party-matchmaking-replaced-by-private-room');
    expirePartyInvites(io, partySession);

    if (partySession.status === 'in_match' && partySession.currentRoomCode) {
      throw new Error('Party is already in a match');
    }

    const connectedMembers = partySession.getConnectedMembers();
    if (connectedMembers.length < PARTY_MIN_SIZE) {
      throw new Error('At least 2 connected members are required');
    }
    if (!partySession.canLaunch()) {
      throw new Error('All connected members must be ready to launch');
    }

    let code;
    do {
      code = generateRoomCode();
    } while (rooms.has(code));

    const room = new Room(code, partySession.leaderUid, partySession.targetSize, partySession.gameType);
    rooms.set(code, room);

    connectedMembers.forEach((member) => {
      const sockets = socketsByUid.get(member.uid);
      const primarySocketId = sockets && sockets.size > 0 ? sockets.values().next().value : null;
      if (!primarySocketId) {
        member.connected = false;
        member.ready = false;
        return;
      }

      const player = new Player(
        member.uid,
        normalizePartyMemberName(member.name),
        primarySocketId,
        member.photoURL || null
      );
      player.isReady = true;
      room.addPlayer(player);

      joinAllSocketsForUidToRoom(io, member.uid, code, {
        playerName: player.name,
        photoURL: player.photoURL || null,
      });
    });

    if (room.players.length < PARTY_MIN_SIZE) {
      rooms.delete(code);
      throw new Error('Not enough connected party members to launch');
    }

    const playerList = toRoomPlayersPayload(room);

    room.status = 'in-progress';
    if (room.gameType === 'donkey') {
      const game = new DonkeyGame(code, room.players);
      games.set(code, game);
      room.game = game;
      wireDonkeyGameEvents(io, game, room);
      game.startGame();
    } else {
      const game = new Game(code, room.players);
      games.set(code, game);
      room.game = game;
      wireGameEvents(io, game, room);
      game.startGame();
    }

    partySession.setStatus('in_match');
    partySession.setCurrentRoomCode(code);
    partySession.setMatchmaking(null);
    partySession.clearReadyStates();
    setPartyRoomCodeMapping(code, [partySession.id]);
    emitPartyState(io, partySession, `launch-${launchMode}`);

    room.players.forEach((player) => {
      emitToUid(io, player.id, 'match-found', {
        roomCode: code,
        playerId: player.id,
        maxPlayers: room.maxPlayers,
        gameType: room.gameType,
        players: playerList,
      });
    });

    return {
      roomCode: code,
      gameType: room.gameType,
      launchedPlayers: room.players.length,
    };
  };

  // -------------------------------------------------------------------------
  // party:create
  // -------------------------------------------------------------------------
  socket.on('party:create', async (payload = {}, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    actor = {
      uid: actor.uid,
      playerName: normalizePartyMemberName(actor.playerName),
      photoURL: actor.photoURL || null,
    };
    const existingParty = findPartyByUid(actor.uid);
    if (existingParty) {
      existingParty.markConnected(actor.uid, socket.id);
      socket.join(getPartyRoomName(existingParty.id));
      emitPartyState(io, existingParty, 'party-create-existing');
      if (typeof callback === 'function') {
        callback({
          success: true,
          party: serializeParty(existingParty),
          existing: true,
        });
      }
      return;
    }

    const { gameType, targetSize } = sanitizePartyConfig(payload);
    let partyId;
    do {
      partyId = generatePartyId();
    } while (partySessions.has(partyId));

    const newParty = new PartySession({
      id: partyId,
      leaderUid: actor.uid,
      gameType,
      targetSize,
      createdAt: now(),
    });

    newParty.addMember({
      uid: actor.uid,
      name: actor.playerName,
      photoURL: actor.photoURL,
      socketId: socket.id,
      role: 'leader',
      ready: false,
      connected: true,
      joinedAt: now(),
    });

    partySessions.set(newParty.id, newParty);
    partyByMemberUid.set(actor.uid, newParty.id);
    socket.join(getPartyRoomName(newParty.id));
    emitPartyState(io, newParty, 'party-created');
    logPartyMetric('party_created', newParty, { actorUid: actor.uid });

    if (typeof callback === 'function') {
      callback({
        success: true,
        party: serializeParty(newParty),
      });
    }
  });

  // -------------------------------------------------------------------------
  // party:find-active / party:recover / party:state:sync
  // -------------------------------------------------------------------------
  const syncPartyForActor = (reason, callback) => {
    const actor = getActor();
    const activeParty = findPartyByUid(actor.uid);
    if (!activeParty) {
      if (typeof callback === 'function') {
        callback({ success: true, party: null, invites: [] });
      }
      return;
    }

    activeParty.markConnected(actor.uid, socket.id);
    const member = activeParty.getMember(actor.uid);
    if (member) {
      member.name = actor.playerName;
      member.photoURL = actor.photoURL;
    }
    socket.join(getPartyRoomName(activeParty.id));
    emitPartyState(io, activeParty, reason);
    const invites = getPendingInvitesForUid(actor.uid);

    if (typeof callback === 'function') {
      callback({
        success: true,
        party: serializeParty(activeParty),
        invites,
      });
    } else if (invites.length > 0) {
      socket.emit('party:invite:list', invites);
    }
  };

  socket.on('party:find-active', async (_payload, callback) => {
    try {
      await ensureIdentity(true);
      syncPartyForActor('party-find-active', callback);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
    }
  });

  socket.on('party:recover', async (_payload, callback) => {
    try {
      await ensureIdentity(true);
      await hydratePersistedPartyState();
      syncPartyForActor('party-recover', callback);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
    }
  });

  socket.on('party:state:sync', async (_payload, callback) => {
    try {
      await ensureIdentity(true);
      syncPartyForActor('party-state-request', callback);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
    }
  });

  // -------------------------------------------------------------------------
  // party:invite:list
  // -------------------------------------------------------------------------
  socket.on('party:invite:list', async (_payload, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }

    const invites = getPendingInvitesForUid(actor.uid);
    if (typeof callback === 'function') {
      callback({ success: true, invites });
    } else {
      socket.emit('party:invite:list', invites);
    }
  });

  // -------------------------------------------------------------------------
  // party:invite
  // -------------------------------------------------------------------------
  socket.on('party:invite', async (payload = {}, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    actor = {
      uid: actor.uid,
      playerName: normalizePartyMemberName(actor.playerName),
      photoURL: actor.photoURL || null,
    };
    const partySession = findPartyByUid(actor.uid);

    if (!partySession) {
      if (typeof callback === 'function') callback({ success: false, error: 'Create or join a party first' });
      return;
    }
    if (partySession.leaderUid !== actor.uid) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only party leader can invite' });
      return;
    }

    const toUid = String(payload.toUid || '').trim();
    if (!toUid) {
      if (typeof callback === 'function') callback({ success: false, error: 'Recipient is required' });
      return;
    }
    if (toUid === actor.uid) {
      if (typeof callback === 'function') callback({ success: false, error: 'You cannot invite yourself' });
      return;
    }

    if (payload.actionId && withActionDedupe(actor.uid, 'party-invite', payload.actionId)) {
      const existing = findPartyInviteForRecipient(partySession, toUid);
      if (typeof callback === 'function') {
        callback({ success: true, invite: existing || null, deduped: true });
      }
      return;
    }

    expirePartyInvites(io, partySession);

    if (partyByMemberUid.has(toUid)) {
      if (typeof callback === 'function') callback({ success: false, error: 'Player is already in another party' });
      return;
    }

    if (partySession.members.length >= partySession.targetSize) {
      if (typeof callback === 'function') callback({ success: false, error: 'Party is already full' });
      return;
    }

    const existingInvite = findPartyInviteForRecipient(partySession, toUid);
    if (existingInvite) {
      if (typeof callback === 'function') callback({ success: true, invite: existingInvite, existing: true });
      return;
    }

    const invite = createPartyInvite({
      party: partySession,
      fromUid: actor.uid,
      fromName: actor.playerName,
      toUid,
      toName: payload.toName || 'Player',
    });

    partySession.pendingInvites.push(invite);
    partyInvites.set(invite.id, invite);
    persistPartyInvite(invite, actor.uid);
    emitToUid(io, toUid, 'party:invite', invite);
    emitToUid(io, toUid, 'party:invite:updated', invite);
    emitToUid(io, actor.uid, 'party:invite:updated', invite);
    emitPartyState(io, partySession, 'party-invite-sent');
    logPartyMetric('party_invite_sent', partySession, {
      inviteId: invite.id,
      fromUid: invite.fromUid,
      toUid: invite.toUid,
    });

    if (typeof callback === 'function') {
      callback({ success: true, invite });
    }
  });

  // -------------------------------------------------------------------------
  // party:invite:accept
  // -------------------------------------------------------------------------
  socket.on('party:invite:accept', async (payload = {}, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    actor = {
      uid: actor.uid,
      playerName: normalizePartyMemberName(actor.playerName),
      photoURL: actor.photoURL || null,
    };
    const inviteId = String(payload.inviteId || '').trim();
    if (!inviteId) {
      if (typeof callback === 'function') callback({ success: false, error: 'Invite ID is required' });
      return;
    }

    if (payload.actionId && withActionDedupe(actor.uid, 'party-invite-accept', payload.actionId)) {
      if (typeof callback === 'function') callback({ success: true, deduped: true });
      return;
    }

    let invite = partyInvites.get(inviteId);
    if (!invite) {
      invite = await loadPartyInviteById({
        projectId: socket.data?.authProjectId,
        idToken: socket.data?.authToken,
        inviteId,
      }).catch(() => null);
      if (invite) {
        partyInvites.set(invite.id, invite);
      }
    }
    if (!invite) {
      if (typeof callback === 'function') callback({ success: false, error: 'Invite not found' });
      return;
    }
    if (invite.toUid !== actor.uid) {
      if (typeof callback === 'function') callback({ success: false, error: 'Invite is not for this user' });
      return;
    }
    if (invite.status !== 'pending') {
      if (typeof callback === 'function') callback({ success: false, error: `Invite is ${invite.status}` });
      return;
    }
    if ((invite.expiresAt || 0) <= now()) {
      updateInviteStatus(io, invite, 'expired', 'ttl');
      removeInviteFromGlobal(invite.id);
      if (typeof callback === 'function') callback({ success: false, error: 'Invite expired' });
      return;
    }

    const currentParty = findPartyByUid(actor.uid);
    if (currentParty && currentParty.id !== invite.partyId) {
      if (typeof callback === 'function') callback({ success: false, error: 'Leave your current party first' });
      return;
    }

    const partySession = partySessions.get(invite.partyId);
    if (!partySession || partySession.status === 'disbanded') {
      updateInviteStatus(io, invite, 'expired', 'party-missing');
      removeInviteFromGlobal(invite.id);
      if (typeof callback === 'function') callback({ success: false, error: 'Party is no longer available' });
      return;
    }

    if (partySession.members.length >= partySession.targetSize) {
      updateInviteStatus(io, invite, 'expired', 'party-full');
      removeInviteFromParty(partySession, invite.id);
      removeInviteFromGlobal(invite.id);
      emitPartyState(io, partySession, 'party-invite-full');
      if (typeof callback === 'function') callback({ success: false, error: 'Party is full' });
      return;
    }

    updateInviteStatus(io, invite, 'accepted');
    removeInviteFromParty(partySession, invite.id);
    removeInviteFromGlobal(invite.id);

    partySession.addMember({
      uid: actor.uid,
      name: actor.playerName,
      photoURL: actor.photoURL,
      socketId: socket.id,
      role: 'member',
      ready: false,
      connected: true,
      joinedAt: now(),
    });
    partyByMemberUid.set(actor.uid, partySession.id);
    socket.join(getPartyRoomName(partySession.id));

    Array.from(partyInvites.values())
      .filter((item) => item.toUid === actor.uid && item.status === 'pending')
      .forEach((item) => {
        updateInviteStatus(io, item, 'canceled', 'joined-other-party');
        const sourceParty = partySessions.get(item.partyId);
        if (sourceParty) {
          removeInviteFromParty(sourceParty, item.id);
          emitPartyState(io, sourceParty, 'party-invite-canceled');
        }
        removeInviteFromGlobal(item.id);
      });

    io.to(getPartyRoomName(partySession.id)).emit('party:member:joined', {
      partyId: partySession.id,
      member: partySession.getMember(actor.uid),
    });
    emitPartyState(io, partySession, 'party-invite-accepted');
    logPartyMetric('party_member_joined', partySession, { actorUid: actor.uid });

    if (typeof callback === 'function') {
      callback({
        success: true,
        party: serializeParty(partySession),
      });
    }
  });

  // -------------------------------------------------------------------------
  // party:invite:decline
  // -------------------------------------------------------------------------
  socket.on('party:invite:decline', async (payload = {}, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    const inviteId = String(payload.inviteId || '').trim();
    if (!inviteId) {
      if (typeof callback === 'function') callback({ success: false, error: 'Invite ID is required' });
      return;
    }

    if (payload.actionId && withActionDedupe(actor.uid, 'party-invite-decline', payload.actionId)) {
      if (typeof callback === 'function') callback({ success: true, deduped: true });
      return;
    }

    let invite = partyInvites.get(inviteId);
    if (!invite) {
      invite = await loadPartyInviteById({
        projectId: socket.data?.authProjectId,
        idToken: socket.data?.authToken,
        inviteId,
      }).catch(() => null);
      if (invite) {
        partyInvites.set(invite.id, invite);
      }
    }
    if (!invite) {
      if (typeof callback === 'function') callback({ success: false, error: 'Invite not found' });
      return;
    }
    if (invite.toUid !== actor.uid) {
      if (typeof callback === 'function') callback({ success: false, error: 'Invite is not for this user' });
      return;
    }
    if (invite.status !== 'pending') {
      if (typeof callback === 'function') callback({ success: false, error: `Invite is ${invite.status}` });
      return;
    }

    updateInviteStatus(io, invite, 'declined');
    const partySession = partySessions.get(invite.partyId);
    if (partySession) {
      removeInviteFromParty(partySession, invite.id);
      emitPartyState(io, partySession, 'party-invite-declined');
    }
    removeInviteFromGlobal(invite.id);

    if (typeof callback === 'function') {
      callback({ success: true });
    }
  });

  // -------------------------------------------------------------------------
  // party:leave
  // -------------------------------------------------------------------------
  socket.on('party:leave', async (_payload, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    const partySession = findPartyByUid(actor.uid);
    if (!partySession) {
      if (typeof callback === 'function') callback({ success: true, party: null });
      return;
    }

    const wasLeader = partySession.leaderUid === actor.uid;
    const removedMember = partySession.removeMember(actor.uid);
    removeMemberFromPartyLookup(actor.uid, partySession.id);
    leaveAllSocketsForUidFromParty(io, actor.uid, partySession.id);

    const currentChannelId = voiceChannelByUid.get(actor.uid);
    if (currentChannelId === `party:${partySession.id}`) {
      leaveVoiceChannel(io, actor.uid, currentChannelId);
    }

    if (removedMember) {
      io.to(getPartyRoomName(partySession.id)).emit('party:member:left', {
        partyId: partySession.id,
        member: {
          uid: removedMember.uid,
          name: removedMember.name,
        },
      });
    }

    partySession.pendingInvites
      .filter((invite) => invite.fromUid === actor.uid && invite.status === 'pending')
      .forEach((invite) => {
        updateInviteStatus(io, invite, 'canceled', 'sender-left');
        removeInviteFromGlobal(invite.id);
      });
    partySession.pendingInvites = partySession.pendingInvites.filter((invite) => invite.status === 'pending');

    if (partySession.members.length === 0) {
      cleanupPartyIfEmpty(io, partySession);
    } else {
      cancelPartyQueueIfNeeded(partySession, 'party-member-left-queue-canceled');
      if (wasLeader) {
        partySession.transferLeaderIfNeeded();
      }
      emitPartyState(io, partySession, 'party-member-left');
    }

    if (typeof callback === 'function') {
      callback({ success: true, party: serializeParty(partySession) });
    }
  });

  // -------------------------------------------------------------------------
  // party:ready:set
  // -------------------------------------------------------------------------
  socket.on('party:ready:set', async (payload = {}, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    const partySession = findPartyByUid(actor.uid);
    if (!partySession) {
      if (typeof callback === 'function') callback({ success: false, error: 'Party not found' });
      return;
    }
    if (partySession.status === 'in_match') {
      if (typeof callback === 'function') callback({ success: false, error: 'Party is already in a match' });
      return;
    }
    if (partySession.status === 'queueing') {
      cancelPartyQueueIfNeeded(partySession, 'party-ready-changed-queue-canceled');
    }

    const ready = Boolean(payload.ready);
    const member = partySession.setReady(actor.uid, ready);
    if (!member) {
      if (typeof callback === 'function') callback({ success: false, error: 'Member not found' });
      return;
    }

    emitPartyState(io, partySession, 'party-ready-updated');
    if (typeof callback === 'function') {
      callback({
        success: true,
        ready: member.ready,
        canLaunch: partySession.canLaunch(),
        party: serializeParty(partySession),
      });
    }
  });

  // -------------------------------------------------------------------------
  // party:leader:promote
  // -------------------------------------------------------------------------
  socket.on('party:leader:promote', async (payload = {}, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    const partySession = findPartyByUid(actor.uid);
    if (!partySession) {
      if (typeof callback === 'function') callback({ success: false, error: 'Party not found' });
      return;
    }
    if (partySession.leaderUid !== actor.uid) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only leader can promote members' });
      return;
    }

    const targetUid = String(payload.targetUid || '').trim();
    if (!targetUid) {
      if (typeof callback === 'function') callback({ success: false, error: 'Target member is required' });
      return;
    }
    if (!partySession.getMember(targetUid)) {
      if (typeof callback === 'function') callback({ success: false, error: 'Target member not found' });
      return;
    }

    partySession.setLeader(targetUid);
    cancelPartyQueueIfNeeded(partySession, 'party-leader-changed-queue-canceled');
    emitPartyState(io, partySession, 'party-leader-promoted');
    if (typeof callback === 'function') {
      callback({ success: true, party: serializeParty(partySession) });
    }
  });

  // -------------------------------------------------------------------------
  // party:member:kick
  // -------------------------------------------------------------------------
  socket.on('party:member:kick', async (payload = {}, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    const partySession = findPartyByUid(actor.uid);
    if (!partySession) {
      if (typeof callback === 'function') callback({ success: false, error: 'Party not found' });
      return;
    }
    if (partySession.leaderUid !== actor.uid) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only leader can kick members' });
      return;
    }

    const targetUid = String(payload.targetUid || '').trim();
    if (!targetUid || targetUid === actor.uid) {
      if (typeof callback === 'function') callback({ success: false, error: 'Invalid member selection' });
      return;
    }

    const removedMember = partySession.removeMember(targetUid);
    if (!removedMember) {
      if (typeof callback === 'function') callback({ success: false, error: 'Member not found' });
      return;
    }

    removeMemberFromPartyLookup(targetUid, partySession.id);
    leaveAllSocketsForUidFromParty(io, targetUid, partySession.id);
    emitToUid(io, targetUid, 'party:kicked', {
      partyId: partySession.id,
      byUid: actor.uid,
    });

    const currentChannelId = voiceChannelByUid.get(targetUid);
    if (currentChannelId === `party:${partySession.id}`) {
      leaveVoiceChannel(io, targetUid, currentChannelId);
    }

    io.to(getPartyRoomName(partySession.id)).emit('party:member:left', {
      partyId: partySession.id,
      member: {
        uid: removedMember.uid,
        name: removedMember.name,
      },
      kickedBy: actor.uid,
    });

    cancelPartyQueueIfNeeded(partySession, 'party-member-kicked-queue-canceled');
    emitPartyState(io, partySession, 'party-member-kicked');
    if (typeof callback === 'function') {
      callback({ success: true, party: serializeParty(partySession) });
    }
  });

  // -------------------------------------------------------------------------
  // party:launch:private-room / party:launch:matchmaking
  // -------------------------------------------------------------------------
  socket.on('party:launch:private-room', async (_payload, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    const partySession = findPartyByUid(actor.uid);
    if (!partySession) {
      if (typeof callback === 'function') callback({ success: false, error: 'Party not found' });
      return;
    }
    if (partySession.leaderUid !== actor.uid) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only leader can launch match' });
      return;
    }

    try {
      partySession.setStatus('launching');
      const launchResult = createRoomFromParty(partySession, 'private-room');
      logPartyMetric('party_launched_private_room', partySession, launchResult);
      if (typeof callback === 'function') callback({ success: true, ...launchResult });
    } catch (error) {
      partySession.setStatus('forming');
      emitPartyState(io, partySession, 'party-launch-failed');
      if (typeof callback === 'function') callback({ success: false, error: error.message || 'Launch failed' });
    }
  });

  socket.on('party:launch:matchmaking', async (_payload, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    const partySession = findPartyByUid(actor.uid);
    if (!partySession) {
      if (typeof callback === 'function') callback({ success: false, error: 'Party not found' });
      return;
    }
    if (partySession.leaderUid !== actor.uid) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only leader can launch match' });
      return;
    }
    if (partySession.status === 'in_match') {
      if (typeof callback === 'function') callback({ success: false, error: 'Party is already in a match' });
      return;
    }
    if (queuedPartyById.has(partySession.id)) {
      const queueKey = queuedPartyById.get(partySession.id);
      const queue = queueKey ? getPartyMatchQueue(queueKey) : [];
      const position = queue.findIndex((entry) => entry.partyId === partySession.id) + 1;
      if (typeof callback === 'function') {
        callback({
          success: true,
          queued: true,
          position,
          total: queue.length,
          party: serializeParty(partySession),
        });
      }
      return;
    }

    try {
      const connectedMembers = partySession.getConnectedMembers();
      if (connectedMembers.length < PARTY_MIN_SIZE) {
        throw new Error('At least 2 connected members are required');
      }
      if (!partySession.canLaunch()) {
        throw new Error('All connected members must be ready to launch');
      }

      const queueKey = getPartyMatchQueueKey(partySession.gameType, partySession.targetSize);
      const entry = buildPartyQueueEntry(partySession);
      queuedPartyById.set(partySession.id, queueKey);
      getPartyMatchQueue(queueKey).push(entry);
      partySession.setStatus('queueing');
      partySession.setMatchmaking({
        queueKey,
        position: getPartyMatchQueue(queueKey).length,
        total: getPartyMatchQueue(queueKey).length,
        queuedAt: entry.queuedAt,
      });
      emitPartyState(io, partySession, 'party-matchmaking-queued');
      const launchResult = tryMatchPartyQueue(io, queueKey, rooms, games);
      logPartyMetric('party_matchmaking_queued', partySession, {
        queueKey,
        queuedAt: entry.queuedAt,
        launched: Boolean(launchResult),
      });
      if (typeof callback === 'function') {
        callback({
          success: true,
          mode: launchResult ? 'party-matchmaking' : 'queueing',
          queued: !launchResult,
          party: serializeParty(partySession),
          ...(launchResult || {}),
        });
      }
    } catch (error) {
      partySession.setStatus('forming');
      partySession.setMatchmaking(null);
      emitPartyState(io, partySession, 'party-launch-matchmaking-failed');
      if (typeof callback === 'function') callback({ success: false, error: error.message || 'Launch failed' });
    }
  });

  socket.on('party:matchmaking:cancel', async (_payload, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    const partySession = findPartyByUid(actor.uid);
    if (!partySession) {
      if (typeof callback === 'function') callback({ success: false, error: 'Party not found' });
      return;
    }
    if (partySession.leaderUid !== actor.uid) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only leader can cancel matchmaking' });
      return;
    }

    cancelPartyQueueIfNeeded(partySession, 'party-matchmaking-canceled');
    if (typeof callback === 'function') {
      callback({ success: true, party: serializeParty(partySession) });
    }
  });

  // -------------------------------------------------------------------------
  // party voice events
  // -------------------------------------------------------------------------
  socket.on('party:voice:join', async (_payload, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    const partySession = findPartyByUid(actor.uid);
    if (!partySession) {
      if (typeof callback === 'function') callback({ success: false, error: 'Party not found' });
      return;
    }
    if (!partySession.getMember(actor.uid)) {
      if (typeof callback === 'function') callback({ success: false, error: 'Not a party member' });
      return;
    }

    const channelId = `party:${partySession.id}`;
    joinVoiceChannel(io, socket, actor.uid, channelId);
    partySession.voiceParticipants.add(actor.uid);
    emitPartyState(io, partySession, 'party-voice-join');
    if (typeof callback === 'function') callback({ success: true, channelId });
  });

  socket.on('party:voice:leave', async (_payload, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    const partySession = findPartyByUid(actor.uid);
    if (!partySession) {
      if (typeof callback === 'function') callback({ success: true });
      return;
    }
    const channelId = `party:${partySession.id}`;
    if (voiceChannelByUid.get(actor.uid) === channelId) {
      leaveVoiceChannel(io, actor.uid, channelId);
      socket.leave(getVoiceSocketRoomName(channelId));
    }
    partySession.voiceParticipants.delete(actor.uid);
    emitPartyState(io, partySession, 'party-voice-leave');
    if (typeof callback === 'function') callback({ success: true, channelId });
  });

  socket.on('party:voice:mute', async ({ targetUid, muted }, callback) => {
    let actor;
    try {
      actor = await ensureIdentity(true);
    } catch (error) {
      if (typeof callback === 'function') callback({ success: false, error: error.message });
      return;
    }
    const partySession = findPartyByUid(actor.uid);
    if (!partySession || partySession.leaderUid !== actor.uid) {
      if (typeof callback === 'function') callback({ success: false, error: 'Only leader can mute party members' });
      return;
    }

    const memberUid = String(targetUid || '').trim();
    if (!memberUid || !partySession.getMember(memberUid)) {
      if (typeof callback === 'function') callback({ success: false, error: 'Member not found' });
      return;
    }

    const channelId = `party:${partySession.id}`;
    emitToUid(io, memberUid, 'voice-force-mute', { muted: Boolean(muted), channelId });
    io.to(getVoiceSocketRoomName(channelId)).emit('voice-player-muted', {
      playerId: memberUid,
      muted: Boolean(muted),
      channelId,
    });
    if (typeof callback === 'function') callback({ success: true, channelId });
  });

  // -------------------------------------------------------------------------
  // create-room
  // -------------------------------------------------------------------------
  socket.on('create-room', ({ playerName, maxPlayers, gameType, photoURL }, callback) => {
    let code;
    do {
      code = generateRoomCode();
    } while (rooms.has(code));

    const actor = getActor();
    const effectivePlayerName = normalizePartyMemberName(playerName || actor.playerName);
    const effectivePhotoURL = photoURL || actor.photoURL || null;
    const validGameType = gameType === 'donkey' ? 'donkey' : 'callbreak';
    const playerId = actor.uid;
    const player = new Player(playerId, effectivePlayerName, socket.id, effectivePhotoURL);
    const room = new Room(code, playerId, maxPlayers || 4, validGameType);

    room.addPlayer(player);
    rooms.set(code, room);

    socket.join(code);
    mergeSocketSession(socket, {
      playerId,
      roomCode: code,
      playerName: effectivePlayerName,
      photoURL: effectivePhotoURL,
    });

    const response = {
      roomCode: code,
      playerId,
      maxPlayers: room.maxPlayers,
      gameType: room.gameType,
      players: toRoomPlayersPayload(room),
    };

    if (typeof callback === 'function') {
      callback({ success: true, ...response });
    }
    socket.emit('room-created', response);
  });

  // -------------------------------------------------------------------------
  // join-room
  // -------------------------------------------------------------------------
  socket.on('join-room', ({ roomCode, playerName, photoURL }, callback) => {
    const code = roomCode?.toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      const error = { success: false, error: 'Room not found' };
      if (typeof callback === 'function') return callback(error);
      return socket.emit('error-message', error);
    }

    if (room.status === 'in-progress') {
      const error = { success: false, error: 'Game already in progress' };
      if (typeof callback === 'function') return callback(error);
      return socket.emit('error-message', error);
    }

    if (room.isFull()) {
      const error = { success: false, error: 'Room is full' };
      if (typeof callback === 'function') return callback(error);
      return socket.emit('error-message', error);
    }

    const actor = getActor();
    const playerId = actor.uid;
    const effectivePlayerName = normalizePartyMemberName(playerName || actor.playerName);
    const effectivePhotoURL = photoURL || actor.photoURL || null;
    const player = new Player(playerId, effectivePlayerName, socket.id, effectivePhotoURL);

    room.addPlayer(player);
    socket.join(code);
    mergeSocketSession(socket, {
      playerId,
      roomCode: code,
      playerName: effectivePlayerName,
      photoURL: effectivePhotoURL,
    });

    const playerList = toRoomPlayersPayload(room);

    const joinResponse = { roomCode: code, playerId, maxPlayers: room.maxPlayers, gameType: room.gameType, players: playerList };

    if (typeof callback === 'function') {
      callback({ success: true, ...joinResponse });
    }

    // Emit room-joined to the joining player (mirrors room-created for host)
    socket.emit('room-joined', joinResponse);

    // Notify everyone in the room about the new player
    io.to(code).emit('player-joined', {
      playerId,
      playerName: effectivePlayerName,
      maxPlayers: room.maxPlayers,
      players: playerList,
    });
  });

  // -------------------------------------------------------------------------
  // player-ready
  // -------------------------------------------------------------------------
  socket.on('player-ready', (callback) => {
    const { playerId, roomCode } = socket.data || {};
    const room = rooms.get(roomCode);

    if (!room) return;

    const player = room.getPlayer(playerId);
    if (!player) return;

    player.isReady = !player.isReady;

    io.to(roomCode).emit('player-ready-changed', {
      playerId,
      isReady: player.isReady,
      players: toRoomPlayersPayload(room),
    });

    if (typeof callback === 'function') {
      callback({ success: true, isReady: player.isReady });
    }

    // If all players are ready, start the game
    if (room.allReady()) {
      room.status = 'in-progress';

      if (room.gameType === 'donkey') {
        const game = new DonkeyGame(roomCode, room.players);
        games.set(roomCode, game);
        room.game = game;
        wireDonkeyGameEvents(io, game, room);
        game.startGame();
      } else {
        const game = new Game(roomCode, room.players);
        games.set(roomCode, game);
        room.game = game;
        wireGameEvents(io, game, room);
        game.startGame();
      }
    }
  });

  // -------------------------------------------------------------------------
  // kick-player (host only, lobby only)
  // -------------------------------------------------------------------------
  socket.on('kick-player', ({ targetPlayerId }, callback) => {
    const { playerId, roomCode } = socket.data || {};
    const room = rooms.get(roomCode);

    if (!room) {
      const error = { success: false, error: 'Room not found' };
      if (typeof callback === 'function') return callback(error);
      return;
    }

    if (room.hostId !== playerId) {
      const error = { success: false, error: 'Only the host can kick players' };
      if (typeof callback === 'function') return callback(error);
      return;
    }

    if (room.status !== 'waiting') {
      const error = { success: false, error: 'Cannot kick players during a game' };
      if (typeof callback === 'function') return callback(error);
      return;
    }

    if (targetPlayerId === playerId) {
      const error = { success: false, error: 'Cannot kick yourself' };
      if (typeof callback === 'function') return callback(error);
      return;
    }

    const targetPlayer = room.getPlayer(targetPlayerId);
    if (!targetPlayer) {
      const error = { success: false, error: 'Player not found in room' };
      if (typeof callback === 'function') return callback(error);
      return;
    }

    const targetSocketId = targetPlayer.socketId;
    const targetName = targetPlayer.name;

    const roomVoiceChannelId = `room:${roomCode}`;
    if (voiceChannelByUid.get(targetPlayerId) === roomVoiceChannelId) {
      leaveVoiceChannel(io, targetPlayerId, roomVoiceChannelId);
    }

    room.removePlayer(targetPlayerId);

    const playerList = toRoomPlayersPayload(room);

    // Notify the kicked player
    io.to(targetSocketId).emit('player-kicked', {
      reason: 'You were removed from the room by the host',
    });

    // Remove kicked player from the Socket.IO room
    const targetSockets = socketsByUid.get(targetPlayerId);
    if (targetSockets && targetSockets.size > 0) {
      targetSockets.forEach((targetSocketIdForUid) => {
        const kickedSocket = io.sockets.sockets.get(targetSocketIdForUid);
        if (!kickedSocket) return;
        kickedSocket.leave(roomCode);
        clearSocketRoomSession(kickedSocket);
      });
    } else {
      const kickedSocket = io.sockets.sockets.get(targetSocketId);
      if (kickedSocket) {
        kickedSocket.leave(roomCode);
        clearSocketRoomSession(kickedSocket);
      }
    }

    // Notify remaining players
    io.to(roomCode).emit('player-left', {
      playerId: targetPlayerId,
      playerName: targetName,
      players: playerList,
    });

    if (typeof callback === 'function') callback({ success: true });
  });

  // -------------------------------------------------------------------------
  // leave-room (player voluntarily leaves)
  // -------------------------------------------------------------------------
  socket.on('leave-room', () => {
    const { playerId, roomCode } = socket.data || {};
    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.getPlayer(playerId);
    if (!player) return;

    const playerName = player.name;

    const roomVoiceChannelId = `room:${roomCode}`;
    if (voiceChannelByUid.get(playerId) === roomVoiceChannelId) {
      leaveVoiceChannel(io, playerId, roomVoiceChannelId);
      socket.leave(getVoiceSocketRoomName(roomVoiceChannelId));
    }

    room.removePlayer(playerId);

    // Leave the Socket.IO room and clear socket data
    socket.leave(roomCode);
    clearSocketRoomSession(socket);

    const playerList = toRoomPlayersPayload(room);

    // Notify remaining players
    io.to(roomCode).emit('player-left', {
      playerId,
      playerName,
      players: playerList,
    });

    // Clean up empty room
    if (room.players.length === 0) {
      const game = games.get(roomCode);
      if (game) {
        if (typeof game.destroy === 'function') {
          game.destroy();
        } else {
          game._clearTurnTimer?.();
          game.removeAllListeners?.();
        }
        games.delete(roomCode);
      }
      rooms.delete(roomCode);
    }
  });

  // -------------------------------------------------------------------------
  // place-bid
  // -------------------------------------------------------------------------
  socket.on('place-bid', ({ bid }, callback) => {
    const { playerId, roomCode } = socket.data || {};
    const game = games.get(roomCode);

    if (!game) {
      const error = { success: false, error: 'No active game' };
      if (typeof callback === 'function') return callback(error);
      return socket.emit('error-message', error);
    }

    try {
      game.placeBid(playerId, bid);
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      const error = { success: false, error: err.message };
      if (typeof callback === 'function') return callback(error);
      socket.emit('error-message', error);
    }
  });

  // -------------------------------------------------------------------------
  // play-card
  // -------------------------------------------------------------------------
  socket.on('play-card', ({ card }, callback) => {
    const { playerId, roomCode } = socket.data || {};
    const game = games.get(roomCode);

    if (!game) {
      const error = { success: false, error: 'No active game' };
      if (typeof callback === 'function') return callback(error);
      return socket.emit('error-message', error);
    }

    try {
      game.playCard(playerId, card);
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      const error = { success: false, error: err.message };
      if (typeof callback === 'function') return callback(error);
      socket.emit('error-message', error);
    }
  });

  // -------------------------------------------------------------------------
  // next-round
  // -------------------------------------------------------------------------
  socket.on('next-round', () => {
    const { roomCode } = socket.data || {};
    const game = games.get(roomCode);
    if (game) {
      game.triggerNextRound();
    }
  });

  // -------------------------------------------------------------------------
  // send-chat
  // -------------------------------------------------------------------------
  socket.on('send-chat', ({ message }) => {
    const { playerId, roomCode } = socket.data || {};
    const room = rooms.get(roomCode);

    if (!room) return;

    const player = room.getPlayer(playerId);
    if (!player) return;

    io.to(roomCode).emit('chat-message', {
      playerId,
      playerName: player.name,
      message,
      timestamp: Date.now(),
    });
  });

  // -------------------------------------------------------------------------
  // check-active-game (client calls on connect to see if they have a running game)
  // -------------------------------------------------------------------------
  socket.on('check-active-game', (payload = {}, callback) => {
    const reqPlayerId = payload?.playerId;
    const pid = reqPlayerId || getSocketUid(socket);
    if (!pid) {
      if (typeof callback === 'function') return callback({ activeGame: null });
      return;
    }

    // Search all rooms for a player with this ID
    for (const [code, room] of rooms.entries()) {
      const player = room.getPlayer(pid);
      if (player && room.status === 'in-progress') {
        const result = {
          activeGame: {
            roomCode: code,
            gameType: room.gameType,
            status: room.status,
          },
        };
        if (typeof callback === 'function') return callback(result);
        socket.emit('active-game-found', result.activeGame);
        return;
      }
    }

    if (typeof callback === 'function') return callback({ activeGame: null });
  });

  // -------------------------------------------------------------------------
  // reconnect-game
  // -------------------------------------------------------------------------
  socket.on('reconnect-game', ({ roomCode, playerId }, callback) => {
    const actor = getActor();
    if (playerId && playerId !== actor.uid) {
      const error = { success: false, error: 'Unauthorized reconnect identity' };
      if (typeof callback === 'function') return callback(error);
      return socket.emit('error-message', error);
    }

    const code = roomCode?.toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      const error = { success: false, error: 'Room not found' };
      if (typeof callback === 'function') return callback(error);
      return socket.emit('error-message', error);
    }

    const reconnectPlayerId = actor.uid;
    const player = room.getPlayer(reconnectPlayerId);
    if (!player) {
      const error = { success: false, error: 'Player not found in room' };
      if (typeof callback === 'function') return callback(error);
      return socket.emit('error-message', error);
    }

    // Re-associate socket
    player.socketId = socket.id;
    player.isConnected = true;

    socket.join(code);
    mergeSocketSession(socket, {
      playerId: reconnectPlayerId,
      roomCode: code,
      playerName: player.name,
      photoURL: player.photoURL || null,
    });

    const game = games.get(code);

    if (game) {
      const state = game.getStateForPlayer(reconnectPlayerId);

      if (typeof callback === 'function') {
        callback({ success: true, state });
      }
      socket.emit('game-state-sync', { ...state, playerId: reconnectPlayerId, gameType: room.gameType });

      // If it's this player's turn, re-send turn payload with playable cards
      if (state.currentTurnPlayerId === reconnectPlayerId && game.getPlayableCards) {
        const playableCards = game.getPlayableCards(reconnectPlayerId);
        if (room.gameType === 'donkey') {
          socket.emit('donkey-your-turn', {
            playerId: reconnectPlayerId,
            playableCards: playableCards || [],
            leadSuit: state.leadSuit || state.donkeyLeadSuit || null,
            trickNumber: state.trickNumber || state.donkeyTrickNumber || 1,
          });
        } else {
          socket.emit('your-turn', {
            playerId: reconnectPlayerId,
            playableCards: playableCards || [],
            phase: state.phase,
          });
        }
      }
    } else {
      if (typeof callback === 'function') {
        callback({ success: true, state: null });
      }
    }

    io.to(code).emit('player-reconnected', {
      playerId: reconnectPlayerId,
      playerName: player.name,
    });
  });

  // -------------------------------------------------------------------------
  // WebRTC Signaling (voice chat)
  // -------------------------------------------------------------------------
  socket.on('webrtc-offer', ({ targetId, offer, channelId }) => {
    const actor = getActor();
    const resolvedChannelId = resolveVoiceChannelId(socket, channelId);
    if (!targetId || !offer || !resolvedChannelId) return;
    if (!isMemberInVoiceChannel(actor.uid, resolvedChannelId)) return;
    if (!isMemberInVoiceChannel(targetId, resolvedChannelId)) return;
    emitToUid(io, targetId, 'webrtc-offer', {
      fromId: actor.uid,
      offer,
      channelId: resolvedChannelId,
    });
  });

  socket.on('webrtc-answer', ({ targetId, answer, channelId }) => {
    const actor = getActor();
    const resolvedChannelId = resolveVoiceChannelId(socket, channelId);
    if (!targetId || !answer || !resolvedChannelId) return;
    if (!isMemberInVoiceChannel(actor.uid, resolvedChannelId)) return;
    if (!isMemberInVoiceChannel(targetId, resolvedChannelId)) return;
    emitToUid(io, targetId, 'webrtc-answer', {
      fromId: actor.uid,
      answer,
      channelId: resolvedChannelId,
    });
  });

  socket.on('webrtc-ice-candidate', ({ targetId, candidate, channelId }) => {
    const actor = getActor();
    const resolvedChannelId = resolveVoiceChannelId(socket, channelId);
    if (!targetId || !candidate || !resolvedChannelId) return;
    if (!isMemberInVoiceChannel(actor.uid, resolvedChannelId)) return;
    if (!isMemberInVoiceChannel(targetId, resolvedChannelId)) return;
    emitToUid(io, targetId, 'webrtc-ice-candidate', {
      fromId: actor.uid,
      candidate,
      channelId: resolvedChannelId,
    });
  });

  socket.on('voice-join', (payload = {}, callback) => {
    const actor = getActor();
    const requestedChannelId = payload.channelId;
    const channelType = String(payload.channelType || '').toLowerCase();
    const partySession = findPartyByUid(actor.uid);
    let channelId = resolveVoiceChannelId(socket, requestedChannelId);

    if (channelType === 'party') {
      if (!partySession || !partySession.getMember(actor.uid)) {
        if (typeof callback === 'function') callback({ success: false, error: 'Party voice unavailable' });
        return;
      }
      channelId = `party:${partySession.id}`;
    } else if (channelType === 'room') {
      const roomCode = socket.data?.roomCode;
      if (!roomCode) {
        if (typeof callback === 'function') callback({ success: false, error: 'Room voice unavailable' });
        return;
      }
      channelId = `room:${roomCode}`;
    }

    if (!channelId) {
      if (typeof callback === 'function') callback({ success: false, error: 'Unable to resolve voice channel' });
      return;
    }

    if (channelId.startsWith('party:')) {
      const targetParty = partySession || partySessions.get(channelId.slice('party:'.length));
      if (!targetParty || !targetParty.getMember(actor.uid)) {
        if (typeof callback === 'function') callback({ success: false, error: 'Not a member of this party channel' });
        return;
      }
      targetParty.voiceParticipants.add(actor.uid);
      emitPartyState(io, targetParty, 'voice-join-party-channel');
    }

    joinVoiceChannel(io, socket, actor.uid, channelId);
    if (typeof callback === 'function') callback({ success: true, channelId });
  });

  socket.on('voice-leave', (payload = {}, callback) => {
    const actor = getActor();
    const requestedChannelId = payload.channelId;
    const channelId = requestedChannelId || voiceChannelByUid.get(actor.uid) || resolveVoiceChannelId(socket);
    if (!channelId) {
      if (typeof callback === 'function') callback({ success: true });
      return;
    }
    leaveVoiceChannel(io, actor.uid, channelId);
    socket.leave(getVoiceSocketRoomName(channelId));

    if (channelId.startsWith('party:')) {
      const partyId = channelId.slice('party:'.length);
      const partySession = partySessions.get(partyId);
      if (partySession) {
        partySession.voiceParticipants.delete(actor.uid);
        emitPartyState(io, partySession, 'voice-leave-party-channel');
      }
    }

    if (typeof callback === 'function') callback({ success: true, channelId });
  });

  socket.on('voice-mute-player', ({ targetId, muted, channelId }) => {
    const actor = getActor();
    const requestedChannelId = String(channelId || '').trim();
    const resolvedChannelId = requestedChannelId || resolveVoiceChannelId(socket);
    if (!targetId || !resolvedChannelId) return;

    if (resolvedChannelId.startsWith('party:')) {
      const partyId = resolvedChannelId.slice('party:'.length);
      const partySession = partySessions.get(partyId);
      if (!partySession || partySession.leaderUid !== actor.uid || !partySession.getMember(targetId)) return;
    } else if (resolvedChannelId.startsWith('room:')) {
      const roomCode = resolvedChannelId.slice('room:'.length);
      const room = rooms.get(roomCode);
      if (!room || room.hostId !== actor.uid || !room.getPlayer(targetId)) return;
    } else {
      return;
    }

    emitToUid(io, targetId, 'voice-force-mute', {
      muted: Boolean(muted),
      channelId: resolvedChannelId,
    });
    io.to(getVoiceSocketRoomName(resolvedChannelId)).emit('voice-player-muted', {
      playerId: targetId,
      muted: Boolean(muted),
      channelId: resolvedChannelId,
    });
  });

  // -------------------------------------------------------------------------
  // donkey-play-card (Indian trick-taking play)
  // -------------------------------------------------------------------------
  const handleDonkeyPlayCard = ({ card, cardIndex }, callback) => {
    const { playerId, roomCode } = socket.data || {};
    const game = games.get(roomCode);

    if (!game || !(game instanceof DonkeyGame)) {
      if (typeof callback === 'function') return callback({ success: false, error: 'No active Donkey game' });
      return;
    }

    try {
      let cardToPlay = card;
      // Backward compatibility for index-based payload
      if (!cardToPlay && Number.isInteger(cardIndex) && typeof game.getCardByIndex === 'function') {
        cardToPlay = game.getCardByIndex(playerId, cardIndex);
      }

      if (!cardToPlay) {
        if (typeof callback === 'function') callback({ success: false, error: 'Card is required' });
        return;
      }

      game.playCard(playerId, cardToPlay);
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  };

  socket.on('donkey-play-card', handleDonkeyPlayCard);
  // Legacy alias for older APKs
  socket.on('donkey-pick-card', handleDonkeyPlayCard);

  // -------------------------------------------------------------------------
  // donkey-next-round
  // -------------------------------------------------------------------------
  socket.on('donkey-next-round', () => {
    const { roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    const game = games.get(roomCode);
    if (game && game instanceof DonkeyGame) {
      if (room) room.status = 'in-progress';
      game.triggerNextRound();
    }
  });

  // -------------------------------------------------------------------------
  // join-queue (matchmaking)
  // -------------------------------------------------------------------------
  socket.on('join-queue', ({ playerName, maxPlayers, gameType, photoURL }, callback) => {
    const actor = getActor();
    const effectivePlayerName = normalizePartyMemberName(playerName || actor.playerName);
    const effectivePhotoURL = photoURL || actor.photoURL || null;

    if (!effectivePlayerName) {
      if (typeof callback === 'function') return callback({ success: false, error: 'Name is required' });
      return;
    }

    mergeSocketSession(socket, {
      playerId: actor.uid,
      playerName: effectivePlayerName,
      photoURL: effectivePhotoURL,
    });

    const count = Math.min(Math.max(Number(maxPlayers) || 4, 2), 5);
    const validGameType = gameType === 'donkey' ? 'donkey' : 'callbreak';
    const queueKey = getQueueKey(validGameType, count);

    // Remove from any existing queue first
    const existingKey = queuedPlayers.get(socket.id);
    if (existingKey !== undefined) {
      const q = getQueue(existingKey);
      const idx = q.findIndex((e) => e.socketId === socket.id);
      if (idx !== -1) q.splice(idx, 1);
      broadcastQueueStatus(io, existingKey);
      queuedPlayers.delete(socket.id);
    }

    // Add to queue
    const queue = getQueue(queueKey);
    const queuePlayerId = actor.uid;
    queue.push({
      socketId: socket.id,
      playerId: queuePlayerId,
      playerName: effectivePlayerName,
      photoURL: effectivePhotoURL,
    });
    queuedPlayers.set(socket.id, queueKey);

    const position = queue.length;
    if (typeof callback === 'function') {
      callback({ success: true, position, total: queue.length, maxPlayers: count });
    }

    // Broadcast status then try to form a match
    broadcastQueueStatus(io, queueKey);
    tryMatchQueue(io, queueKey, rooms, games);
  });

  // -------------------------------------------------------------------------
  // leave-queue (matchmaking)
  // -------------------------------------------------------------------------
  socket.on('leave-queue', (callback) => {
    const queueKey = queuedPlayers.get(socket.id);
    if (queueKey !== undefined) {
      const q = getQueue(queueKey);
      const idx = q.findIndex((e) => e.socketId === socket.id);
      if (idx !== -1) q.splice(idx, 1);
      broadcastQueueStatus(io, queueKey);
      queuedPlayers.delete(socket.id);
    }
    if (typeof callback === 'function') callback({ success: true });
  });

  // -------------------------------------------------------------------------
  // disconnect
  // -------------------------------------------------------------------------
  socket.on('disconnect', () => {
    const actorUid = getSocketUid(socket);
    untrackSocketUid(actorUid, socket.id);

    // Clean up matchmaking queue on disconnect
    const queueKey = queuedPlayers.get(socket.id);
    if (queueKey !== undefined) {
      const q = getQueue(queueKey);
      const idx = q.findIndex((e) => e.socketId === socket.id);
      if (idx !== -1) q.splice(idx, 1);
      broadcastQueueStatus(io, queueKey);
      queuedPlayers.delete(socket.id);
    }

    const socketsForActor = socketsByUid.get(actorUid);
    const hasAnotherSession = Boolean(socketsForActor && socketsForActor.size > 0);

    const activeVoiceChannel = voiceChannelByUid.get(actorUid);
    if (activeVoiceChannel && !hasAnotherSession) {
      leaveVoiceChannel(io, actorUid, activeVoiceChannel);
    }

    const partySession = findPartyByUid(actorUid);
    if (partySession) {
      if (!hasAnotherSession) {
        cancelPartyQueueIfNeeded(partySession, 'party-member-disconnected-queue-canceled');
        partySession.markDisconnected(actorUid);
        const nextLeader = partySession.transferLeaderIfNeeded();
        if (nextLeader) {
          logPartyMetric('party_leader_transferred', partySession, { nextLeaderUid: nextLeader.uid });
        }
        if (partySession.members.length === 0) {
          cleanupPartyIfEmpty(io, partySession);
        } else {
          emitPartyState(io, partySession, 'member-disconnected');
        }
      } else {
        const replacementSocketId = socketsForActor.values().next().value;
        partySession.markConnected(actorUid, replacementSocketId);
      }
    }

    const { playerId, roomCode } = socket.data || {};

    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.getPlayer(playerId);
    if (!player) return;

    if (hasAnotherSession) {
      player.socketId = socketsForActor.values().next().value;
      player.isConnected = true;
      return;
    }

    player.isConnected = false;

    // Clean up voice participation
    const roomVoiceChannelId = `room:${roomCode}`;
    if (voiceChannelByUid.get(playerId) === roomVoiceChannelId) {
      leaveVoiceChannel(io, playerId, roomVoiceChannelId);
    }

    io.to(roomCode).emit('player-disconnected', {
      playerId,
      playerName: player.name,
    });

    // Schedule room cleanup if all players have disconnected
    const allDisconnected = room.players.every((p) => !p.isConnected);

    if (allDisconnected) {
      setTimeout(() => {
        const currentRoom = rooms.get(roomCode);
        if (currentRoom && currentRoom.players.every((p) => !p.isConnected)) {
          // Clean up game timers
          const game = games.get(roomCode);
          if (game) {
            if (typeof game.destroy === 'function') {
              game.destroy();
            } else {
              game._clearTurnTimer?.();
              game.removeAllListeners?.();
            }
            games.delete(roomCode);
          }

          restorePartiesForRoom(io, roomCode, 'room-cleanup-disconnected');
          rooms.delete(roomCode);
        }
      }, ROOM_CLEANUP_DELAY_MS);
    }
  });
}
