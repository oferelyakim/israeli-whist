import type { Card } from '../../../types/card';
import { Rank, isJoker } from '../../../types/card';

/**
 * Get the Yaniv scoring value of a card.
 * Joker=0, Ace=1, 2-10=face value, J=11, Q=12, K=13.
 */
export function getYanivCardValue(card: Card): number {
  if (isJoker(card)) return 0;
  if (card.rank === Rank.ACE) return 1;
  // For ranks 2-13, the enum value matches the face value
  return card.rank;
}

/**
 * Get the total Yaniv hand value (sum of card values).
 */
export function getHandValue(hand: Card[]): number {
  return hand.reduce((sum, card) => sum + getYanivCardValue(card), 0);
}

/**
 * Get the sequence positional value of a card.
 * ACE = 1 for sequence purposes. Other cards use their rank value.
 * Jokers have no intrinsic sequence value (they fill gaps).
 */
export function getSequenceValue(card: Card): number {
  if (isJoker(card)) return -1; // jokers don't have a fixed position
  if (card.rank === Rank.ACE) return 1;
  return card.rank;
}

/**
 * Check if cards form a valid set: 2+ cards of the same rank.
 * Jokers do NOT substitute in sets.
 */
export function isValidSet(cards: Card[]): boolean {
  if (cards.length < 2) return false;

  // No jokers allowed in sets
  if (cards.some(isJoker)) return false;

  const rank = cards[0].rank;
  return cards.every((c) => c.rank === rank);
}

/**
 * Check if cards form a valid sequence: 3+ cards of the same suit in consecutive order.
 * Jokers can fill gaps. ACE = 1 for sequences (low only).
 */
export function isValidSequence(cards: Card[]): boolean {
  if (cards.length < 3) return false;

  const nonJokers = cards.filter((c) => !isJoker(c));
  const jokerCount = cards.length - nonJokers.length;

  // Need at least one non-joker to determine the suit
  if (nonJokers.length === 0) return false;

  // All non-jokers must share the same suit
  const suit = nonJokers[0].suit;
  if (!nonJokers.every((c) => c.suit === suit)) return false;

  // Get sorted sequence values of non-jokers
  const values = nonJokers.map(getSequenceValue).sort((a, b) => a - b);

  // Check for duplicate values among non-jokers
  for (let i = 1; i < values.length; i++) {
    if (values[i] === values[i - 1]) return false;
  }

  // The span from min to max must be coverable by the total card count
  const minVal = values[0];
  const maxVal = values[values.length - 1];
  const span = maxVal - minVal + 1;

  // The total cards must equal the span (non-jokers fill known positions, jokers fill gaps)
  if (span !== cards.length) return false;

  // Check that all positions in the span are covered by either a non-joker or a joker
  // The number of gaps = span - nonJokers.length; this must be <= jokerCount
  const gaps = span - nonJokers.length;
  return gaps <= jokerCount;
}

/**
 * Sort cards into proper sequence order.
 * Non-joker cards are sorted by sequence value, jokers are placed in the gaps.
 */
export function sortSequence(cards: Card[]): Card[] {
  const nonJokers = cards.filter((c) => !isJoker(c));
  const jokers = cards.filter(isJoker);

  // Sort non-jokers by sequence value
  nonJokers.sort((a, b) => getSequenceValue(a) - getSequenceValue(b));

  if (nonJokers.length === 0) return [...jokers];

  const minVal = getSequenceValue(nonJokers[0]);
  const maxVal = getSequenceValue(nonJokers[nonJokers.length - 1]);

  const result: Card[] = [];
  let nonJokerIdx = 0;
  let jokerIdx = 0;

  for (let v = minVal; v <= maxVal; v++) {
    if (nonJokerIdx < nonJokers.length && getSequenceValue(nonJokers[nonJokerIdx]) === v) {
      result.push(nonJokers[nonJokerIdx]);
      nonJokerIdx++;
    } else if (jokerIdx < jokers.length) {
      result.push(jokers[jokerIdx]);
      jokerIdx++;
    }
  }

  // Append any remaining jokers (shouldn't happen in a valid sequence)
  while (jokerIdx < jokers.length) {
    result.push(jokers[jokerIdx]);
    jokerIdx++;
  }

  return result;
}

/**
 * Validate a group of cards being discarded.
 * Returns the type of discard group or 'invalid'.
 */
export function validateDiscard(cards: Card[]): 'single' | 'set' | 'sequence' | 'invalid' {
  if (cards.length === 0) return 'invalid';

  if (cards.length === 1) return 'single';

  if (isValidSet(cards)) return 'set';

  if (isValidSequence(cards)) return 'sequence';

  return 'invalid';
}
