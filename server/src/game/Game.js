import { EventEmitter } from 'events';
import { createDeck, shuffle, deal } from './Deck.js';
import { getPlayableCards, determineTrickWinner, isValidPlay } from './Validator.js';
import { scoreRound } from './Scorer.js';

/** Game phase constants */
const PHASES = {
  WAITING: 'WAITING',
  DEALING: 'DEALING',
  BIDDING: 'BIDDING',
  PLAYING: 'PLAYING',
  TRICK_END: 'TRICK_END',
  ROUND_END: 'ROUND_END',
  GAME_OVER: 'GAME_OVER',
};

const TOTAL_ROUNDS = 5;
const TURN_TIMEOUT_MS = 60_000;
const MIN_BID = 1;

export default class Game extends EventEmitter {
  /**
   * @param {string} roomCode - The room this game belongs to.
   * @param {Array} players - Array of Player instances (2-5 players).
   */
  constructor(roomCode, players) {
    super();

    if (players.length < 2 || players.length > 5) {
      throw new Error(`Game requires 2-5 players, got ${players.length}`);
    }

    this.roomCode = roomCode;
    this.players = players;
    this.numPlayers = players.length;
    this.tricksPerRound = Math.floor(52 / this.numPlayers);
    this.maxBid = this.tricksPerRound;
    this.phase = PHASES.WAITING;

    this.currentRound = 0;
    this.currentTrickNumber = 0;
    this.currentTrick = { cards: [], ledSuit: null };

    this.dealerIndex = 0;
    this.currentTurnIndex = 0;

    this.scoreHistory = []; // Array of round results
    this.turnTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Starts the game: shuffles, deals, and begins the first round's bidding.
   */
  startGame() {
    if (this.phase !== PHASES.WAITING) {
      throw new Error('Game has already started');
    }

    this.currentRound = 1;
    this._dealHands();
    this._startBidding();
  }

  /**
   * Places a bid for the given player.
   *
   * @param {string} playerId
   * @param {number} bid - Integer between 1 and 13.
   */
  placeBid(playerId, bid) {
    if (this.phase !== PHASES.BIDDING) {
      throw new Error('Not in bidding phase');
    }

    const currentPlayer = this.players[this.currentTurnIndex];
    if (currentPlayer.id !== playerId) {
      throw new Error('Not your turn to bid');
    }

    const bidNum = Number(bid);
    if (!Number.isInteger(bidNum) || bidNum < MIN_BID || bidNum > this.maxBid) {
      throw new Error(`Bid must be an integer between ${MIN_BID} and ${this.maxBid}`);
    }

    this._clearTurnTimer();
    currentPlayer.bid = bidNum;

    // Check if all players have bid
    const allBid = this.players.every((p) => p.bid !== null);

    // Determine next bidder before advancing turn
    let nextBidder = null;
    if (!allBid) {
      const nextIndex = (this.currentTurnIndex + 1) % this.numPlayers;
      nextBidder = this.players[nextIndex].id;
    }

    this.emit('bid-placed', {
      playerId,
      playerName: currentPlayer.name,
      bid: bidNum,
      seatIndex: currentPlayer.seatIndex,
      nextBidder,
    });

    if (allBid) {
      this._startPlaying();
    } else {
      this._advanceTurn();
      this._emitYourTurn();
      this._startTurnTimer();
    }
  }

  /**
   * Plays a card for the given player.
   *
   * @param {string} playerId
   * @param {Object} card - { suit, rank } identifying the card to play.
   */
  playCard(playerId, card) {
    if (this.phase !== PHASES.PLAYING) {
      throw new Error('Not in playing phase');
    }

    const currentPlayer = this.players[this.currentTurnIndex];
    if (currentPlayer.id !== playerId) {
      throw new Error('Not your turn to play');
    }

    // Find the actual card object in the player's hand
    const cardInHand = currentPlayer.hand.find(
      (c) => c.suit === card.suit && c.rank === card.rank
    );

    if (!cardInHand) {
      throw new Error('Card not in your hand');
    }

    // Validate legality
    if (!isValidPlay(cardInHand, currentPlayer.hand, this.currentTrick.cards, this.currentTrick.ledSuit)) {
      throw new Error('Illegal play: you must follow the led suit if possible');
    }

    this._clearTurnTimer();

    // Remove card from hand
    currentPlayer.hand = currentPlayer.hand.filter(
      (c) => !(c.suit === card.suit && c.rank === card.rank)
    );

    // Set led suit if this is the first card of the trick
    if (this.currentTrick.cards.length === 0) {
      this.currentTrick.ledSuit = cardInHand.suit;
    }

    // Add card to trick with player info
    const playedCard = {
      suit: cardInHand.suit,
      rank: cardInHand.rank,
      value: cardInHand.value,
      playerId: currentPlayer.id,
    };
    this.currentTrick.cards.push(playedCard);

    // Determine next player before advancing turn
    let nextPlayer = null;
    if (this.currentTrick.cards.length < this.numPlayers) {
      const nextIndex = (this.currentTurnIndex + 1) % this.numPlayers;
      nextPlayer = this.players[nextIndex].id;
    }

    this.emit('card-played', {
      playerId,
      playerName: currentPlayer.name,
      seatIndex: currentPlayer.seatIndex,
      card: { suit: cardInHand.suit, rank: cardInHand.rank, value: cardInHand.value },
      nextPlayer,
    });

    // Notify the player of their updated hand
    this.emit('hand-updated', {
      playerId,
      hand: currentPlayer.hand,
    });

    // Check if the trick is complete
    if (this.currentTrick.cards.length === this.numPlayers) {
      this._resolveTrick();
    } else {
      this._advanceTurn();
      this._emitYourTurn();
      this._startTurnTimer();
    }
  }

  /**
   * Returns a sanitized game state for a specific player.
   * The player sees their own hand; other players' hands are hidden (card count only).
   *
   * @param {string} playerId
   * @returns {Object}
   */
  getStateForPlayer(playerId) {
    const playerData = this.players.map((p) => {
      const base = {
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
        bid: p.bid,
        tricksWon: p.tricksWon,
        isConnected: p.isConnected,
      };

      if (p.id === playerId) {
        base.hand = p.hand;
      } else {
        base.cardCount = p.hand.length;
      }

      return base;
    });

    return {
      roomCode: this.roomCode,
      phase: this.phase,
      numPlayers: this.numPlayers,
      tricksPerRound: this.tricksPerRound,
      maxBid: this.maxBid,
      currentRound: this.currentRound,
      currentTrickNumber: this.currentTrickNumber,
      currentTrick: {
        cards: this.currentTrick.cards.map((c) => ({
          suit: c.suit,
          rank: c.rank,
          value: c.value,
          playerId: c.playerId,
        })),
        ledSuit: this.currentTrick.ledSuit,
      },
      dealerIndex: this.dealerIndex,
      currentTurnIndex: this.currentTurnIndex,
      currentTurnPlayerId: this.players[this.currentTurnIndex]?.id ?? null,
      scoreHistory: this.scoreHistory,
      players: playerData,
    };
  }

  /**
   * Manually triggers next round (can be called when a player clicks "Next Round").
   * Clears the auto-advance timer and proceeds immediately.
   */
  triggerNextRound() {
    if (this.phase !== PHASES.ROUND_END) return;
    if (this._roundTimer) {
      clearTimeout(this._roundTimer);
      this._roundTimer = null;
    }
    if (this.currentRound >= TOTAL_ROUNDS) {
      this._endGame();
    } else {
      this._nextRound();
    }
  }

  /**
   * Returns the legally playable cards for the given player.
   *
   * @param {string} playerId
   * @returns {Array} Array of playable card objects.
   */
  getPlayableCards(playerId) {
    const player = this._getPlayerById(playerId);

    if (!player) {
      return [];
    }

    return getPlayableCards(
      player.hand,
      this.currentTrick.cards,
      this.currentTrick.ledSuit
    );
  }

  // ---------------------------------------------------------------------------
  // Turn management (private)
  // ---------------------------------------------------------------------------

  /**
   * Advances the turn to the next player clockwise.
   */
  _advanceTurn() {
    this.currentTurnIndex = (this.currentTurnIndex + 1) % this.numPlayers;
  }

  /**
   * Starts a 30-second turn timer.
   * On timeout: auto-bids 1 during bidding, or auto-plays the lowest legal card during play.
   */
  _startTurnTimer() {
    this._clearTurnTimer();

    const currentPlayer = this.players[this.currentTurnIndex];
    const currentPlayerId = currentPlayer.id;

    // Broadcast timer start so clients can show countdown animation
    this.emit('turn-timer-start', {
      playerId: currentPlayerId,
      duration: TURN_TIMEOUT_MS,
    });

    this.turnTimer = setTimeout(() => {
      this.emit('turn-timeout', {
        playerId: currentPlayerId,
        playerName: currentPlayer.name,
      });

      if (this.phase === PHASES.BIDDING) {
        this.placeBid(currentPlayerId, MIN_BID);
      } else if (this.phase === PHASES.PLAYING) {
        const playable = this.getPlayableCards(currentPlayerId);

        if (playable.length > 0) {
          // Auto-play the lowest value legal card
          const lowestCard = playable.reduce((lowest, card) =>
            card.value < lowest.value ? card : lowest
          );
          this.playCard(currentPlayerId, lowestCard);
        }
      }
    }, TURN_TIMEOUT_MS);
  }

  /**
   * Clears the current turn timer if active.
   */
  _clearTurnTimer() {
    if (this.turnTimer) {
      clearTimeout(this.turnTimer);
      this.turnTimer = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Phase transitions (private)
  // ---------------------------------------------------------------------------

  /**
   * Shuffles, deals, and emits hands to each player.
   */
  _dealHands() {
    this.phase = PHASES.DEALING;

    const deck = shuffle(createDeck());
    const hands = deal(deck, this.numPlayers);

    this.players.forEach((player, index) => {
      player.reset();
      player.hand = hands[index];

      this.emit('hand-dealt', {
        playerId: player.id,
        hand: player.hand,
        round: this.currentRound,
      });
    });
  }

  /**
   * Transitions to the bidding phase.
   * The first bidder is the player to the left of the dealer.
   */
  _startBidding() {
    this.phase = PHASES.BIDDING;
    this.currentTurnIndex = (this.dealerIndex + 1) % this.numPlayers;

    this.emit('bidding-start', {
      round: this.currentRound,
      dealerIndex: this.dealerIndex,
      dealerId: this.players[this.dealerIndex].id,
      currentBidder: this.players[this.currentTurnIndex].id,
      firstBidderIndex: this.currentTurnIndex,
      firstBidderId: this.players[this.currentTurnIndex].id,
    });

    this._emitYourTurn();
    this._startTurnTimer();
  }

  /**
   * Transitions to the playing phase after all bids are in.
   */
  _startPlaying() {
    this.phase = PHASES.PLAYING;
    this.currentTrickNumber = 1;
    this.currentTrick = { cards: [], ledSuit: null };

    // First player to lead is left of dealer
    this.currentTurnIndex = (this.dealerIndex + 1) % this.numPlayers;

    const bidsMap = {};
    this.players.forEach((p) => { bidsMap[p.id] = p.bid; });

    this.emit('bidding-complete', {
      bids: bidsMap,
      bidsDetail: this.players.map((p) => ({
        playerId: p.id,
        playerName: p.name,
        seatIndex: p.seatIndex,
        bid: p.bid,
      })),
    });

    this._emitYourTurn();
    this._startTurnTimer();
  }

  /**
   * Resolves a completed trick: determines winner, updates state, advances.
   */
  _resolveTrick() {
    this._clearTurnTimer();
    this.phase = PHASES.TRICK_END;

    const winnerId = determineTrickWinner(
      this.currentTrick.cards,
      this.currentTrick.ledSuit
    );

    const winner = this._getPlayerById(winnerId);
    winner.tricksWon += 1;

    const tricksWonMap = {};
    this.players.forEach((p) => { tricksWonMap[p.id] = p.tricksWon; });

    this.emit('trick-result', {
      trickNumber: this.currentTrickNumber,
      cards: this.currentTrick.cards,
      ledSuit: this.currentTrick.ledSuit,
      winner: winnerId,
      winnerId,
      winnerName: winner.name,
      winnerSeatIndex: winner.seatIndex,
      winnerTricksWon: winner.tricksWon,
      tricksWon: tricksWonMap,
    });

    // Delay before proceeding to allow clients to see trick result
    setTimeout(() => {
      if (this.currentTrickNumber >= this.tricksPerRound) {
        this._endRound();
      } else {
        this._nextTrick(winnerId);
      }
    }, 1500);
  }

  /**
   * Clears the trick and starts the next one.
   * The trick winner leads the next trick.
   *
   * @param {string} winnerId - The player who won the last trick.
   */
  _nextTrick(winnerId) {
    const winnerIndex = this.players.findIndex((p) => p.id === winnerId);
    this.currentTurnIndex = winnerIndex;
    this.currentTrickNumber += 1;
    this.currentTrick = { cards: [], ledSuit: null };
    this.phase = PHASES.PLAYING;

    this.emit('trick-cleared', {
      nextTrickNumber: this.currentTrickNumber,
      leadPlayerId: winnerId,
    });

    this._emitYourTurn();
    this._startTurnTimer();
  }

  /**
   * Scores the current round and records results.
   */
  _endRound() {
    this._clearTurnTimer();
    this.phase = PHASES.ROUND_END;

    const roundInput = this.players.map((p) => ({
      id: p.id,
      bid: p.bid,
      tricksWon: p.tricksWon,
    }));

    const roundScores = scoreRound(roundInput);

    const roundResult = {
      round: this.currentRound,
      scores: roundScores.map((s) => {
        const player = this._getPlayerById(s.playerId);
        return {
          playerId: s.playerId,
          playerName: player.name,
          seatIndex: player.seatIndex,
          bid: player.bid,
          tricksWon: player.tricksWon,
          roundScore: s.roundScore,
        };
      }),
    };

    this.scoreHistory.push(roundResult);

    const totalScoresArr = this._computeTotalScores();
    const totalScoresMap = {};
    totalScoresArr.forEach((s) => { totalScoresMap[s.playerId] = s.totalScore; });

    this.emit('round-end', {
      round: this.currentRound,
      roundResult,
      scores: this.scoreHistory,
      totalScores: totalScoresMap,
    });

    // Check if game is over
    if (this.currentRound >= TOTAL_ROUNDS) {
      // Small delay to let clients show round scores before game over
      setTimeout(() => this._endGame(), 2000);
    } else {
      // Delay next round so clients can show round score modal
      this._roundTimer = setTimeout(() => this._nextRound(), 8000);
    }
  }

  /**
   * Starts the next round: rotates dealer, deals new hands, begins bidding.
   */
  _nextRound() {
    this.currentRound += 1;
    this.dealerIndex = (this.dealerIndex + 1) % this.numPlayers;
    this.currentTrickNumber = 0;
    this.currentTrick = { cards: [], ledSuit: null };

    this._dealHands();
    this._startBidding();
  }

  /**
   * Ends the game: computes final rankings and emits the result.
   */
  _endGame() {
    this._clearTurnTimer();
    this.phase = PHASES.GAME_OVER;

    const totalScores = this._computeTotalScores();

    // Sort by total score descending for rankings
    const rankings = [...totalScores].sort((a, b) => b.totalScore - a.totalScore);
    rankings.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    const totalScoresMap = {};
    totalScores.forEach((s) => { totalScoresMap[s.playerId] = s.totalScore; });

    this.emit('game-over', {
      rankings,
      scores: this.scoreHistory,
      totalScores: totalScoresMap,
      scoreHistory: this.scoreHistory,
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers (private)
  // ---------------------------------------------------------------------------

  /**
   * Finds a player by their ID.
   * @param {string} playerId
   * @returns {Player|undefined}
   */
  _getPlayerById(playerId) {
    return this.players.find((p) => p.id === playerId);
  }

  /**
   * Emits a 'your-turn' event to the current player with their playable cards.
   */
  _emitYourTurn() {
    const currentPlayer = this.players[this.currentTurnIndex];

    const eventData = {
      playerId: currentPlayer.id,
      playerName: currentPlayer.name,
      seatIndex: currentPlayer.seatIndex,
      phase: this.phase,
    };

    if (this.phase === PHASES.PLAYING) {
      eventData.playableCards = this.getPlayableCards(currentPlayer.id);
    }

    this.emit('your-turn', eventData);
  }

  /**
   * Computes cumulative total scores across all completed rounds.
   * @returns {Array} Array of { playerId, playerName, seatIndex, totalScore }.
   */
  _computeTotalScores() {
    return this.players.map((p) => {
      const totalScore = this.scoreHistory.reduce((sum, round) => {
        const playerRound = round.scores.find((s) => s.playerId === p.id);
        return sum + (playerRound ? playerRound.roundScore : 0);
      }, 0);

      return {
        playerId: p.id,
        playerName: p.name,
        seatIndex: p.seatIndex,
        totalScore: Math.round(totalScore * 10) / 10, // Avoid floating point drift
      };
    });
  }
}

export { PHASES, TOTAL_ROUNDS, TURN_TIMEOUT_MS };
