import type { Card } from '../../../types/card';
import { cardEquals } from '../../../types/card';
import type { DiscardGroup } from '../types';
import { sortSequence } from './discard-validation';

/**
 * Get the list of cards that can be drawn from a discard group.
 * - Single: the single card.
 * - Set: any one card from the set.
 * - Sequence: only the first or last card (after sorting into sequence order).
 */
export function getDrawableFromDiscard(discard: DiscardGroup): Card[] {
  if (discard.cards.length === 0) return [];

  switch (discard.type) {
    case 'single':
      return [discard.cards[0]];

    case 'set':
      // Any one card from the set is drawable
      return [...discard.cards];

    case 'sequence': {
      // Only the first and last cards in sequence order
      const sorted = sortSequence(discard.cards);
      const drawable: Card[] = [sorted[0]];
      if (sorted.length > 1) {
        const last = sorted[sorted.length - 1];
        // Avoid duplicate if somehow first equals last
        if (!cardEquals(sorted[0], last)) {
          drawable.push(last);
        }
      }
      return drawable;
    }

    default:
      return [];
  }
}

/**
 * Check if a specific card can be drawn from a discard group.
 */
export function canDrawFromDiscard(discard: DiscardGroup, card: Card): boolean {
  const drawable = getDrawableFromDiscard(discard);
  return drawable.some((c) => cardEquals(c, card));
}
