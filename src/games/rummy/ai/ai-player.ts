import type { RummyGameState, RummyAction } from '../types';
import { TurnStep, RummyPhase } from '../types';
import type { Card } from '../../../types/card';
import { cardKey } from '../../../types/card';
import { canLayOff, findPossibleMelds, rankValue } from '../engine/validation';

export function getRummyAIAction(state: RummyGameState, seat: number): RummyAction | null {
  if (state.phase !== RummyPhase.PLAYING) return null;
  if (state.currentPlayer !== seat) return null;

  const player = state.players[seat];

  if (state.turnStep === TurnStep.DRAW) {
    const deckExhausted = state.drawPile.length === 0 && state.discardPile.length <= 1;

    // Check if top discard card helps us (completes a meld)
    if (state.discardPile.length > 0) {
      const topDiscard = state.discardPile[state.discardPile.length - 1];
      const hypothetical = [...player.hand, topDiscard];
      const meldsWithDiscard = findPossibleMelds(hypothetical);
      const meldsWithout = findPossibleMelds(player.hand);

      // If picking up discard creates a new meld, do it
      if (meldsWithDiscard.length > meldsWithout.length) {
        return { type: 'DRAW_FROM_DISCARD' };
      }
    }

    // Deck is exhausted and discard won't help — pass instead of looping forever.
    if (deckExhausted) {
      return { type: 'PASS_TURN' };
    }

    // Default: draw from stock
    return { type: 'DRAW_FROM_STOCK' };
  }

  if (state.turnStep === TurnStep.MELD) {
    // Try to meld any valid sets/runs from hand
    const possibleMelds = findPossibleMelds(player.hand);
    if (possibleMelds.length > 0) {
      // Find the largest meld first (prefer melding more cards)
      const bestMeld = possibleMelds.sort((a, b) => b.length - a.length)[0];
      return { type: 'MELD_CARDS', cardKeys: bestMeld.map(c => cardKey(c)) };
    }

    // Try to lay off cards onto existing melds
    for (const card of player.hand) {
      for (const meld of state.melds) {
        if (canLayOff(card, meld)) {
          return { type: 'LAY_OFF', cardKey: cardKey(card), meldId: meld.id };
        }
      }
    }

    // Must discard - choose the highest value card that doesn't break a potential meld
    // Simple strategy: discard the card that contributes least to potential melds
    const hand: Card[] = [...player.hand];

    // Count how many potential melds each card is part of
    const cardMeldCount = new Map<string, number>();
    for (const card of hand) {
      cardMeldCount.set(cardKey(card), 0);
    }

    const allMelds = findPossibleMelds(hand);
    for (const meld of allMelds) {
      for (const card of meld) {
        const key = cardKey(card);
        cardMeldCount.set(key, (cardMeldCount.get(key) ?? 0) + 1);
      }
    }

    // Sort hand by: meld participation (asc), then rank value (desc)
    // Discard the card with lowest meld participation and highest rank
    hand.sort((a, b) => {
      const aMelds = cardMeldCount.get(cardKey(a)) ?? 0;
      const bMelds = cardMeldCount.get(cardKey(b)) ?? 0;
      if (aMelds !== bMelds) return aMelds - bMelds; // fewer melds first
      return rankValue(b.rank) - rankValue(a.rank); // higher rank first
    });

    return { type: 'DISCARD', cardKey: cardKey(hand[0]) };
  }

  return null;
}
