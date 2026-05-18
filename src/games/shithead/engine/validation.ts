import type { Card } from '../../../types/card';
import { Rank } from '../../../types/card';

// Get the "effective" top card -- skip 3s (transparent)
export function getEffectiveTopCard(discardPile: Card[]): Card | null {
  for (let i = discardPile.length - 1; i >= 0; i--) {
    if (discardPile[i].rank !== Rank.THREE) return discardPile[i];
  }
  return null; // All 3s or empty -- anything can be played
}

// Can this card be played on the current pile?
export function canPlayCard(card: Card, discardPile: Card[]): boolean {
  // Special cards that can always be played
  if (card.rank === Rank.TWO || card.rank === Rank.THREE || card.rank === Rank.TEN) {
    return true;
  }

  const topCard = getEffectiveTopCard(discardPile);
  if (!topCard) return true; // Empty pile -- anything goes

  // After a 7, must play 7 or lower
  if (topCard.rank === Rank.SEVEN) {
    return card.rank <= Rank.SEVEN;
  }

  // Normal: play equal or higher
  return card.rank >= topCard.rank;
}

// Check if top 4 cards are all same rank -> burn
export function shouldBurnPile(discardPile: Card[]): boolean {
  if (discardPile.length < 4) return false;
  const top4 = discardPile.slice(-4);
  // Skip 3s -- they don't count for 4-of-a-kind
  const rank = top4[0].rank;
  if (rank === Rank.THREE) return false;
  return top4.every(c => c.rank === rank);
}

// Get all playable card groups from a set of cards
export function getPlayableCards(cards: Card[], discardPile: Card[]): Card[][] {
  const playable: Card[][] = [];
  // Group by rank
  const byRank = new Map<Rank, Card[]>();
  for (const card of cards) {
    const group = byRank.get(card.rank) ?? [];
    group.push(card);
    byRank.set(card.rank, group);
  }

  for (const [, groupCards] of byRank) {
    if (canPlayCard(groupCards[0], discardPile)) {
      // Can play 1, 2, 3, or all of same rank
      for (let count = 1; count <= groupCards.length; count++) {
        playable.push(groupCards.slice(0, count));
      }
    }
  }

  return playable;
}

// Can a player play anything from their hand?
export function hasPlayableCard(cards: Card[], discardPile: Card[]): boolean {
  return cards.some(card => canPlayCard(card, discardPile));
}

// Determine which "zone" a player is playing from
export function getPlayerPlayZone(
  player: { hand: Card[]; faceUp: Card[]; faceDown: Card[] },
  drawPileEmpty: boolean,
): 'hand' | 'faceUp' | 'faceDown' | 'done' {
  if (player.hand.length > 0) return 'hand';
  if (!drawPileEmpty) return 'hand'; // Still drawing
  if (player.faceUp.length > 0) return 'faceUp';
  if (player.faceDown.length > 0) return 'faceDown';
  return 'done';
}
