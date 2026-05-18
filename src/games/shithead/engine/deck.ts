import type { Card } from '../../../types/card';
import { STANDARD_SUITS, RANKS } from '../../../types/card';
import { createRNG } from '../../../utils/random';

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

export function dealShithead(numPlayers: number, seed: number) {
  const deck = shuffleDeck(createStandardDeck(), seed);
  const players: { faceDown: Card[]; faceUp: Card[]; hand: Card[] }[] = [];
  let idx = 0;

  for (let p = 0; p < numPlayers; p++) {
    const faceDown = deck.slice(idx, idx + 3); idx += 3;
    const faceUp = deck.slice(idx, idx + 3); idx += 3;
    const hand = deck.slice(idx, idx + 3); idx += 3;
    players.push({ faceDown, faceUp, hand });
  }

  const drawPile = deck.slice(idx);
  return { players, drawPile };
}
