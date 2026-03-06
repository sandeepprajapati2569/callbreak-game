import { EventEmitter } from 'events';

const PASS_TIMEOUT_MS = 15_000; // 15 seconds to select a card
const DONKEY_WORD = 'DONKEY';

// Ranks used for dealing (highest first)
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];

/**
 * Creates a Donkey deck with exactly numSets ranks × 4 suits.
 * @param {number} numSets - Number of 4-of-a-kind sets (= number of players).
 * @returns {Array} Array of { rank, suit } card objects.
 */
function createDonkeyDeck(numSets) {
  const selectedRanks = RANKS.slice(0, numSets);
  const deck = [];
  for (const rank of selectedRanks) {
    for (const suit of SUITS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/**
 * Fisher-Yates shuffle.
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Checks if a hand contains 4 cards of the same rank.
 */
function hasFourOfAKind(hand) {
  if (!hand || hand.length < 4) return false;
  const counts = {};
  for (const card of hand) {
    counts[card.rank] = (counts[card.rank] || 0) + 1;
    if (counts[card.rank] >= 4) return true;
  }
  return false;
}

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

    // Internal player state (separate from Room's Player objects)
    this.players = players.map((p) => ({
      id: p.id,
      name: p.name,
      seatIndex: p.seatIndex,
      socketId: p.socketId,
      hand: [],
      letters: '',       // accumulates D-O-N-K-E-Y
      isSafe: false,     // safe this round (got 4-of-a-kind)
      selectedCard: null, // card selected to pass
    }));

    this.phase = 'WAITING'; // WAITING | PASSING | ROUND_RESULT | GAME_OVER
    this.roundNumber = 0;
    this.activePlayers = []; // IDs of players still passing this round
    this.safeOrder = [];     // order players completed 4-of-a-kind
    this.passTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  startGame() {
    if (this.phase !== 'WAITING') throw new Error('Game already started');
    this._startNewRound();
  }

  /**
   * Player selects a card to pass.
   */
  selectCard(playerId, card) {
    if (this.phase !== 'PASSING') return;
    if (!this.activePlayers.includes(playerId)) return;

    const player = this._getPlayer(playerId);
    if (!player) return;

    // Verify card is in hand
    const idx = player.hand.findIndex(
      (c) => c.rank === card.rank && c.suit === card.suit
    );
    if (idx === -1) return;

    player.selectedCard = card;

    // Broadcast selection status (don't reveal which card)
    const selectedCount = this.activePlayers.filter(
      (id) => this._getPlayer(id)?.selectedCard
    ).length;

    this.emit('donkey-card-selected', {
      playerId,
      selectedCount,
      totalActive: this.activePlayers.length,
    });

    // If all active players selected, execute the pass
    if (selectedCount === this.activePlayers.length) {
      this._clearPassTimer();
      // Small delay so clients see the "all selected" state
      setTimeout(() => this._executePass(), 500);
    }
  }

  /**
   * Trigger next round from round-result screen.
   */
  triggerNextRound() {
    if (this.phase !== 'ROUND_RESULT') return;
    // Check nobody has spelled DONKEY yet
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
    return {
      gameType: 'donkey',
      phase:
        this.phase === 'PASSING'
          ? 'DONKEY_PASSING'
          : this.phase === 'ROUND_RESULT'
            ? 'DONKEY_ROUND_RESULT'
            : this.phase === 'GAME_OVER'
              ? 'DONKEY_GAME_OVER'
              : 'DONKEY_WAITING',
      roundNumber: this.roundNumber,
      hand: player?.hand || [],
      activePlayers: [...this.activePlayers],
      safeOrder: [...this.safeOrder],
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        letters: p.letters,
        isSafe: p.isSafe,
        seatIndex: p.seatIndex,
        cardCount: p.hand.length,
        hasSelected: !!p.selectedCard,
      })),
    };
  }

  _clearPassTimer() {
    if (this.passTimer) {
      clearTimeout(this.passTimer);
      this.passTimer = null;
    }
  }

  removeAllListeners() {
    super.removeAllListeners();
    this._clearPassTimer();
  }

  // ---------------------------------------------------------------------------
  // Private — round management
  // ---------------------------------------------------------------------------

  _startNewRound() {
    this.roundNumber++;
    this.safeOrder = [];

    // Reset per-round state for all players
    this.players.forEach((p) => {
      p.hand = [];
      p.isSafe = false;
      p.selectedCard = null;
    });

    // All players participate every round
    this.activePlayers = this.players.map((p) => p.id);

    // Create and shuffle deck (N sets of 4 for N players)
    const deck = shuffle(createDonkeyDeck(this.numPlayers));

    // Deal 4 cards to each player
    this.players.forEach((player, idx) => {
      player.hand = deck.slice(idx * 4, (idx + 1) * 4);
    });

    // Emit hand to each player individually
    const playersInfo = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      letters: p.letters,
      isSafe: p.isSafe,
      seatIndex: p.seatIndex,
      cardCount: 4,
    }));

    this.players.forEach((player) => {
      this.emit('donkey-hand-dealt', {
        playerId: player.id,
        hand: player.hand,
        round: this.roundNumber,
        players: playersInfo,
      });
    });

    // Start passing after a brief delay for dealing animation
    setTimeout(() => this._startPassingPhase(), 1000);
  }

  _startPassingPhase() {
    this.phase = 'PASSING';

    // Reset selections for active players
    this.activePlayers.forEach((id) => {
      const p = this._getPlayer(id);
      if (p) p.selectedCard = null;
    });

    this.emit('donkey-pass-start', {
      activePlayers: [...this.activePlayers],
      timeout: PASS_TIMEOUT_MS,
    });

    // Start pass timer
    this._clearPassTimer();
    this.passTimer = setTimeout(() => {
      this._autoSelectTimeout();
    }, PASS_TIMEOUT_MS);
  }

  _autoSelectTimeout() {
    // Auto-select a random card for players who haven't chosen
    this.activePlayers.forEach((id) => {
      const player = this._getPlayer(id);
      if (player && !player.selectedCard && player.hand.length > 0) {
        const randomIdx = Math.floor(Math.random() * player.hand.length);
        player.selectedCard = player.hand[randomIdx];
      }
    });
    this._executePass();
  }

  _executePass() {
    // Sort active players by seatIndex for consistent circular order
    const sorted = this.activePlayers
      .map((id) => this._getPlayer(id))
      .filter(Boolean)
      .sort((a, b) => a.seatIndex - b.seatIndex);

    if (sorted.length < 2) {
      // Can't pass with fewer than 2 players
      this._checkCompletions();
      return;
    }

    // Collect cards to pass (each player passes to the next in sorted order)
    const cardsToPass = sorted.map((player) => {
      const card = player.selectedCard;
      // Remove from hand
      const idx = player.hand.findIndex(
        (c) => c.rank === card.rank && c.suit === card.suit
      );
      if (idx !== -1) player.hand.splice(idx, 1);
      player.selectedCard = null;
      return { fromId: player.id, card };
    });

    // Each player receives the card from the previous player (circular left pass)
    sorted.forEach((player, i) => {
      const prevIdx = (i - 1 + sorted.length) % sorted.length;
      const receivedCard = cardsToPass[prevIdx].card;
      player.hand.push(receivedCard);
    });

    // Emit updated hand to each player individually
    this.players.forEach((player) => {
      this.emit('donkey-cards-passed', {
        playerId: player.id,
        hand: player.hand,
      });
    });

    // Check for completions after a brief pause
    setTimeout(() => this._checkCompletions(), 800);
  }

  _checkCompletions() {
    const newlySafe = [];

    this.activePlayers.forEach((id) => {
      const player = this._getPlayer(id);
      if (player && !player.isSafe && hasFourOfAKind(player.hand)) {
        player.isSafe = true;
        this.safeOrder.push(id);
        newlySafe.push(id);
      }
    });

    if (newlySafe.length > 0) {
      // Remove safe players from active list
      this.activePlayers = this.activePlayers.filter(
        (id) => !this._getPlayer(id)?.isSafe
      );

      // Emit safe events
      newlySafe.forEach((id) => {
        this.emit('donkey-player-safe', {
          playerId: id,
          playerName: this._getPlayer(id)?.name,
          safeOrder: [...this.safeOrder],
          activePlayers: [...this.activePlayers],
        });
      });
    }

    // Check if round is over
    if (this.activePlayers.length <= 1) {
      let loserId;
      if (this.activePlayers.length === 1) {
        loserId = this.activePlayers[0];
      } else {
        // Everyone completed simultaneously — last in safeOrder gets letter
        loserId = this.safeOrder[this.safeOrder.length - 1];
      }
      // Small delay so clients see safe animations
      setTimeout(() => this._endRound(loserId), 1000);
    } else {
      // Continue passing
      this._startPassingPhase();
    }
  }

  _endRound(loserId) {
    this.phase = 'ROUND_RESULT';
    this._clearPassTimer();

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
    this._clearPassTimer();

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
}

export { DONKEY_WORD, PASS_TIMEOUT_MS };
