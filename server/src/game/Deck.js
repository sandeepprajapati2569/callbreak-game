const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const RANK_VALUES = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 11,
  'Q': 12,
  'K': 13,
  'A': 14,
};

/**
 * Creates a standard 52-card deck.
 * Each card is an object with suit, rank, and numeric value.
 */
export function createDeck() {
  const deck = [];

  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        suit,
        rank,
        value: RANK_VALUES[rank],
      });
    }
  }

  return deck;
}

/**
 * Shuffles a deck in place using the Fisher-Yates algorithm.
 * Returns the shuffled deck for convenience.
 */
export function shuffle(deck) {
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }

  return deck;
}

/**
 * Deals a shuffled deck into hands for the given number of players.
 * Extra cards (if 52 doesn't divide evenly) are discarded.
 * @param {Array} deck - 52-card deck.
 * @param {number} numPlayers - Number of players (2-5), default 4.
 * @returns {Array} Array of numPlayers arrays, each containing cards.
 */
export function deal(deck, numPlayers = 4) {
  if (deck.length !== 52) {
    throw new Error(`Cannot deal: deck has ${deck.length} cards, expected 52`);
  }
  if (numPlayers < 2 || numPlayers > 5) {
    throw new Error(`numPlayers must be between 2 and 5, got ${numPlayers}`);
  }

  const cardsPerPlayer = Math.floor(52 / numPlayers);
  const totalCards = cardsPerPlayer * numPlayers;
  const hands = Array.from({ length: numPlayers }, () => []);

  for (let i = 0; i < totalCards; i++) {
    hands[i % numPlayers].push(deck[i]);
  }

  return hands;
}

export { SUITS, RANKS, RANK_VALUES };
