import type { QuartetsGameState, QuartetsAction, AskRecord } from '../types';
import { QuartetColor, QuartetsPhase } from '../types';
import { getAskableCategories, getMissingColors } from '../engine/validation';

/**
 * Smarter AI strategy for Quartets:
 *
 * 1. Build all valid (category, color, target) combinations
 * 2. Score each candidate:
 *    - Prefer categories closer to completion (3 of 4 > 2 of 4 > 1 of 4)
 *    - Strongly avoid repeating a recently failed ask (same target + same card)
 *    - Slightly prefer opponents who have more cards (higher chance they have it)
 *    - Prefer opponents who recently gave us a card of the same category
 *      (they may hold more of that set)
 *    - Add randomness so bots don't feel robotic
 * 3. Pick the highest-scoring candidate
 */
export function getQuartetsAIAction(
  state: QuartetsGameState,
  seat: number,
): QuartetsAction | null {
  const round = state.round;

  // Auto-acknowledge turn results
  if (round.phase === QuartetsPhase.TURN_RESULT) {
    return { type: 'ACKNOWLEDGE_RESULT', seat };
  }

  if (round.phase !== QuartetsPhase.PLAYER_TURN) return null;
  if (round.currentPlayer !== seat) return null;

  const player = round.players[seat];
  if (player.hand.length === 0) return null;

  const categories = getAskableCategories(player.hand);
  if (categories.length === 0) return null;

  const opponents = round.players.filter(
    (p) => p.seat !== seat && p.hand.length > 0,
  );
  if (opponents.length === 0) return null;

  // Recent ask history for this AI
  const recentAsks: AskRecord[] = round.recentAsks || [];
  const myRecentFails = recentAsks.filter(
    (a) => a.askerSeat === seat && !a.success,
  );
  const myRecentSuccesses = recentAsks.filter(
    (a) => a.askerSeat === seat && a.success,
  );

  // Build and score all valid (category, target) candidates
  interface Candidate {
    category: number;
    targetSeat: number;
    score: number;
  }

  const candidates: Candidate[] = [];

  for (const cat of categories) {
    const catCount = player.hand.filter((c) => c.category === cat).length;

    for (const opp of opponents) {
      let score = 0;

      // ── Base: prefer near-complete categories ──
      // 3 of 4 = 30, 2 of 4 = 20, 1 of 4 = 10
      score += catCount * 10;

      // ── Penalty: recently failed asking this target for this category (no cards at all) ──
      const failedThisTargetCategory = myRecentFails.some(
        (a) => a.targetSeat === opp.seat && a.category === cat && !a.color,
      );
      if (failedThisTargetCategory) score -= 30;

      // ── Penalty: recently failed color ask for this category+target ──
      const failedColorAsk = myRecentFails.some(
        (a) => a.targetSeat === opp.seat && a.category === cat && a.color,
      );
      if (failedColorAsk) score -= 10;

      // ── Bonus: this opponent recently gave us a card from this same category ──
      const gaveMeThisCategory = myRecentSuccesses.some(
        (a) => a.targetSeat === opp.seat && a.category === cat,
      );
      if (gaveMeThisCategory) score += 8;

      // ── Slight preference for opponents with more cards ──
      score += opp.hand.length * 0.5;

      // ── Spread asks: slight bonus for opponents we haven't asked recently ──
      const recentAsksToThisOpp = recentAsks.filter(
        (a) => a.askerSeat === seat && a.targetSeat === opp.seat,
      ).length;
      score -= recentAsksToThisOpp * 2;

      // ── Randomness for variety ──
      score += Math.random() * 6;

      candidates.push({
        category: cat,
        targetSeat: opp.seat,
        score,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Sort by score descending, pick the best
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  return {
    type: 'ASK_FOR_CARD',
    seat,
    targetSeat: best.targetSeat,
    category: best.category,
  };
}

/**
 * AI picks a color for the CHOOSING_COLOR phase.
 * Avoids recently failed colors for this category+target.
 */
export function getQuartetsAIColorChoice(
  state: QuartetsGameState,
  seat: number,
): QuartetColor | null {
  const round = state.round;
  const req = round.pendingRequest;
  if (!req) return null;

  const player = round.players[seat];
  const missingColors = getMissingColors(player.hand, req.category);
  if (missingColors.length === 0) return null;

  // Avoid recently failed colors for this target+category
  const recentAsks = round.recentAsks || [];
  const recentFails = recentAsks.filter(
    (a) =>
      a.askerSeat === seat &&
      a.targetSeat === req.targetSeat &&
      a.category === req.category &&
      a.color &&
      !a.success,
  );
  const failedColors = new Set(recentFails.map((a) => a.color));

  const preferred = missingColors.filter((c) => !failedColors.has(c));
  const choices = preferred.length > 0 ? preferred : missingColors;

  return choices[Math.floor(Math.random() * choices.length)];
}
