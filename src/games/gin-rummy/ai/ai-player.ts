import type { GinRummyGameState, GinRummyAction } from '../types';
import { TurnStep, GinRummyPhase } from '../types';
import { cardKey } from '../../../types/card';
import { findBestMelds, deadwoodValue, canKnock, rankValue, isValidSet, isValidRun } from '../engine/validation';

export function getGinRummyAIAction(state: GinRummyGameState, seat: number): GinRummyAction | null {
  if (state.currentPlayer !== seat) return null;

  const player = state.players[seat];

  // Handle LAYING_OFF phase (defender laying off onto knocker's melds)
  if (state.phase === GinRummyPhase.LAYING_OFF) {
    if (state.knocker === null) return { type: 'DONE_LAYING_OFF' };

    const knockerPlayer = state.players[state.knocker];

    // Try to lay off cards onto knocker's melds
    for (const card of player.hand) {
      for (let meldIdx = 0; meldIdx < knockerPlayer.melds.length; meldIdx++) {
        const meld = knockerPlayer.melds[meldIdx];
        const extended = [...meld.cards, card];
        if (isValidSet(extended) || isValidRun(extended)) {
          return { type: 'LAY_OFF_ON_KNOCK', cardKey: cardKey(card), meldIndex: meldIdx };
        }
      }
    }

    return { type: 'DONE_LAYING_OFF' };
  }

  if (state.phase !== GinRummyPhase.PLAYING) return null;

  if (state.turnStep === TurnStep.DRAW) {
    // Check if top discard card reduces deadwood
    if (state.discardPile.length > 0) {
      const topDiscard = state.discardPile[state.discardPile.length - 1];
      const hypothetical = [...player.hand, topDiscard];
      const currentBest = findBestMelds(player.hand);
      const withDiscard = findBestMelds(hypothetical);

      if (deadwoodValue(withDiscard.deadwood) < deadwoodValue(currentBest.deadwood)) {
        return { type: 'DRAW_FROM_DISCARD' };
      }
    }

    return { type: 'DRAW_FROM_STOCK' };
  }

  if (state.turnStep === TurnStep.DISCARD) {
    // Find the best discard
    const hand = [...player.hand];

    let bestDiscardKey = cardKey(hand[0]);
    let bestDWAfterDiscard = Infinity;
    let bestCanKnock = false;

    for (const card of hand) {
      const key = cardKey(card);

      // Can't discard what was just picked from discard
      if (state.lastDrawnFromDiscard && state.lastDrawnCard === key) {
        continue;
      }

      const remaining = hand.filter(c => cardKey(c) !== key);
      const { deadwood } = findBestMelds(remaining);
      const dw = deadwoodValue(deadwood);

      if (dw < bestDWAfterDiscard) {
        bestDWAfterDiscard = dw;
        bestDiscardKey = key;
        bestCanKnock = dw <= 10;
      } else if (dw === bestDWAfterDiscard) {
        const currentCard = hand.find(c => cardKey(c) === bestDiscardKey);
        if (currentCard && rankValue(card.rank) > rankValue(currentCard.rank)) {
          bestDiscardKey = key;
        }
      }
    }

    // Check if we can knock after discarding best card
    if (bestCanKnock || canKnock(hand.filter(c => cardKey(c) !== bestDiscardKey))) {
      return { type: 'DISCARD', cardKey: bestDiscardKey, knock: true };
    }

    return { type: 'DISCARD', cardKey: bestDiscardKey };
  }

  return null;
}
