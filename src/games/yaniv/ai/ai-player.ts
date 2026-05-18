import type { Card, CardKey } from '../../../types/card';
import { cardKey, isJoker } from '../../../types/card';
import type { YanivGameState, YanivAction } from '../types';
import { YanivPhase } from '../types';
import {
  getHandValue,
  getYanivCardValue,
  isValidSet,
  isValidSequence,
} from '../engine/discard-validation';
import { getDrawableFromDiscard } from '../engine/draw-validation';

/**
 * Yaniv AI player.
 *
 * For a given game state and seat, returns the action the AI should take,
 * or null if the AI has no action to take in the current phase.
 */
export function getYanivAIAction(
  state: YanivGameState,
  seat: number
): YanivAction | null {
  const round = state.currentRound;
  const settings = state.settings;
  const player = round.players[seat];

  if (!player || player.eliminated) return null;

  switch (round.phase) {
    case YanivPhase.PLAYER_TURN: {
      if (round.currentPlayer !== seat) return null;

      const hand = player.hand;
      const handValue = getHandValue(hand);

      // If hand value is at or below yaniv threshold, always declare Yaniv
      if (handValue <= settings.yanivThreshold) {
        return { type: 'DECLARE_YANIV', seat };
      }

      // Otherwise, find the best discard and draw
      const bestDiscard = findBestDiscard(hand);
      const discardCards = bestDiscard.map((c) => cardKey(c));

      // Determine draw source
      const drawSource = chooseDrawSource(round, discardCards);

      return {
        type: 'DISCARD_AND_DRAW',
        seat,
        discardCards,
        drawSource: drawSource.source,
        drawCardKey: drawSource.cardKey,
      };
    }

    case YanivPhase.QUICK_STICK: {
      if (round.currentPlayer !== seat) return null;
      // Always skip quick-stick for simplicity in v1
      return { type: 'SKIP_QUICK_STICK', seat };
    }

    default:
      return null;
  }
}

// ─── Internal AI Helpers ───────────────────────────────────────────────

/**
 * Find the best group of cards to discard from a hand.
 * Priority:
 * 1. The highest-value valid set (pairs/triples of same rank)
 * 2. The longest/highest-value valid sequence (3+ same suit consecutive)
 * 3. The single highest-value card
 */
function findBestDiscard(hand: Card[]): Card[] {
  // Try to find sets (groups of same rank)
  const bestSet = findBestSet(hand);
  // Try to find sequences (3+ consecutive same suit)
  const bestSequence = findBestSequence(hand);

  // Compare: prefer whichever discards the most total value
  const setValue = bestSet ? totalValue(bestSet) : 0;
  const seqValue = bestSequence ? totalValue(bestSequence) : 0;

  if (bestSet && setValue >= seqValue && bestSet.length >= 2) {
    return bestSet;
  }
  if (bestSequence && seqValue > 0) {
    return bestSequence;
  }
  if (bestSet && bestSet.length >= 2) {
    return bestSet;
  }

  // Default: discard the single highest-value card (but not jokers if we have alternatives)
  return [findHighestCard(hand)];
}

/**
 * Find the best set (2+ cards of same rank) to discard.
 * Returns the set with the highest total value, or null if none found.
 */
function findBestSet(hand: Card[]): Card[] | null {
  // Group cards by rank (excluding jokers, which can't be in sets)
  const byRank = new Map<number, Card[]>();
  for (const card of hand) {
    if (isJoker(card)) continue;
    const existing = byRank.get(card.rank) ?? [];
    existing.push(card);
    byRank.set(card.rank, existing);
  }

  let bestSet: Card[] | null = null;
  let bestValue = 0;

  for (const [, cards] of byRank) {
    if (cards.length >= 2 && isValidSet(cards)) {
      const value = totalValue(cards);
      if (value > bestValue) {
        bestValue = value;
        bestSet = cards;
      }
    }
  }

  return bestSet;
}

/**
 * Find the best sequence (3+ consecutive cards of same suit) to discard.
 * Returns the sequence with the highest total value, or null if none found.
 */
function findBestSequence(hand: Card[]): Card[] | null {
  // Group non-joker cards by suit
  const bySuit = new Map<string, Card[]>();
  const jokers: Card[] = [];

  for (const card of hand) {
    if (isJoker(card)) {
      jokers.push(card);
      continue;
    }
    const existing = bySuit.get(card.suit) ?? [];
    existing.push(card);
    bySuit.set(card.suit, existing);
  }

  let bestSeq: Card[] | null = null;
  let bestValue = 0;

  for (const [, suitCards] of bySuit) {
    if (suitCards.length < 2) continue; // Need at least 2 non-joker cards + potential joker

    // Sort by rank value for sequence detection
    suitCards.sort((a, b) => getSequenceVal(a) - getSequenceVal(b));

    // Try to find consecutive runs (with joker fill-ins)
    for (let start = 0; start < suitCards.length; start++) {
      for (let end = start + 1; end < suitCards.length; end++) {
        const subset = suitCards.slice(start, end + 1);
        // Check how many jokers we'd need
        const minVal = getSequenceVal(subset[0]);
        const maxVal = getSequenceVal(subset[subset.length - 1]);
        const span = maxVal - minVal + 1;
        const gapsNeeded = span - subset.length;

        if (gapsNeeded <= jokers.length && span >= 3) {
          // Build the candidate with jokers
          const candidate = [...subset, ...jokers.slice(0, gapsNeeded)];
          if (isValidSequence(candidate)) {
            const value = totalValue(candidate);
            if (value > bestValue) {
              bestValue = value;
              bestSeq = candidate;
            }
          }
        }
      }
    }
  }

  return bestSeq;
}

/**
 * Get the sequence positional value of a card for sorting purposes.
 * ACE = 1 for sequences.
 */
function getSequenceVal(card: Card): number {
  if (isJoker(card)) return -1;
  // Ace (enum 14) counts as 1 in sequences
  if (card.rank === 14) return 1;
  return card.rank;
}

/**
 * Find the single highest-value card in a hand.
 * Prefer discarding non-joker cards over jokers (jokers are 0 value).
 */
function findHighestCard(hand: Card[]): Card {
  let highest = hand[0];
  let highestVal = getYanivCardValue(hand[0]);

  for (let i = 1; i < hand.length; i++) {
    const val = getYanivCardValue(hand[i]);
    // Prefer higher value; if tied, prefer non-joker
    if (val > highestVal || (val === highestVal && isJoker(highest))) {
      highest = hand[i];
      highestVal = val;
    }
  }

  return highest;
}

/**
 * Total Yaniv value of a group of cards.
 */
function totalValue(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + getYanivCardValue(c), 0);
}

/**
 * Choose whether to draw from the discard pile or the draw pile.
 * Strategy: if the previous discard has a low-value drawable card (value <= 3),
 * draw from discard. Otherwise draw from the pile.
 */
function chooseDrawSource(
  round: YanivGameState['currentRound'],
  discardCardKeys: CardKey[]
): { source: 'pile' | 'discard'; cardKey?: CardKey } {
  // The previous discard is the second-to-last on the pile after our discard is pushed.
  // But at the time the AI is choosing, our discard hasn't been pushed yet.
  // So the "previous discard" is the current lastDiscard.
  if (round.lastDiscard && round.lastDiscard.cards.length > 0) {
    const drawableCards = getDrawableFromDiscard(round.lastDiscard);

    // Find the lowest-value drawable card
    let bestCard: Card | null = null;
    let bestVal = Infinity;

    for (const card of drawableCards) {
      const val = getYanivCardValue(card);
      // Don't pick up a card we're about to discard
      const ck = cardKey(card);
      if (discardCardKeys.includes(ck)) continue;

      if (val < bestVal) {
        bestVal = val;
        bestCard = card;
      }
    }

    // Draw from discard if we found a low-value card (value <= 3)
    if (bestCard && bestVal <= 3) {
      return { source: 'discard', cardKey: cardKey(bestCard) };
    }
  }

  return { source: 'pile' };
}
