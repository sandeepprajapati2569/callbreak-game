export default class Room {
  /**
   * @param {string} code - Unique room code (e.g., 6-char alphanumeric).
   * @param {string} hostId - Player ID of the room creator.
   * @param {number} maxPlayers - Max players for this room (2-5), default 4.
   */
  constructor(code, hostId, maxPlayers = 4) {
    this.code = code;
    this.hostId = hostId;
    this.maxPlayers = Math.min(Math.max(Number(maxPlayers) || 4, 2), 5);
    this.players = [];
    this.game = null;
    this.status = 'waiting'; // 'waiting' | 'in-progress' | 'finished'
  }

  /**
   * Adds a player to the room.
   * @param {Player} player - The player to add.
   * @throws {Error} If the room is full.
   */
  addPlayer(player) {
    if (this.isFull()) {
      throw new Error('Room is full');
    }

    // Assign seat index based on join order
    player.seatIndex = this.players.length;
    this.players.push(player);
  }

  /**
   * Removes a player from the room by ID.
   * @param {string} playerId - The ID of the player to remove.
   * @returns {Player|null} The removed player, or null if not found.
   */
  removePlayer(playerId) {
    const index = this.players.findIndex((p) => p.id === playerId);

    if (index === -1) {
      return null;
    }

    const [removed] = this.players.splice(index, 1);

    // Re-index seats after removal
    this.players.forEach((player, i) => {
      player.seatIndex = i;
    });

    // If the host leaves, transfer to next player
    if (removed.id === this.hostId && this.players.length > 0) {
      this.hostId = this.players[0].id;
    }

    return removed;
  }

  /**
   * Retrieves a player by their ID.
   * @param {string} playerId
   * @returns {Player|undefined}
   */
  getPlayer(playerId) {
    return this.players.find((p) => p.id === playerId);
  }

  /**
   * Checks whether the room has reached maximum capacity.
   * @returns {boolean}
   */
  isFull() {
    return this.players.length >= this.maxPlayers;
  }

  /**
   * Checks whether all players in a full room are marked as ready.
   * @returns {boolean}
   */
  allReady() {
    return this.isFull() && this.players.every((p) => p.isReady);
  }
}
