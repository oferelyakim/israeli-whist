import type { Card } from '../../../types/card';
import { Rank, STANDARD_SUITS } from '../../../types/card';
import type { Meld } from '../types';

/** Numeric value of a rank for scoring/sorting. Ace = 1 in Rummy. */
export function rankValue(rank: Rank): number {
  if (rank === Rank.ACE) return 1;
  if (rank >= Rank.JACK) return 10; // J, Q, K = 10
  return rank; // 2-10 = face value
}

/** Rank order for runs (Ace is low = 1). */
function rankOrder(rank: Rank): number {
  if (rank === Rank.ACE) return 1;
  return rank;
}

/**
 * Check if a set of cards forms a valid set (3+ cards of the same rank,
 * all different suits).
 */
export function isValidSet(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const rank = cards[0].rank;
  const suits = new Set(cards.map(c => c.suit));
  return cards.every(c => c.rank === rank) && suits.size === cards.length;
}

/**
 * Check if a set of cards forms a valid run (3+ consecutive cards of
 * the same suit). Ace is low only (A-2-3, not Q-K-A).
 */
export function isValidRun(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const suit = cards[0].suit;
  if (!cards.every(c => c.suit === suit)) return false;

  const sorted = [...cards].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));
  for (let i = 1; i < sorted.length; i++) {
    if (rankOrder(sorted[i].rank) !== rankOrder(sorted[i - 1].rank) + 1) {
      return false;
    }
  }
  return true;
}

/** Check if cards form a valid meld (either a set or a run). */
export function isValidMeld(cards: Card[]): { valid: boolean; type: 'set' | 'run' | null } {
  if (isValidSet(cards)) return { valid: true, type: 'set' };
  if (isValidRun(cards)) return { valid: true, type: 'run' };
  return { valid: false, type: null };
}

/** Check if player has won (empty hand after discarding). */
export function checkWin(hand: Card[]): boolean {
  return hand.length === 0;
}

/** Check if a single card can be laid off onto an existing meld. */
export function canLayOff(card: Card, meld: Meld): boolean {
  const extended = [...meld.cards, card];
  if (meld.type === 'set') {
    return isValidSet(extended);
  }
  return isValidRun(extended);
}

/**
 * Find all possible melds (sets and runs) in a hand.
 * Returns an array of card arrays, each representing a valid meld.
 * Uses a greedy approach -- not guaranteed optimal, but good enough for AI.
 */
export function findPossibleMelds(hand: Card[]): Card[][] {
  const melds: Card[][] = [];

  // Find sets (group by rank)
  const byRank = new Map<Rank, Card[]>();
  for (const card of hand) {
    const group = byRank.get(card.rank) ?? [];
    group.push(card);
    byRank.set(card.rank, group);
  }
  for (const cards of byRank.values()) {
    if (cards.length >= 3) {
      melds.push(cards);
    }
  }

  // Find runs (group by suit, then find consecutive sequences)
  for (const suit of STANDARD_SUITS) {
    const suitCards = hand
      .filter(c => c.suit === suit)
      .sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));

    if (suitCards.length < 3) continue;

    // Find all consecutive runs of length 3+
    let run: Card[] = [suitCards[0]];
    for (let i = 1; i < suitCards.length; i++) {
      if (rankOrder(suitCards[i].rank) === rankOrder(suitCards[i - 1].rank) + 1) {
        run.push(suitCards[i]);
      } else {
        if (run.length >= 3) melds.push([...run]);
        run = [suitCards[i]];
      }
    }
    if (run.length >= 3) melds.push([...run]);
  }

  return melds;
}
