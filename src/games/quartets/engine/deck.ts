import { createRNG } from '../../../utils/random';
import type { QuartetCard } from '../types';
import { QUARTET_COLORS, NUM_CATEGORIES } from '../types';

/**
 * Create a full Quartets deck: 12 categories × 4 colors = 48 cards.
 */
export function createQuartetsDeck(): QuartetCard[] {
  const cards: QuartetCard[] = [];
  for (let category = 0; category < NUM_CATEGORIES; category++) {
    for (const color of QUARTET_COLORS) {
      cards.push({ category, color });
    }
  }
  return cards;
}

/**
 * Fisher-Yates shuffle using seeded PRNG for deterministic results.
 */
export function shuffleQuartetsDeck(deck: QuartetCard[], seed: number): QuartetCard[] {
  const rng = createRNG(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Deal hands for a Quartets game.
 * Each player gets 4 cards; remaining cards form the draw pile.
 */
export function dealQuartetsHands(
  seed: number,
  numPlayers: number,
): { hands: QuartetCard[][]; drawPile: QuartetCard[] } {
  const deck = createQuartetsDeck();
  shuffleQuartetsDeck(deck, seed);

  const hands: QuartetCard[][] = Array.from({ length: numPlayers }, () => []);

  // Deal 4 cards per player, round-robin
  for (let cardIdx = 0; cardIdx < 4; cardIdx++) {
    for (let player = 0; player < numPlayers; player++) {
      hands[player].push(deck.pop()!);
    }
  }

  return { hands, drawPile: deck };
}
