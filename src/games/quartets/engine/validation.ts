import type { QuartetCard, QuartetCategory, QuartetsPlayer } from '../types';
import { QuartetColor, QUARTET_COLORS } from '../types';

/**
 * Check if a player can ask for a specific card.
 * Must hold at least 1 card of that category AND not already have that exact card.
 */
export function canAskForCard(
  player: QuartetsPlayer,
  category: QuartetCategory,
  color: QuartetColor,
): boolean {
  let hasCategory = false;
  let hasExactCard = false;

  for (const card of player.hand) {
    if (card.category === category) {
      hasCategory = true;
      if (card.color === color) {
        hasExactCard = true;
      }
    }
  }

  return hasCategory && !hasExactCard;
}

/**
 * Get the categories the player can ask about (has at least 1 card of).
 */
export function getAskableCategories(hand: QuartetCard[]): QuartetCategory[] {
  const categories = new Set<QuartetCategory>();
  for (const card of hand) {
    categories.add(card.category);
  }
  return Array.from(categories).sort((a, b) => a - b);
}

/**
 * Get the colors the player is missing for a given category.
 */
export function getMissingColors(
  hand: QuartetCard[],
  category: QuartetCategory,
): QuartetColor[] {
  const heldColors = new Set<QuartetColor>();
  for (const card of hand) {
    if (card.category === category) {
      heldColors.add(card.color);
    }
  }
  return QUARTET_COLORS.filter((c) => !heldColors.has(c));
}

/**
 * Check if a player's hand contains all 4 colors of a given category.
 */
export function checkCompletedQuartet(
  hand: QuartetCard[],
  category: QuartetCategory,
): boolean {
  const colors = new Set<QuartetColor>();
  for (const card of hand) {
    if (card.category === category) {
      colors.add(card.color);
    }
  }
  return colors.size === 4;
}

/**
 * Check if a player has any valid ask they can make.
 */
export function hasValidAsk(player: QuartetsPlayer): boolean {
  return getAskableCategories(player.hand).length > 0;
}
