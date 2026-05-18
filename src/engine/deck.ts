import type { Card, StandardSuit } from '../types/card';
import { Suit, SUITS, RANKS } from '../types/card';
import { createRNG } from '../utils/random';

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

export function shuffleDeck(deck: Card[], seed: number): Card[] {
  const rng = createRNG(seed);
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function dealHands(seed: number): Card[][] {
  const deck = shuffleDeck(createDeck(), seed);
  const hands: Card[][] = [[], [], [], []];
  for (let i = 0; i < 52; i++) {
    hands[i % 4].push(deck[i]);
  }
  // Sort each hand by suit then rank for display
  for (const hand of hands) {
    sortHand(hand);
  }
  return hands;
}

export function sortHand(hand: Card[]): void {
  // Alternating black-red: Spades(black), Hearts(red), Clubs(black), Diamonds(red)
  const suitOrder: Record<StandardSuit, number> = { [Suit.SPADES]: 0, [Suit.HEARTS]: 1, [Suit.CLUBS]: 2, [Suit.DIAMONDS]: 3 };
  hand.sort((a, b) => {
    const suitDiff = suitOrder[a.suit as StandardSuit] - suitOrder[b.suit as StandardSuit];
    if (suitDiff !== 0) return suitDiff;
    return b.rank - a.rank; // High to low within suit
  });
}
