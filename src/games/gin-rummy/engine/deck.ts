import type { Card } from '../../../types/card';
import { Rank, STANDARD_SUITS } from '../../../types/card';
import { createRNG } from '../../../utils/random';

const RANKS: Rank[] = [
  Rank.ACE, Rank.TWO, Rank.THREE, Rank.FOUR, Rank.FIVE, Rank.SIX,
  Rank.SEVEN, Rank.EIGHT, Rank.NINE, Rank.TEN,
  Rank.JACK, Rank.QUEEN, Rank.KING,
];

export function createStandardDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of STANDARD_SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
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

export function dealGinRummy(seed: number) {
  const deck = shuffleDeck(createStandardDeck(), seed);
  const hand0 = deck.slice(0, 10);
  const hand1 = deck.slice(10, 20);
  const discardPile = [deck[20]];
  const drawPile = deck.slice(21);
  return { hands: [hand0, hand1], drawPile, discardPile };
}
