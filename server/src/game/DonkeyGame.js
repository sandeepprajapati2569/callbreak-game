import { EventEmitter } from 'events';
import { createDeck, shuffle, deal } from './Deck.js';

const TURN_TIMEOUT_MS = 20_000;

const SUIT_ORDER = {
  spades: 0,
  hearts: 1,
  diamonds: 2,
  clubs: 3,
};

function sameCard(a, b) {
  if (!a || !b) return false;
  return a.suit === b.suit && a.rank === b.rank;
}

function sortHandBySuitAndRank(hand) {
  hand.sort((a, b) => {
    const suitDiff = (SUIT_ORDER[a.suit] ?? 99) - (SUIT_ORDER[b.suit] ?? 99);
    if (suitDiff !== 0) return suitDiff;
    return (a.value || 0) - (b.value || 0);
  });
}

/**
 * Gadha Ladan (Indian trick-taking variant)
 *
 * - Standard deck is dealt among players.
 * - On each trick, players must follow lead suit if possible.
 * - Highest card of lead suit determines trick leader.
 * - If any off-suit card is played ("hit"), the highest lead-suit player collects
 *   all trick cards and starts next trick.
 * - Game ends when one (or fewer) players still hold cards; remaining player is donkey.
 */
export default class DonkeyGame extends EventEmitter {
  constructor(roomCode, players) {
    super();

    if (players.length < 2 || players.length > 5) {
      throw new Error(`Donkey requires 2-5 players, got ${players.length}`);
    }

    this.roomCode = roomCode;
    this.numPlayers = players.length;

    this.players = [...players]
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((p) => ({
        id: p.id,
        name: p.name,
        seatIndex: p.seatIndex,
        socketId: p.socketId,
        hand: [],
        letters: '', // kept for compatibility with older payloads/UI
        isActive: true,
      }));

    this.phase = 'WAITING'; // WAITING | PLAYING | GAME_OVER
    this.roundNumber = 0; // one full match per round
    this.trickNumber = 0;

    this.currentTurnIndex = -1;
    this.activePlayers = [];
    this.trickOrder = [];
    this.trickStarterId = null;
    this.trickCards = [];
    this.leadSuit = null;
    this.lastCollectorId = null;
    this.turnTimer = null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  startGame() {
    if (this.phase !== 'WAITING') throw new Error('Game already started');
    this._startNewRound();
  }

  triggerNextRound() {
    if (this.phase !== 'GAME_OVER') return;
    this._startNewRound();
  }

  /**
   * Legacy helper for old clients (index-based play payload).
   */
  getCardByIndex(playerId, cardIndex) {
    const player = this._getPlayer(playerId);
    if (!player || cardIndex < 0 || cardIndex >= player.hand.length) return null;
    return player.hand[cardIndex];
  }

  /**
   * Returns playable cards for a player under follow-suit rule.
   */
  getPlayableCards(playerId) {
    const player = this._getPlayer(playerId);
    if (!player || player.hand.length === 0) return [];

    if (!this.leadSuit) return [...player.hand];

    const hasLeadSuit = player.hand.some((c) => c.suit === this.leadSuit);
    if (!hasLeadSuit) return [...player.hand];
    return player.hand.filter((c) => c.suit === this.leadSuit);
  }

  /**
   * Player plays one card from hand.
   * @param {string} playerId
   * @param {{suit:string,rank:string,value:number}} card
   */
  playCard(playerId, card) {
    if (this.phase !== 'PLAYING') return;

    const current = this.players[this.currentTurnIndex];
    if (!current || current.id !== playerId) return;
    if (!current.isActive || current.hand.length === 0) return;

    const playable = this.getPlayableCards(playerId);
    if (!playable.some((c) => sameCard(c, card))) return;

    const handIdx = current.hand.findIndex((c) => sameCard(c, card));
    if (handIdx === -1) return;

    this._clearTurnTimer();

    const playedCard = current.hand.splice(handIdx, 1)[0];
    if (!this.leadSuit) this.leadSuit = playedCard.suit;

    this.trickCards.push({
      playerId: current.id,
      playerName: current.name,
      seatIndex: current.seatIndex,
      card: playedCard,
    });

    this.emit('donkey-card-played', {
      playerId: current.id,
      playerName: current.name,
      card: playedCard,
      leadSuit: this.leadSuit,
      trickSize: this.trickCards.length,
      trickExpected: this.trickOrder.length,
      remainingCards: current.hand.length,
    });

    this.emit('donkey-hand-updated', {
      playerId: current.id,
      hand: current.hand,
    });

    this._broadcastPlayerInfo();

    if (this.trickCards.length >= this.trickOrder.length) {
      setTimeout(() => this._resolveTrick(), 650);
      return;
    }

    this._advanceTurnWithinTrick();
    this._emitTurnStart();
    this._startTurnTimer();
  }

  getStateForPlayer(playerId) {
    const player = this._getPlayer(playerId);
    const currentTurnPlayer = this.currentTurnIndex >= 0
      ? this.players[this.currentTurnIndex]
      : null;

    return {
      gameType: 'donkey',
      phase:
        this.phase === 'PLAYING'
          ? 'DONKEY_PLAYING'
          : this.phase === 'GAME_OVER'
            ? 'DONKEY_GAME_OVER'
            : 'DONKEY_WAITING',
      roundNumber: this.roundNumber,
      trickNumber: this.trickNumber,
      leadSuit: this.leadSuit,
      trickCards: this.trickCards.map((c) => ({
        playerId: c.playerId,
        playerName: c.playerName,
        seatIndex: c.seatIndex,
        card: c.card,
      })),
      myHand: player?.hand || [],
      currentTurnPlayerId: currentTurnPlayer?.id || null,
      isMyTurn: currentTurnPlayer?.id === playerId,
      playableCards: currentTurnPlayer?.id === playerId
        ? this.getPlayableCards(playerId)
        : [],
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
      donkeyTrickNumber: this.trickNumber,
      donkeyLeadSuit: this.leadSuit,
      donkeyTrickCards: this.trickCards.map((c) => ({
        playerId: c.playerId,
        playerName: c.playerName,
        seatIndex: c.seatIndex,
        card: c.card,
      })),
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
  // Round and trick flow
  // ---------------------------------------------------------------------------

  _startNewRound() {
    this.roundNumber++;
    this.trickNumber = 0;
    this.phase = 'WAITING';
    this._clearTurnTimer();

    this.currentTurnIndex = -1;
    this.trickOrder = [];
    this.trickStarterId = null;
    this.trickCards = [];
    this.leadSuit = null;
    this.lastCollectorId = null;

    this.players.forEach((p) => {
      p.hand = [];
      p.isActive = true;
    });

    const deck = shuffle(createDeck());
    const hands = deal(deck, this.numPlayers);
    this.players.forEach((player, idx) => {
      player.hand = hands[idx] || [];
      sortHandBySuitAndRank(player.hand);
    });

    this._refreshActivePlayers(false);

    const playersInfo = this.players.map((p) => ({
      id: p.id,
      name: p.name,
      letters: p.letters,
      isActive: p.isActive,
      seatIndex: p.seatIndex,
      cardCount: p.hand.length,
    }));

    this.players.forEach((player) => {
      this.emit('donkey-hand-dealt', {
        playerId: player.id,
        hand: player.hand,
        round: this.roundNumber,
        players: playersInfo,
      });
    });

    this._broadcastPlayerInfo();

    setTimeout(() => {
      if (this.phase !== 'WAITING') return;
      const starterId = this._findOpeningStarterId();
      this.trickNumber = 1;
      this.phase = 'PLAYING';
      this._startTrick(starterId);
    }, 900);
  }

  _startTrick(starterId) {
    this._refreshActivePlayers(true);
    if (this.activePlayers.length <= 1) {
      this._endGame(this._resolveLoserAfterTrick(starterId));
      return;
    }

    this.trickCards = [];
    this.leadSuit = null;

    this.trickOrder = this._getActivePlayerIdsClockwiseFrom(starterId);
    if (this.trickOrder.length === 0) {
      this._endGame(this._resolveLoserAfterTrick(starterId));
      return;
    }

    this.trickStarterId = this.trickOrder[0];
    this.currentTurnIndex = this.players.findIndex((p) => p.id === this.trickStarterId);

    const starter = this._getPlayer(this.trickStarterId);
    this.emit('donkey-trick-cleared', {
      trickNumber: this.trickNumber,
      nextPlayerId: this.trickStarterId,
      nextPlayerName: starter?.name,
      leadSuit: null,
    });

    this._emitTurnStart();
    this._startTurnTimer();
  }

  _resolveTrick() {
    if (this.phase !== 'PLAYING' || this.trickCards.length === 0) return;
    this._clearTurnTimer();

    const leadSuit = this.leadSuit;
    const leadCards = this.trickCards.filter((entry) => entry.card.suit === leadSuit);
    const comparableCards = leadCards.length > 0 ? leadCards : this.trickCards;

    let highestLead = comparableCards[0];
    for (let i = 1; i < comparableCards.length; i++) {
      if ((comparableCards[i].card.value || 0) > (highestLead.card.value || 0)) {
        highestLead = comparableCards[i];
      }
    }

    const wasHit = this.trickCards.some((entry) => entry.card.suit !== leadSuit);
    const collectorId = highestLead.playerId;
    const collector = this._getPlayer(collectorId);

    if (wasHit && collector) {
      collector.hand.push(...this.trickCards.map((entry) => entry.card));
      sortHandBySuitAndRank(collector.hand);
      this.lastCollectorId = collectorId;
      this.emit('donkey-hand-updated', {
        playerId: collector.id,
        hand: collector.hand,
      });
    }

    this._refreshActivePlayers(true);
    this._broadcastPlayerInfo();

    this.emit('donkey-trick-result', {
      trickNumber: this.trickNumber,
      leadSuit,
      wasHit,
      highestPlayerId: highestLead.playerId,
      highestPlayerName: highestLead.playerName,
      highestCard: highestLead.card,
      collectorId: wasHit ? collectorId : null,
      collectorName: wasHit ? collector?.name : null,
      collectedCount: wasHit ? this.trickCards.length : 0,
      cards: this.trickCards.map((entry) => ({
        playerId: entry.playerId,
        playerName: entry.playerName,
        seatIndex: entry.seatIndex,
        card: entry.card,
      })),
      nextStarterId: collectorId,
    });

    if (this.activePlayers.length <= 1) {
      setTimeout(() => this._endGame(this._resolveLoserAfterTrick(collectorId)), 900);
      return;
    }

    this.trickNumber++;
    setTimeout(() => {
      if (this.phase !== 'PLAYING') return;
      this._startTrick(collectorId);
    }, 1200);
  }

  _emitTurnStart() {
    const current = this.players[this.currentTurnIndex];
    if (!current) return;

    const playableCards = this.getPlayableCards(current.id);

    this.emit('donkey-your-turn', {
      playerId: current.id,
      playerName: current.name,
      seatIndex: current.seatIndex,
      leadSuit: this.leadSuit,
      trickNumber: this.trickNumber,
      playableCards,
    });

    this.emit('donkey-turn-changed', {
      playerId: current.id,
      playerName: current.name,
      seatIndex: current.seatIndex,
      leadSuit: this.leadSuit,
      trickNumber: this.trickNumber,
    });
  }

  _advanceTurnWithinTrick() {
    if (this.trickOrder.length <= 1) return;

    const currentId = this.players[this.currentTurnIndex]?.id;
    if (!currentId) return;

    const alreadyPlayed = new Set(this.trickCards.map((c) => c.playerId));
    const idx = this.trickOrder.indexOf(currentId);
    if (idx === -1) return;

    for (let offset = 1; offset <= this.trickOrder.length; offset++) {
      const nextId = this.trickOrder[(idx + offset) % this.trickOrder.length];
      if (!alreadyPlayed.has(nextId)) {
        this.currentTurnIndex = this.players.findIndex((p) => p.id === nextId);
        return;
      }
    }
  }

  _startTurnTimer() {
    this._clearTurnTimer();

    const current = this.players[this.currentTurnIndex];
    if (!current) return;

    this.emit('donkey-turn-timer-start', {
      playerId: current.id,
      duration: TURN_TIMEOUT_MS,
    });

    const currentTurnPlayerId = current.id;
    this.turnTimer = setTimeout(() => {
      if (this.phase !== 'PLAYING') return;
      const stillCurrent = this.players[this.currentTurnIndex];
      if (!stillCurrent || stillCurrent.id !== currentTurnPlayerId) return;

      const playable = this.getPlayableCards(currentTurnPlayerId);
      if (playable.length === 0) return;
      const randomCard = playable[Math.floor(Math.random() * playable.length)];
      this.playCard(currentTurnPlayerId, randomCard);
    }, TURN_TIMEOUT_MS);
  }

  _clearTurnTimer() {
    if (!this.turnTimer) return;
    clearTimeout(this.turnTimer);
    this.turnTimer = null;
  }

  _refreshActivePlayers(emitSafeEvents) {
    const nextActive = [];
    this.players.forEach((player) => {
      const wasActive = player.isActive;
      const nowActive = player.hand.length > 0;
      player.isActive = nowActive;

      if (nowActive) {
        nextActive.push(player.id);
      } else if (emitSafeEvents && wasActive) {
        this.emit('donkey-player-safe', {
          playerId: player.id,
          playerName: player.name,
        });
      }
    });
    this.activePlayers = nextActive;
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
      activePlayers: [...this.activePlayers],
    });
  }

  _findOpeningStarterId() {
    const aceOwner = this.players.find((player) =>
      player.hand.some((card) => card.suit === 'spades' && card.rank === 'A')
    );
    if (aceOwner?.id) return aceOwner.id;

    if (this.lastCollectorId && this.activePlayers.includes(this.lastCollectorId)) {
      return this.lastCollectorId;
    }

    return this._getActivePlayersSorted()[0]?.id || this.players[0]?.id || null;
  }

  _resolveLoserAfterTrick(primaryFallbackId = null) {
    if (this.activePlayers.length === 1) return this.activePlayers[0];

    let maxCards = -1;
    let candidates = [];
    for (const player of this.players) {
      const cardCount = player.hand.length;
      if (cardCount > maxCards) {
        maxCards = cardCount;
        candidates = [player];
      } else if (cardCount === maxCards) {
        candidates.push(player);
      }
    }

    if (maxCards > 0 && candidates.length > 0) {
      candidates.sort((a, b) => a.seatIndex - b.seatIndex);
      return candidates[0].id;
    }

    if (primaryFallbackId) return primaryFallbackId;
    if (this.lastCollectorId) return this.lastCollectorId;
    return this.players[0]?.id || null;
  }

  _endGame(donkeyPlayerId) {
    this.phase = 'GAME_OVER';
    this._clearTurnTimer();

    const resolvedDonkeyId = donkeyPlayerId || this._resolveLoserAfterTrick();
    const donkeyPlayer = this._getPlayer(resolvedDonkeyId);

    this.emit('donkey-game-over', {
      donkeyPlayerId: resolvedDonkeyId,
      donkeyPlayerName: donkeyPlayer?.name,
      round: this.roundNumber,
      trickNumber: this.trickNumber,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        letters: p.letters,
        seatIndex: p.seatIndex,
        cardCount: p.hand.length,
      })),
    });
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  _getPlayer(id) {
    return this.players.find((p) => p.id === id);
  }

  _getActivePlayersSorted() {
    return this.players
      .filter((p) => p.isActive)
      .sort((a, b) => a.seatIndex - b.seatIndex);
  }

  _getActivePlayerIdsClockwiseFrom(startPlayerId) {
    const active = this._getActivePlayersSorted();
    if (active.length === 0) return [];

    const startIdx = active.findIndex((p) => p.id === startPlayerId);
    const first = startIdx >= 0 ? startIdx : 0;

    const order = [];
    for (let i = 0; i < active.length; i++) {
      order.push(active[(first + i) % active.length].id);
    }
    return order;
  }
}

export { TURN_TIMEOUT_MS };
