import type { Card } from '../../../types/card';
import { Rank, STANDARD_SUITS, cardKey } from '../../../types/card';

/** Numeric value of a rank for deadwood: A=1, 2-10=face value, J/Q/K=10 */
export function rankValue(rank: Rank): number {
  if (rank === Rank.ACE) return 1;
  if (rank >= Rank.JACK) return 10;
  return rank;
}

/** Rank order for runs (Ace is low = 1). */
function rankOrder(rank: Rank): number {
  if (rank === Rank.ACE) return 1;
  return rank;
}

/** Check if cards form a valid set (3+ same rank, all different suits). */
export function isValidSet(cards: Card[]): boolean {
  if (cards.length < 3) return false;
  const rank = cards[0].rank;
  const suits = new Set(cards.map(c => c.suit));
  return cards.every(c => c.rank === rank) && suits.size === cards.length;
}

/** Check if cards form a valid run (3+ consecutive same suit). Ace is low only. */
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

/** Total deadwood value of a set of cards */
export function deadwoodValue(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + rankValue(c.rank), 0);
}

/**
 * Find all possible melds (sets and runs) in a hand.
 * Includes sub-combinations (e.g. 3-card subsets of 4-card sets).
 */
function findAllMelds(hand: Card[]): Card[][] {
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
      melds.push([...cards]);
      // Also add all 3-card subsets if there are 4 cards
      if (cards.length === 4) {
        for (let skip = 0; skip < 4; skip++) {
          melds.push(cards.filter((_, i) => i !== skip));
        }
      }
    }
  }

  // Find runs (group by suit, find consecutive sequences)
  for (const suit of STANDARD_SUITS) {
    const suitCards = hand
      .filter(c => c.suit === suit)
      .sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));

    if (suitCards.length < 3) continue;

    // Find all consecutive runs of length 3+
    for (let start = 0; start < suitCards.length; start++) {
      const run: Card[] = [suitCards[start]];
      for (let j = start + 1; j < suitCards.length; j++) {
        if (rankOrder(suitCards[j].rank) === rankOrder(suitCards[j - 1].rank) + 1) {
          run.push(suitCards[j]);
          if (run.length >= 3) {
            melds.push([...run]);
          }
        } else {
          break;
        }
      }
    }
  }

  return melds;
}

/**
 * Find the best combination of non-overlapping melds that minimizes deadwood.
 * Uses recursive backtracking -- tractable for 10-11 cards.
 */
export function findBestMelds(hand: Card[]): { melds: Card[][]; deadwood: Card[]; deadwoodValue: number } {
  const allMelds = findAllMelds(hand);

  let bestDeadwoodVal = Infinity;
  let bestMeldCombo: Card[][] = [];

  function backtrack(meldIdx: number, usedKeys: Set<string>, currentMelds: Card[][]) {
    const unusedCards = hand.filter(c => !usedKeys.has(cardKey(c)));
    const currentDW = deadwoodValue(unusedCards);

    if (currentDW < bestDeadwoodVal) {
      bestDeadwoodVal = currentDW;
      bestMeldCombo = [...currentMelds];
    }

    if (currentDW === 0) return;

    for (let i = meldIdx; i < allMelds.length; i++) {
      const meld = allMelds[i];
      if (meld.some(c => usedKeys.has(cardKey(c)))) continue;

      const newUsed = new Set(usedKeys);
      for (const c of meld) newUsed.add(cardKey(c));
      currentMelds.push(meld);
      backtrack(i + 1, newUsed, currentMelds);
      currentMelds.pop();
    }
  }

  backtrack(0, new Set(), []);

  const usedKeys = new Set<string>();
  for (const meld of bestMeldCombo) {
    for (const c of meld) usedKeys.add(cardKey(c));
  }
  const deadwood = hand.filter(c => !usedKeys.has(cardKey(c)));

  return { melds: bestMeldCombo, deadwood, deadwoodValue: deadwoodValue(deadwood) };
}

/** Can the player knock? (deadwood <= 10) */
export function canKnock(hand: Card[]): boolean {
  const { deadwoodValue: dw } = findBestMelds(hand);
  return dw <= 10;
}

/** Does the player have gin? (deadwood = 0) */
export function isGin(hand: Card[]): boolean {
  const { deadwoodValue: dw } = findBestMelds(hand);
  return dw === 0;
}

/** Calculate deadwood for a hand using optimal melding */
export function calculateDeadwood(hand: Card[]) {
  return findBestMelds(hand);
}
