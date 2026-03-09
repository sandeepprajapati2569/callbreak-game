import { EventEmitter } from 'events';
import { createDeck, shuffle, deal } from './Deck.js';

const PICK_TIMEOUT_MS = 20_000; // 20 seconds to pick a card
const DONKEY_WORD = 'DONKEY';

/**
 * Finds a rank that has 4 or more cards in the hand.
 * @returns {string|null} The rank string, or null if none found.
 */
function findFourOfAKind(hand) {
  if (!hand || hand.length < 4) return null;
  const counts = {};
  for (const card of hand) {
    counts[card.rank] = (counts[card.rank] || 0) + 1;
  }
  for (const [rank, count] of Object.entries(counts)) {
    if (count >= 4) return rank;
  }
  return null;
}

/**
 * Gadha Ladan (Donkey) Game Engine
 *
 * Full 52-card deck dealt among 2-5 players. Players take turns picking a card
 * blindly from their right neighbor's hand. Any 4-of-a-kind formed is auto-discarded.
 * Last player holding cards loses the round and gets a letter (D-O-N-K-E-Y).
 * First to spell DONKEY loses the game.
 */
export default class DonkeyGame extends EventEmitter {
  /**
   * @param {string} roomCode
   * @param {Array} players - Array of Player instances (2-5 players).
   */
  constructor(roomCode, players) {
    super();

    if (players.length < 2 || players.length > 5) {
      throw new Error(`Donkey requires 2-5 players, got ${players.length}`);
    }

    this.roomCode = roomCode;
    this.numPlayers = players.length;

    // Internal player state
    this.players = players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
      socketId: p.socketId,
      hand: [],
      letters: '',      // accumulates D-O-N-K-E-Y
      isActive: true,   // still in the current round (has cards)
    }));

    this.phase = 'WAITING'; // WAITING | PLAYING | ROUND_RESULT | GAME_OVER
    this.roundNumber = 0;
    this.currentTurnIndex = -1;  // index into this.players array
    this.activePlayers = [];     // IDs of players still holding cards
    this.roundLoserId = null;    // who lost previous round (starts next round)
    this.turnTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  startGame() {
    if (this.phase !== 'WAITING') throw new Error('Game already started');
    this._startNewRound();
  }

  /**
   * Player picks a card from their right neighbor's hand by index.
   * @param {string} playerId - The picker's ID.
   * @param {number} cardIndex - Index of the card in the right neighbor's hand.
   */
  pickCard(playerId, cardIndex) {
    if (this.phase !== 'PLAYING') return;

    // Validate it's this player's turn
    const currentPlayer = this.players[this.currentTurnIndex];
    if (!currentPlayer || currentPlayer.id !== playerId) return;
    if (!currentPlayer.isActive) return;

    // Find right neighbor
    const rightNeighbor = this._getRightNeighbor(playerId);
    if (!rightNeighbor || rightNeighbor.hand.length === 0) return;

    // Validate card index
    if (cardIndex < 0 || cardIndex >= rightNeighbor.hand.length) return;

    // Clear turn timer
    this._clearTurnTimer();

    // Remove card from right neighbor's hand
    const pickedCard = rightNeighbor.hand.splice(cardIndex, 1)[0];

    // Add card to picker's hand
    currentPlayer.hand.push(pickedCard);

    // Broadcast pick info (don't reveal the card to others)
    this.emit('donkey-card-picked', {
      pickerId: currentPlayer.id,
      pickerName: currentPlayer.name,
      fromId: rightNeighbor.id,
      fromName: rightNeighbor.name,
      pickerCardCount: currentPlayer.hand.length,
      fromCardCount: rightNeighbor.hand.length,
    });

    // Reveal the actual card only to the picker
    this.emit('donkey-picked-card-reveal', {
      playerId: currentPlayer.id,
      card: pickedCard,
    });

    // Check for 4-of-a-kind in picker's hand and auto-discard
    this._autoDiscardSets(currentPlayer);

    // Send updated hands to both players
    this.emit('donkey-hand-updated', {
      playerId: currentPlayer.id,
      hand: currentPlayer.hand,
    });
    this.emit('donkey-hand-updated', {
      playerId: rightNeighbor.id,
      hand: rightNeighbor.hand,
    });

    // Check if picker's hand is empty → safe
    if (currentPlayer.hand.length === 0 && currentPlayer.isActive) {
      currentPlayer.isActive = false;
      this.activePlayers = this.activePlayers.filter((id) => id !== currentPlayer.id);
      this.emit('donkey-player-safe', {
        playerId: currentPlayer.id,
        playerName: currentPlayer.name,
      });
    }

    // Check if right neighbor's hand is empty → safe
    if (rightNeighbor.hand.length === 0 && rightNeighbor.isActive) {
      rightNeighbor.isActive = false;
      this.activePlayers = this.activePlayers.filter((id) => id !== rightNeighbor.id);
      this.emit('donkey-player-safe', {
        playerId: rightNeighbor.id,
        playerName: rightNeighbor.name,
      });
    }

    // Broadcast updated player info
    this._broadcastPlayerInfo();

    // Check if round is over (1 or fewer active players)
    if (this.activePlayers.length <= 1) {
      const loserId = this.activePlayers.length === 1 ? this.activePlayers[0] : null;
      setTimeout(() => this._endRound(loserId), 1500);
      return;
    }

    // Advance to next turn
    this._advanceTurn();
    this._emitTurnStart();
    this._startTurnTimer();
  }

  /**
   * Trigger next round from round-result screen.
   */
  triggerNextRound() {
    if (this.phase !== 'ROUND_RESULT') return;
    const donkeyPlayer = this.players.find(
      (p) => p.letters.length >= DONKEY_WORD.length
    );
    if (!donkeyPlayer) {
      this._startNewRound();
    }
  }

  /**
   * Returns game state for a specific player (for reconnection).
   */
  getStateForPlayer(playerId) {
    const player = this._getPlayer(playerId);
    const currentTurnPlayer = this.currentTurnIndex >= 0
      ? this.players[this.currentTurnIndex] : null;

    let rightNeighbor = null;
    if (player && this.phase === 'PLAYING' && player.isActive) {
      rightNeighbor = this._getRightNeighbor(playerId);
    }

    return {
      gameType: 'donkey',
      phase:
        this.phase === 'PLAYING'
          ? 'DONKEY_PLAYING'
          : this.phase === 'ROUND_RESULT'
            ? 'DONKEY_ROUND_RESULT'
            : this.phase === 'GAME_OVER'
              ? 'DONKEY_GAME_OVER'
              : 'DONKEY_WAITING',
      roundNumber: this.roundNumber,
      myHand: player?.hand || [],
      currentTurnPlayerId: currentTurnPlayer?.id || null,
      isMyTurn: currentTurnPlayer?.id === playerId,
      rightNeighborId: rightNeighbor?.id || null,
      rightNeighborCardCount: rightNeighbor?.hand.length || 0,
      activePlayers: [...this.activePlayers],
      donkeyPlayers: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        letters: p.letters,
        isActive: p.isActive,
        seatIndex: p.seatIndex,
        cardCount: p.hand.length,
      })),
      donkeyRound: this.roundNumber,
    };
  }

  removeAllListeners() {
    super.removeAllListeners();
    this._clearTurnTimer();
  }

  destroy() {
    this._clearTurnTimer();
    this.removeAllListeners();
  }

  // ---------------------------------------------------------------------------
  // Private — round management
  // ---------------------------------------------------------------------------

  _startNewRound() {
    this.roundNumber++;

    // Reset per-round state for all players
    this.players.forEach((p) => {
      p.hand = [];
      p.isActive = true;
    });

    // All players participate every round
    this.activePlayers = this.players.map((p) => p.id);

    // Create full 52-card deck, shuffle, and deal
    const deck = shuffle(createDeck());
    const hands = deal(deck, this.numPlayers);

    // Assign hands
    this.players.forEach((player, idx) => {
      player.hand = hands[idx];
    });

    // Build player info for broadcast
    const playersInfo = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      letters: p.letters,
      isActive: p.isActive,
      seatIndex: p.seatIndex,
      cardCount: p.hand.length,
    }));

    // Emit hand to each player individually
    this.players.forEach((player) => {
      this.emit('donkey-hand-dealt', {
        playerId: player.id,
        hand: player.hand,
        round: this.roundNumber,
        players: playersInfo,
      });
    });

    // Auto-discard initial 4-of-a-kind sets after a brief delay
    setTimeout(() => this._processInitialDiscards(), 1500);
  }

  _processInitialDiscards() {
    // For each player, discard any 4-of-a-kind sets they were dealt
    this.players.forEach((player) => {
      this._autoDiscardSets(player);
    });

    // Check if any player's hand is now empty after initial discards
    this.players.forEach((player) => {
      if (player.hand.length === 0 && player.isActive) {
        player.isActive = false;
        this.activePlayers = this.activePlayers.filter((id) => id !== player.id);
        this.emit('donkey-player-safe', {
          playerId: player.id,
          playerName: player.name,
        });
      }
    });

    // Send updated hands to each player
    this.players.forEach((player) => {
      this.emit('donkey-hand-updated', {
        playerId: player.id,
        hand: player.hand,
      });
    });

    // Broadcast updated player info
    this._broadcastPlayerInfo();

    // Check if round already over after initial discards
    if (this.activePlayers.length <= 1) {
      const loserId = this.activePlayers.length === 1 ? this.activePlayers[0] : null;
      setTimeout(() => this._endRound(loserId), 1500);
      return;
    }

    // Determine first turn
    this.phase = 'PLAYING';
    this._setFirstTurn();
    this._emitTurnStart();
    this._startTurnTimer();
  }

  /**
   * Auto-discard all 4-of-a-kind sets from a player's hand.
   */
  _autoDiscardSets(player) {
    let rank;
    while ((rank = findFourOfAKind(player.hand)) !== null) {
      // Remove all 4 cards of that rank
      player.hand = player.hand.filter((c) => c.rank !== rank);

      this.emit('donkey-set-discarded', {
        playerId: player.id,
        playerName: player.name,
        rank,
        newCardCount: player.hand.length,
      });
    }
  }

  _setFirstTurn() {
    const activeSorted = this._getActivePlayersSorted();
    if (activeSorted.length === 0) return;

    if (this.roundLoserId) {
      // Round loser from previous round starts
      const loserIdx = activeSorted.findIndex((p) => p.id === this.roundLoserId);
      if (loserIdx >= 0) {
        this.currentTurnIndex = this.players.findIndex((p) => p.id === activeSorted[loserIdx].id);
        return;
      }
    }

    // Default: first active player by seatIndex
    this.currentTurnIndex = this.players.findIndex((p) => p.id === activeSorted[0].id);
  }

  _advanceTurn() {
    const activeSorted = this._getActivePlayersSorted();
    if (activeSorted.length <= 1) return;

    const currentId = this.players[this.currentTurnIndex]?.id;
    const activeIdx = activeSorted.findIndex((p) => p.id === currentId);

    // Move to next active player clockwise
    const nextActiveIdx = (activeIdx + 1) % activeSorted.length;
    const nextPlayer = activeSorted[nextActiveIdx];

    this.currentTurnIndex = this.players.findIndex((p) => p.id === nextPlayer.id);
  }

  _emitTurnStart() {
    const current = this.players[this.currentTurnIndex];
    if (!current) return;

    const rightNeighbor = this._getRightNeighbor(current.id);
    if (!rightNeighbor) return;

    // Individual event to current player — includes right neighbor info for picking UI
    this.emit('donkey-your-turn', {
      playerId: current.id,
      rightNeighborId: rightNeighbor.id,
      rightNeighborName: rightNeighbor.name,
      rightNeighborCardCount: rightNeighbor.hand.length,
    });

    // Broadcast event — tells everyone whose turn it is
    this.emit('donkey-turn-changed', {
      playerId: current.id,
      playerName: current.name,
      seatIndex: current.seatIndex,
    });
  }

  _startTurnTimer() {
    this._clearTurnTimer();

    const current = this.players[this.currentTurnIndex];
    if (!current) return;

    this.emit('donkey-turn-timer-start', {
      playerId: current.id,
      duration: PICK_TIMEOUT_MS,
    });

    this.turnTimer = setTimeout(() => {
      // Auto-pick a random card from right neighbor
      const rightNeighbor = this._getRightNeighbor(current.id);
      if (rightNeighbor && rightNeighbor.hand.length > 0) {
        const randomIdx = Math.floor(Math.random() * rightNeighbor.hand.length);
        this.pickCard(current.id, randomIdx);
      }
    }, PICK_TIMEOUT_MS);
  }

  _clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  _broadcastPlayerInfo() {
    this.emit('donkey-players-update', {
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        letters: p.letters,
        isActive: p.isActive,
        seatIndex: p.seatIndex,
        cardCount: p.hand.length,
      })),
    });
  }

  _endRound(loserId) {
    this.phase = 'ROUND_RESULT';
    this._clearTurnTimer();

    this.roundLoserId = loserId;
    const loser = this._getPlayer(loserId);
    let newLetter = '';
    if (loser) {
      const nextIdx = loser.letters.length;
      if (nextIdx < DONKEY_WORD.length) {
        newLetter = DONKEY_WORD[nextIdx];
        loser.letters += newLetter;
      }
    }

    const playersInfo = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      letters: p.letters,
      seatIndex: p.seatIndex,
    }));

    this.emit('donkey-round-result', {
      loserId,
      loserName: loser?.name,
      newLetter,
      players: playersInfo,
      round: this.roundNumber,
    });

    // Check if game over
    if (loser && loser.letters.length >= DONKEY_WORD.length) {
      setTimeout(() => this._endGame(loserId), 2000);
    }
  }

  _endGame(donkeyPlayerId) {
    this.phase = 'GAME_OVER';
    this._clearTurnTimer();

    const donkeyPlayer = this._getPlayer(donkeyPlayerId);

    this.emit('donkey-game-over', {
      donkeyPlayerId,
      donkeyPlayerName: donkeyPlayer?.name,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        letters: p.letters,
        seatIndex: p.seatIndex,
      })),
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  _getPlayer(id) {
    return this.players.find((p) => p.id === id);
  }

  /**
   * Get active players sorted by seatIndex (clockwise order).
   */
  _getActivePlayersSorted() {
    return this.players
      .filter((p) => p.isActive)
      .sort((a, b) => a.seatIndex - b.seatIndex);
  }

  /**
   * Find the right neighbor of a player among active players.
   * "Right" = previous player in clockwise seatIndex order (counter-clockwise).
   */
  _getRightNeighbor(playerId) {
    const activeSorted = this._getActivePlayersSorted();
    if (activeSorted.length < 2) return null;

    const myIdx = activeSorted.findIndex((p) => p.id === playerId);
    if (myIdx === -1) return null;

    // Right neighbor = previous in clockwise = (myIdx - 1 + len) % len
    const rightIdx = (myIdx - 1 + activeSorted.length) % activeSorted.length;
    return activeSorted[rightIdx];
  }
}

export { DONKEY_WORD, PICK_TIMEOUT_MS };
