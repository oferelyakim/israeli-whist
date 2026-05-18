import type { Card, CardKey } from '../types/card';
import { parseCardKey, cardEquals } from '../types/card';
import type { PlayerSeat } from '../types/game';
import { prevSeat } from '../types/game';
import { sortHand } from './deck';

export const EXCHANGE_CARD_COUNT = 3;

export function validateDiscards(
  hand: Card[],
  discardKeys: CardKey[]
): string | null {
  if (discardKeys.length !== EXCHANGE_CARD_COUNT) {
    return `Must discard exactly ${EXCHANGE_CARD_COUNT} cards`;
  }
  // Check all cards are in hand
  for (const key of discardKeys) {
    const card = parseCardKey(key);
    if (!hand.some((c) => cardEquals(c, card))) {
      return `Card ${key} is not in your hand`;
    }
  }
  // Check no duplicates
  if (new Set(discardKeys).size !== discardKeys.length) {
    return 'Cannot discard duplicate cards';
  }
  return null;
}

export function performExchange(
  hands: Card[][],
  discards: (CardKey[] | null)[]
): Card[][] {
  // Each player passes their discards to the player on their RIGHT
  // Right of seat 0 is seat 3, right of seat 1 is seat 0, etc.
  // So seat N's discards go to prevSeat(N) = (N+3)%4
  const newHands: Card[][] = hands.map((hand) => [...hand]);

  // Remove discarded cards from each hand
  const discardedCards: Card[][] = [[], [], [], []];
  for (let seat = 0; seat < 4; seat++) {
    const seatDiscards = discards[seat];
    if (!seatDiscards) continue;
    for (const key of seatDiscards) {
      const card = parseCardKey(key);
      discardedCards[seat].push(card);
      const idx = newHands[seat].findIndex((c) => cardEquals(c, card));
      if (idx !== -1) {
        newHands[seat].splice(idx, 1);
      }
    }
  }

  // Pass cards to the right: seat N's discards go to seat (N+3)%4
  for (let seat = 0; seat < 4; seat++) {
    const recipient = prevSeat(seat as PlayerSeat);
    newHands[recipient].push(...discardedCards[seat]);
  }

  // Sort all hands
  for (const hand of newHands) {
    sortHand(hand);
  }

  return newHands;
}
