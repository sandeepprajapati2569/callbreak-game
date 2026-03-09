import { randomBytes } from 'crypto';
import Room from '../models/Room.js';
import Player from '../models/Player.js';
import Game from '../game/Game.js';
import DonkeyGame from '../game/DonkeyGame.js';

// Characters that avoid ambiguity (no 0/O, 1/I/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

// Delay before clearing the trick cards on the client
const TRICK_CLEAR_DELAY_MS = 1500;

// Time before cleaning up an empty room
const ROOM_CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes

// ---- Matchmaking queues (module-level, shared across all connections) ----
// Map<queueKey, Array<{ socketId, playerId, playerName }>>
// queueKey = `${gameType}-${playerCount}` e.g. "callbreak-4", "donkey-3"
const matchmakingQueues = new Map();
// Reverse lookup: Map<socketId, queueKey> — for disconnect cleanup
const queuedPlayers = new Map();

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
      sock.data = { playerId: entry.playerId, roomCode: code };
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

  // Broadcast: a 4-of-a-kind set was discarded
  game.on('donkey-set-discarded', (data) => {
    io.to(room.code).emit('donkey-set-discarded', data);
  });

  // Individual: it's your turn (includes right neighbor info)
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

  // Broadcast: a card was picked (no card content revealed)
  game.on('donkey-card-picked', (data) => {
    io.to(room.code).emit('donkey-card-picked', data);
  });

  // Individual: reveal the picked card only to the picker
  game.on('donkey-picked-card-reveal', ({ playerId, card }) => {
    const player = room.getPlayer(playerId);
    if (player && player.socketId) {
      io.to(player.socketId).emit('donkey-picked-card-reveal', { card });
    }
  });

  // Individual: updated hand after pick/discard
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

  // Broadcast: round result
  game.on('donkey-round-result', (data) => {
    io.to(room.code).emit('donkey-round-result', data);
  });

  // Broadcast: game over
  game.on('donkey-game-over', (data) => {
    io.to(room.code).emit('donkey-game-over', data);
    room.status = 'finished';
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

  // -------------------------------------------------------------------------
  // create-room
  // -------------------------------------------------------------------------
  socket.on('create-room', ({ playerName, maxPlayers, gameType, photoURL }, callback) => {
    let code;
    do {
      code = generateRoomCode();
    } while (rooms.has(code));

    const validGameType = gameType === 'donkey' ? 'donkey' : 'callbreak';
    const playerId = socket.handshake.auth?.playerId || socket.id;
    const player = new Player(playerId, playerName, socket.id, photoURL || null);
    const room = new Room(code, playerId, maxPlayers || 4, validGameType);

    room.addPlayer(player);
    rooms.set(code, room);

    socket.join(code);
    socket.data = { playerId, roomCode: code };

    const response = {
      roomCode: code,
      playerId,
      maxPlayers: room.maxPlayers,
      gameType: room.gameType,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
        isReady: p.isReady,
        isConnected: p.isConnected,
        photoURL: p.photoURL || null,
      })),
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

    const playerId = socket.handshake.auth?.playerId || socket.id;
    const player = new Player(playerId, playerName, socket.id, photoURL || null);

    room.addPlayer(player);
    socket.join(code);
    socket.data = { playerId, roomCode: code };

    const playerList = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
      isReady: p.isReady,
      isConnected: p.isConnected,
      photoURL: p.photoURL || null,
    }));

    const joinResponse = { roomCode: code, playerId, maxPlayers: room.maxPlayers, gameType: room.gameType, players: playerList };

    if (typeof callback === 'function') {
      callback({ success: true, ...joinResponse });
    }

    // Emit room-joined to the joining player (mirrors room-created for host)
    socket.emit('room-joined', joinResponse);

    // Notify everyone in the room about the new player
    io.to(code).emit('player-joined', {
      playerId,
      playerName,
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
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
        isReady: p.isReady,
        isConnected: p.isConnected,
        photoURL: p.photoURL || null,
      })),
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

    // Clean up voice participation for kicked player
    if (room.voiceParticipants.has(targetPlayerId)) {
      room.removeVoiceParticipant(targetPlayerId);
      io.to(roomCode).emit('voice-peer-left', { peerId: targetPlayerId });
    }

    room.removePlayer(targetPlayerId);

    const playerList = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
      isReady: p.isReady,
      isConnected: p.isConnected,
      photoURL: p.photoURL || null,
    }));

    // Notify the kicked player
    io.to(targetSocketId).emit('player-kicked', {
      reason: 'You were removed from the room by the host',
    });

    // Remove kicked player from the Socket.IO room
    const kickedSocket = io.sockets.sockets.get(targetSocketId);
    if (kickedSocket) {
      kickedSocket.leave(roomCode);
      kickedSocket.data = {};
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

    // Clean up voice participation
    if (room.voiceParticipants.has(playerId)) {
      room.removeVoiceParticipant(playerId);
      socket.to(roomCode).emit('voice-peer-left', { peerId: playerId });
    }

    room.removePlayer(playerId);

    // Leave the Socket.IO room and clear socket data
    socket.leave(roomCode);
    socket.data = {};

    const playerList = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
      isReady: p.isReady,
      isConnected: p.isConnected,
      photoURL: p.photoURL || null,
    }));

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
  socket.on('check-active-game', ({ playerId: reqPlayerId }, callback) => {
    const pid = reqPlayerId || socket.handshake.auth?.playerId;
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
    const code = roomCode?.toUpperCase();
    const room = rooms.get(code);

    if (!room) {
      const error = { success: false, error: 'Room not found' };
      if (typeof callback === 'function') return callback(error);
      return socket.emit('error-message', error);
    }

    const player = room.getPlayer(playerId);
    if (!player) {
      const error = { success: false, error: 'Player not found in room' };
      if (typeof callback === 'function') return callback(error);
      return socket.emit('error-message', error);
    }

    // Re-associate socket
    player.socketId = socket.id;
    player.isConnected = true;

    socket.join(code);
    socket.data = { playerId, roomCode: code };

    const game = games.get(code);

    if (game) {
      const state = game.getStateForPlayer(playerId);

      if (typeof callback === 'function') {
        callback({ success: true, state });
      }
      socket.emit('game-state-sync', { ...state, playerId, gameType: room.gameType });

      // If it's this player's turn, re-send your-turn with playable cards
      if (state.currentTurnPlayerId === playerId && game.getPlayableCards) {
        const playableCards = game.getPlayableCards(playerId);
        socket.emit('your-turn', {
          playerId,
          playableCards: playableCards || [],
          phase: state.phase,
        });
      }
    } else {
      if (typeof callback === 'function') {
        callback({ success: true, state: null });
      }
    }

    io.to(code).emit('player-reconnected', {
      playerId,
      playerName: player.name,
    });
  });

  // -------------------------------------------------------------------------
  // WebRTC Signaling (voice chat)
  // -------------------------------------------------------------------------
  socket.on('webrtc-offer', ({ targetId, offer }) => {
    const { playerId, roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room) return;
    const targetPlayer = room.getPlayer(targetId);
    if (targetPlayer && targetPlayer.socketId) {
      io.to(targetPlayer.socketId).emit('webrtc-offer', { fromId: playerId, offer });
    }
  });

  socket.on('webrtc-answer', ({ targetId, answer }) => {
    const { playerId, roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room) return;
    const targetPlayer = room.getPlayer(targetId);
    if (targetPlayer && targetPlayer.socketId) {
      io.to(targetPlayer.socketId).emit('webrtc-answer', { fromId: playerId, answer });
    }
  });

  socket.on('webrtc-ice-candidate', ({ targetId, candidate }) => {
    const { playerId, roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room) return;
    const targetPlayer = room.getPlayer(targetId);
    if (targetPlayer && targetPlayer.socketId) {
      io.to(targetPlayer.socketId).emit('webrtc-ice-candidate', { fromId: playerId, candidate });
    }
  });

  socket.on('voice-join', () => {
    const { playerId, roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room) return;

    // Send existing voice participants to the new joiner FIRST
    const existingPeers = room.getVoiceParticipants();
    socket.emit('voice-existing-peers', { peerIds: existingPeers });

    // Track this player as a voice participant
    room.addVoiceParticipant(playerId);

    // Then notify existing voice participants about the new joiner
    socket.to(roomCode).emit('voice-peer-joined', { peerId: playerId });
  });

  socket.on('voice-leave', () => {
    const { playerId, roomCode } = socket.data || {};
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (room) {
      room.removeVoiceParticipant(playerId);
    }
    socket.to(roomCode).emit('voice-peer-left', { peerId: playerId });
  });

  socket.on('voice-mute-player', ({ targetId, muted }) => {
    const { playerId, roomCode } = socket.data || {};
    const room = rooms.get(roomCode);
    if (!room || room.hostId !== playerId) return;
    const targetPlayer = room.getPlayer(targetId);
    if (targetPlayer && targetPlayer.socketId) {
      io.to(targetPlayer.socketId).emit('voice-force-mute', { muted });
    }
    io.to(roomCode).emit('voice-player-muted', { playerId: targetId, muted });
  });

  // -------------------------------------------------------------------------
  // donkey-pick-card (pick a card from right neighbor's hand)
  // -------------------------------------------------------------------------
  socket.on('donkey-pick-card', ({ cardIndex }, callback) => {
    const { playerId, roomCode } = socket.data || {};
    const game = games.get(roomCode);

    if (!game || !(game instanceof DonkeyGame)) {
      if (typeof callback === 'function') return callback({ success: false, error: 'No active Donkey game' });
      return;
    }

    try {
      game.pickCard(playerId, cardIndex);
      if (typeof callback === 'function') callback({ success: true });
    } catch (err) {
      if (typeof callback === 'function') callback({ success: false, error: err.message });
    }
  });

  // -------------------------------------------------------------------------
  // donkey-next-round
  // -------------------------------------------------------------------------
  socket.on('donkey-next-round', () => {
    const { roomCode } = socket.data || {};
    const game = games.get(roomCode);
    if (game && game instanceof DonkeyGame) {
      game.triggerNextRound();
    }
  });

  // -------------------------------------------------------------------------
  // join-queue (matchmaking)
  // -------------------------------------------------------------------------
  socket.on('join-queue', ({ playerName, maxPlayers, gameType, photoURL }, callback) => {
    if (!playerName || typeof playerName !== 'string' || !playerName.trim()) {
      if (typeof callback === 'function') return callback({ success: false, error: 'Name is required' });
      return;
    }
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
    const queuePlayerId = socket.handshake.auth?.playerId || socket.id;
    queue.push({ socketId: socket.id, playerId: queuePlayerId, playerName: playerName.trim(), photoURL: photoURL || null });
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
    // Clean up matchmaking queue on disconnect
    const queueKey = queuedPlayers.get(socket.id);
    if (queueKey !== undefined) {
      const q = getQueue(queueKey);
      const idx = q.findIndex((e) => e.socketId === socket.id);
      if (idx !== -1) q.splice(idx, 1);
      broadcastQueueStatus(io, queueKey);
      queuedPlayers.delete(socket.id);
    }

    const { playerId, roomCode } = socket.data || {};

    if (!roomCode) return;

    const room = rooms.get(roomCode);
    if (!room) return;

    const player = room.getPlayer(playerId);
    if (!player) return;

    player.isConnected = false;

    // Clean up voice participation
    if (room.voiceParticipants.has(playerId)) {
      room.removeVoiceParticipant(playerId);
      socket.to(roomCode).emit('voice-peer-left', { peerId: playerId });
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

          rooms.delete(roomCode);
        }
      }, ROOM_CLEANUP_DELAY_MS);
    }
  });
}
