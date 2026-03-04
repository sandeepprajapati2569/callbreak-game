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
 * Deals a shuffled deck into 4 hands of 13 cards each.
 * Returns an array of 4 arrays, each containing 13 card objects.
 */
export function deal(deck) {
  if (deck.length !== 52) {
    throw new Error(`Cannot deal: deck has ${deck.length} cards, expected 52`);
  }

  const hands = [[], [], [], []];

  for (let i = 0; i < deck.length; i++) {
    hands[i % 4].push(deck[i]);
  }

  return hands;
}

export { SUITS, RANKS, RANK_VALUES };
