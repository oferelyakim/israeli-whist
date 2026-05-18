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

export function dealRummy(numPlayers: number, seed: number) {
  const deck = shuffleDeck(createStandardDeck(), seed);
  const cardsPerPlayer = 7;
  const players: { hand: Card[] }[] = [];
  let idx = 0;

  for (let p = 0; p < numPlayers; p++) {
    players.push({ hand: deck.slice(idx, idx + cardsPerPlayer) });
    idx += cardsPerPlayer;
  }

  // First card of remaining goes to discard pile
  const discardPile = [deck[idx]];
  idx++;
  const drawPile = deck.slice(idx);

  return { players, drawPile, discardPile };
}
