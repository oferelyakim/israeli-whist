import type { Card } from '../../../types/card';
import { Rank, Suit, STANDARD_SUITS } from '../../../types/card';
import { createRNG } from '../../../utils/random';

const RANKS: Rank[] = [
  Rank.ACE, Rank.TWO, Rank.THREE, Rank.FOUR, Rank.FIVE, Rank.SIX,
  Rank.SEVEN, Rank.EIGHT, Rank.NINE, Rank.TEN,
  Rank.JACK, Rank.QUEEN, Rank.KING,
];

/** Create a double deck (2x52) + 2 jokers = 106 cards */
export function createDoubleDeckWithJokers(): Card[] {
  const deck: Card[] = [];
  for (let copy = 0; copy < 2; copy++) {
    for (const suit of STANDARD_SUITS) {
      for (const rank of RANKS) {
        deck.push({ suit, rank });
      }
    }
  }
  deck.push({ suit: Suit.JOKER_RED, rank: Rank.JOKER });
  deck.push({ suit: Suit.JOKER_BLACK, rank: Rank.JOKER });
  return deck; // 106 cards
}

export function shuffleDeck(deck: Card[], seed: number): Card[] {
  const rng = createRNG(seed);
  const cards = [...deck];
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

/**
 * Deal Israeli Rummy: 14 cards each, no discard pile.
 * All remaining cards go to drawPile.
 */
export function dealIsraeliRummy(numPlayers: number, seed: number) {
  const deck = shuffleDeck(createDoubleDeckWithJokers(), seed);
  const cardsPerPlayer = 14;
  const players: { hand: Card[] }[] = [];
  let idx = 0;

  for (let p = 0; p < numPlayers; p++) {
    players.push({ hand: deck.slice(idx, idx + cardsPerPlayer) });
    idx += cardsPerPlayer;
  }

  const drawPile = deck.slice(idx);

  return { players, drawPile };
}
