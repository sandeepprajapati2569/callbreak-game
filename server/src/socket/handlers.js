import { randomBytes } from 'crypto';
import Room from '../models/Room.js';
import Player from '../models/Player.js';
import Game from '../game/Game.js';

// Characters that avoid ambiguity (no 0/O, 1/I/L)
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;

// Delay before clearing the trick cards on the client
const TRICK_CLEAR_DELAY_MS = 1500;

// Time before cleaning up an empty room
const ROOM_CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes

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
  socket.on('create-room', ({ playerName, maxPlayers }, callback) => {
    let code;
    do {
      code = generateRoomCode();
    } while (rooms.has(code));

    const playerId = socket.id;
    const player = new Player(playerId, playerName, socket.id);
    const room = new Room(code, playerId, maxPlayers || 4);

    room.addPlayer(player);
    rooms.set(code, room);

    socket.join(code);
    socket.data = { playerId, roomCode: code };

    const response = {
      roomCode: code,
      playerId,
      maxPlayers: room.maxPlayers,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
        isReady: p.isReady,
        isConnected: p.isConnected,
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
  socket.on('join-room', ({ roomCode, playerName }, callback) => {
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

    const playerId = socket.id;
    const player = new Player(playerId, playerName, socket.id);

    room.addPlayer(player);
    socket.join(code);
    socket.data = { playerId, roomCode: code };

    const playerList = room.players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
      isReady: p.isReady,
      isConnected: p.isConnected,
    }));

    const joinResponse = { roomCode: code, playerId, maxPlayers: room.maxPlayers, players: playerList };

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
      })),
    });

    if (typeof callback === 'function') {
      callback({ success: true, isReady: player.isReady });
    }

    // If all players are ready, start the game
    if (room.allReady()) {
      room.status = 'in-progress';

      const game = new Game(roomCode, room.players);
      games.set(roomCode, game);
      room.game = game;

      wireGameEvents(io, game, room);
      game.startGame();
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
        game._clearTurnTimer();
        game.removeAllListeners();
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
      socket.emit('state-sync', state);
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
  // disconnect
  // -------------------------------------------------------------------------
  socket.on('disconnect', () => {
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
            game._clearTurnTimer();
            game.removeAllListeners();
            games.delete(roomCode);
          }

          rooms.delete(roomCode);
        }
      }, ROOM_CLEANUP_DELAY_MS);
    }
  });
}
