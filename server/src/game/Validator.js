const TRUMP_SUIT = 'spades';

/**
 * Determines which cards from a player's hand are legally playable.
 *
 * Rules:
 * - If leading the trick (no cards played yet), any card is playable.
 * - If not leading, must follow the led suit if possible.
 * - If unable to follow suit, any card is playable.
 *
 * @param {Array} hand - The player's current hand of cards.
 * @param {Array} trickCards - Cards already played in the current trick.
 * @param {string|null} ledSuit - The suit of the first card played in this trick.
 * @returns {Array} Array of playable card objects from the hand.
 */
export function getPlayableCards(hand, trickCards, ledSuit) {
  if (!hand || hand.length === 0) {
    return [];
  }

  // Leading the trick: any card is playable
  if (!trickCards || trickCards.length === 0 || !ledSuit) {
    return [...hand];
  }

  // Must follow led suit if possible
  const suitCards = hand.filter((card) => card.suit === ledSuit);

  if (suitCards.length > 0) {
    return suitCards;
  }

  // Cannot follow suit: any card is playable
  return [...hand];
}

/**
 * Determines the winner of a completed trick.
 *
 * Rules:
 * - Trump suit (spades) beats all other suits.
 * - If any trumps were played, the highest trump wins.
 * - Otherwise, the highest card of the led suit wins.
 *
 * @param {Array} trickCards - Array of { suit, rank, value, playerId } objects.
 * @param {string} ledSuit - The suit that was led for this trick.
 * @returns {string} The playerId of the winning card's player.
 */
export function determineTrickWinner(trickCards, ledSuit) {
  if (!trickCards || trickCards.length === 0) {
    throw new Error('Cannot determine winner: no cards in trick');
  }

  const trumpCards = trickCards.filter((card) => card.suit === TRUMP_SUIT);

  if (trumpCards.length > 0) {
    // Highest trump wins
    const winner = trumpCards.reduce((highest, card) =>
      card.value > highest.value ? card : highest
    );
    return winner.playerId;
  }

  // No trumps played: highest of led suit wins
  const ledSuitCards = trickCards.filter((card) => card.suit === ledSuit);

  if (ledSuitCards.length === 0) {
    throw new Error('No cards of the led suit found in trick');
  }

  const winner = ledSuitCards.reduce((highest, card) =>
    card.value > highest.value ? card : highest
  );

  return winner.playerId;
}

/**
 * Validates whether playing a specific card is legal.
 *
 * @param {Object} card - The card the player wants to play: { suit, rank, value }.
 * @param {Array} hand - The player's current hand.
 * @param {Array} trickCards - Cards already played in the current trick.
 * @param {string|null} ledSuit - The suit of the first card played in this trick.
 * @returns {boolean} True if the play is legal.
 */
export function isValidPlay(card, hand, trickCards, ledSuit) {
  if (!card || !hand) {
    return false;
  }

  // Check that the card is actually in the player's hand
  const cardInHand = hand.some(
    (handCard) => handCard.suit === card.suit && handCard.rank === card.rank
  );

  if (!cardInHand) {
    return false;
  }

  // Check that the card is among the legally playable cards
  const playable = getPlayableCards(hand, trickCards, ledSuit);

  return playable.some(
    (playableCard) =>
      playableCard.suit === card.suit && playableCard.rank === card.rank
  );
}

export { TRUMP_SUIT };
