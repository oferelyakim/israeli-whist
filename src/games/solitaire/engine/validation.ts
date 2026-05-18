import type { Card } from '../../../types/card';
import { Rank, isJoker, isRedSuit } from '../../../types/card';
import type { FoundationPile, SolitaireGameState } from '../types';

/**
 * Solitaire rank value: ACE=1, 2=2, ..., K=13.
 * The existing Rank enum has ACE=14 (high for trick games).
 */
export function solitaireRankValue(card: Card): number {
  if (isJoker(card)) return 0;
  if (card.rank === Rank.ACE) return 1;
  return card.rank; // 2–13 map directly
}

/**
 * Can `card` be placed on `target` in a tableau column?
 * Klondike: descending rank, alternating colors.
 * Joker: can go on anything; anything can go on joker.
 */
export function canPlaceOnTableau(card: Card, target: Card | null): boolean {
  // Empty column: only Kings or joker
  if (target === null) {
    return card.rank === Rank.KING || isJoker(card);
  }
  if (isJoker(target)) return true;
  if (isJoker(card)) return true;

  const colorsDiffer = isRedSuit(card.suit) !== isRedSuit(target.suit);
  const descends = solitaireRankValue(card) === solitaireRankValue(target) - 1;
  return colorsDiffer && descends;
}

/**
 * Can `card` be placed on a foundation pile?
 * Foundation builds A→K, same suit. Joker cannot go to foundations.
 */
export function canPlaceOnFoundation(card: Card, foundation: FoundationPile): boolean {
  if (isJoker(card)) return false;

  if (foundation.cards.length === 0) {
    return card.rank === Rank.ACE;
  }

  const top = foundation.cards[foundation.cards.length - 1];
  return card.suit === top.suit
    && solitaireRankValue(card) === solitaireRankValue(top) + 1;
}

/** All tableau cards are face-up and stock/waste are empty. */
export function allRevealed(state: SolitaireGameState): boolean {
  return state.tableau.every(col => col.faceDown.length === 0)
    && state.stock.length === 0
    && state.waste.length === 0;
}

/** Win condition: all 4 foundations have 13 cards. */
export function isWon(state: SolitaireGameState): boolean {
  return state.foundations.every(f => f.cards.length === 13);
}
