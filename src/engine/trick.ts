import type { Card, StandardSuit } from '../types/card';
import type { Trick, PlayerSeat } from '../types/game';

export function getPlayableCards(
  hand: Card[],
  leadSuit: StandardSuit | null
): Card[] {
  if (leadSuit === null) return hand; // Leading: any card
  const followSuit = hand.filter((c) => c.suit === leadSuit);
  if (followSuit.length > 0) return followSuit; // Must follow suit
  return hand; // Can't follow: play anything
}

export function determineTrickWinner(
  trick: Trick,
  trumpSuit: StandardSuit | null
): PlayerSeat {
  if (trick.cards.length !== 4) {
    throw new Error('Trick must have exactly 4 cards to determine winner');
  }

  let winning = trick.cards[0];

  for (let i = 1; i < trick.cards.length; i++) {
    const current = trick.cards[i];

    if (current.card.suit === winning.card.suit) {
      // Same suit: higher rank wins
      if (current.card.rank > winning.card.rank) {
        winning = current;
      }
    } else if (trumpSuit && current.card.suit === trumpSuit) {
      // Trumped (and winning card is NOT trump, since same-suit handled above)
      if (winning.card.suit !== trumpSuit || current.card.rank > winning.card.rank) {
        winning = current;
      }
    }
    // Off-suit non-trump: loses, winning stays
  }

  return winning.seat;
}

export function createEmptyTrick(leadSeat: PlayerSeat): Trick {
  return {
    cards: [],
    leadSeat,
    leadSuit: null,
    winnerSeat: null,
  };
}
