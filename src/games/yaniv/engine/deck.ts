import type { Card } from '../../../types/card';
import { Suit, Rank, STANDARD_SUITS, RANKS } from '../../../types/card';
import { createRNG } from '../../../utils/random';
import type { DiscardGroup } from '../types';

/**
 * Create a Yaniv deck: 52 standard cards + 2 jokers = 54 cards.
 * If doubleDeck is true, creates 108 cards (two full 54-card decks).
 */
export function createYanivDeck(doubleDeck: boolean): Card[] {
  const cards: Card[] = [];
  const copies = doubleDeck ? 2 : 1;

  for (let c = 0; c < copies; c++) {
    // Standard 52 cards
    for (const suit of STANDARD_SUITS) {
      for (const rank of RANKS) {
        cards.push({ suit, rank });
      }
    }
    // 2 jokers
    cards.push({ suit: Suit.JOKER_RED, rank: Rank.JOKER });
    cards.push({ suit: Suit.JOKER_BLACK, rank: Rank.JOKER });
  }

  return cards;
}

/**
 * Fisher-Yates shuffle using a seeded PRNG for deterministic results.
 * Mutates the deck in place and returns it.
 */
export function shuffleYanivDeck(deck: Card[], seed: number): Card[] {
  const rng = createRNG(seed);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * Deal hands for a Yaniv round.
 * Returns the dealt hands, the remaining draw pile, and the first discard card.
 */
export function dealYanivHands(
  seed: number,
  numPlayers: number,
  handSize: number,
  doubleDeck: boolean,
): {
  hands: Card[][];
  drawPile: Card[];
  firstDiscard: DiscardGroup;
} {
  const deck = createYanivDeck(doubleDeck);
  shuffleYanivDeck(deck, seed);

  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);

  // Deal cards one at a time in round-robin fashion
  for (let cardIdx = 0; cardIdx < handSize; cardIdx++) {
    for (let player = 0; player < numPlayers; player++) {
      const card = deck.pop()!;
      hands[player].push(card);
    }
  }

  // Flip top card as first discard
  const firstDiscardCard = deck.pop()!;
  const firstDiscard: DiscardGroup = {
    cards: [firstDiscardCard],
    type: 'single',
  };

  return {
    hands,
    drawPile: deck, // remaining cards
    firstDiscard,
  };
}
