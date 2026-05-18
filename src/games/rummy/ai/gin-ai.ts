import type { RummyGameState, RummyAction } from '../types';
import { TurnStep, RummyPhase } from '../types';
import { cardKey } from '../../../types/card';
import { findBestMelds, deadwoodValue, canKnock } from '../engine/gin-reducer';
import { rankValue, isValidSet, isValidRun } from '../engine/validation';

export function getGinAIAction(state: RummyGameState, seat: number): RummyAction | null {
  if (state.currentPlayer !== seat) return null;

  const player = state.players[seat];

  // Handle KNOCK_REVEAL phase (defender laying off)
  if (state.phase === RummyPhase.KNOCK_REVEAL) {
    if (!state.ginState || state.ginState.isGin) {
      return { type: 'DEFENDER_DONE' };
    }

    // Try to lay off cards onto knocker's melds
    for (const card of player.hand) {
      for (let meldIdx = 0; meldIdx < state.ginState.knockerMelds.length; meldIdx++) {
        const meld = state.ginState.knockerMelds[meldIdx];
        const extended = [...meld.cards, card];
        if (isValidSet(extended) || isValidRun(extended)) {
          return { type: 'DEFENDER_LAYOFF', cardKey: cardKey(card), meldIndex: meldIdx };
        }
      }
    }

    return { type: 'DEFENDER_DONE' };
  }

  if (state.phase !== RummyPhase.PLAYING) return null;

  if (state.turnStep === TurnStep.DRAW) {
    // Check if top discard card helps us
    if (state.discardPile.length > 0) {
      const topDiscard = state.discardPile[state.discardPile.length - 1];
      const hypothetical = [...player.hand, topDiscard];
      const currentBest = findBestMelds(player.hand);
      const withDiscard = findBestMelds(hypothetical);

      // Pick up discard if it reduces deadwood
      if (deadwoodValue(withDiscard.deadwood) < deadwoodValue(currentBest.deadwood)) {
        return { type: 'DRAW_FROM_DISCARD' };
      }
    }

    return { type: 'DRAW_FROM_STOCK' };
  }

  if (state.turnStep === TurnStep.MELD) {
    // In Gin Rummy, we don't meld during play - we knock or discard

    // Check if we can knock or gin
    if (canKnock(player.hand)) {
      const { melds, deadwood } = findBestMelds(player.hand);
      const meldKeys = melds.map(m => m.map(c => cardKey(c)));

      if (deadwood.length === 0) {
        return { type: 'GIN', melds: meldKeys };
      }

      // Always knock when we can (simple AI strategy)
      return { type: 'KNOCK', melds: meldKeys };
    }

    // Must discard - choose wisely
    // Discard the card that results in lowest deadwood after removal
    const hand = [...player.hand];

    let bestDiscardKey = cardKey(hand[0]);
    let bestDWAfterDiscard = Infinity;

    for (const card of hand) {
      const key = cardKey(card);

      // Can't discard what was just picked from discard
      if (state.ginState?.lastDrawnFromDiscard && state.ginState.lastDrawnCard === key) {
        continue;
      }

      const remaining = hand.filter(c => cardKey(c) !== key);
      const { deadwood } = findBestMelds(remaining);
      const dw = deadwoodValue(deadwood);

      if (dw < bestDWAfterDiscard) {
        bestDWAfterDiscard = dw;
        bestDiscardKey = key;
      } else if (dw === bestDWAfterDiscard) {
        // Tie-break: discard higher value card
        const currentCard = hand.find(c => cardKey(c) === bestDiscardKey);
        if (currentCard && rankValue(card.rank) > rankValue(currentCard.rank)) {
          bestDiscardKey = key;
        }
      }
    }

    return { type: 'DISCARD', cardKey: bestDiscardKey };
  }

  return null;
}
