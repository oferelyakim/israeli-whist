import type { Card } from '../../../types/card';
import { STANDARD_SUITS, RANKS } from '../../../types/card';
import { createRNG } from '../../../utils/random';
import type { TableauColumn } from '../types';

/** Standard 52-card deck (joker is kept separate, always available on the side). */
export function createSolitaireDeck(): Card[] {
  const cards: Card[] = [];
  for (const suit of STANDARD_SUITS) {
    for (const rank of RANKS) {
      cards.push({ suit, rank });
    }
  }
  return cards;
}

export function shuffleSolitaireDeck(deck: Card[], seed: number): Card[] {
  const rng = createRNG(seed);
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Deal Klondike tableau: 7 columns (col i gets i faceDown + 1 faceUp).
 * 28 cards dealt, 24 remain in stock (52-card deck).
 */
export function dealSolitaire(seed: number): {
  tableau: TableauColumn[];
  stock: Card[];
} {
  const deck = shuffleSolitaireDeck(createSolitaireDeck(), seed);
  const tableau: TableauColumn[] = [];
  let cursor = 0;

  for (let i = 0; i < 7; i++) {
    const faceDown = deck.slice(cursor, cursor + i);
    cursor += i;
    const faceUp = [deck[cursor]];
    cursor += 1;
    tableau.push({ faceDown, faceUp });
  }

  const stock = deck.slice(cursor);
  return { tableau, stock };
}
