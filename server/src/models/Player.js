export default class Player {
  /**
   * @param {string} id - Unique player identifier.
   * @param {string} name - Display name.
   * @param {string} socketId - Current Socket.IO connection ID.
   */
  constructor(id, name, socketId) {
    this.id = id;
    this.name = name;
    this.socketId = socketId;
    this.hand = [];
    this.bid = null;
    this.tricksWon = 0;
    this.isConnected = true;
    this.isReady = false;
    this.seatIndex = null;
  }

  /**
   * Resets per-round state for a new round.
   * Clears hand, bid, and tricks won.
   */
  reset() {
    this.hand = [];
    this.bid = null;
    this.tricksWon = 0;
  }
}
