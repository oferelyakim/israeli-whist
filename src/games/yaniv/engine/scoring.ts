import type { YanivPlayer, YanivGameSettings, YanivScoreEntry } from '../types';
import { getHandValue } from './discard-validation';

export interface RoundResult {
  entries: YanivScoreEntry[];
  winnerSeat: number;
  isAssaf: boolean;
}

/**
 * Compute scores for a completed Yaniv round.
 *
 * Rules:
 * - Declarer reveals hand. All other active players reveal hands.
 * - If declarer has the lowest (or tied lowest) value: declarer wins with 0 points.
 *   All other active players score their hand value.
 * - If someone else has <= declarer's value: "Assaf!"
 *   Declarer scores: penalty + hand value.
 *   The lowest-value other player wins (0 points).
 *   All other losers score their hand value.
 * - Fifty reduction: if cumulative score hits an exact multiple of 50 (and > 50),
 *   subtract 50 (or halve if australianReduction).
 * - Ofer: if declarer gets assafed, they are immediately eliminated
 *   (only if ofer setting is enabled).
 * - Elimination: if a player exceeds scoreLimit, they are eliminated.
 */
export function computeYanivRoundScores(
  players: YanivPlayer[],
  declarerSeat: number,
  settings: YanivGameSettings,
  previousScoreboard: YanivScoreEntry[][],
): RoundResult {
  const activePlayers = players.filter((p) => !p.eliminated);
  const declarerHandValue = getHandValue(players[declarerSeat].hand);

  // Find the minimum hand value among non-declarer active players
  let minOtherValue = Infinity;
  for (const p of activePlayers) {
    if (p.seat === declarerSeat) continue;
    const hv = getHandValue(p.hand);
    if (hv < minOtherValue) {
      minOtherValue = hv;
    }
  }

  // Determine if Assaf occurred: someone else has value <= declarer's value
  const isAssaf = minOtherValue <= declarerHandValue;

  // Determine winner seat
  let winnerSeat: number;
  if (isAssaf) {
    // The lowest-value other player wins. In case of tie, pick the first in seat order
    // starting from the seat after the declarer (clockwise).
    let bestVal = Infinity;
    let bestSeat = -1;
    for (let i = 1; i < players.length; i++) {
      const seat = (declarerSeat + i) % players.length;
      const p = players[seat];
      if (p.eliminated) continue;
      const hv = getHandValue(p.hand);
      if (hv < bestVal) {
        bestVal = hv;
        bestSeat = seat;
      }
    }
    winnerSeat = bestSeat;
  } else {
    winnerSeat = declarerSeat;
  }

  // Get previous cumulative scores
  const prevCumulativeScores: number[] = players.map((p) => {
    if (previousScoreboard.length === 0) return 0;
    const lastRound = previousScoreboard[previousScoreboard.length - 1];
    const entry = lastRound.find((e) => e.seat === p.seat);
    return entry ? entry.cumulativeScore : 0;
  });

  // Build score entries
  const entries: YanivScoreEntry[] = players.map((p) => {
    const handValue = getHandValue(p.hand);
    let roundScore: number;
    let wasAssafed = false;

    if (p.eliminated) {
      // Eliminated players score 0 this round (they aren't playing)
      return {
        seat: p.seat,
        handValue: 0,
        roundScore: 0,
        cumulativeScore: prevCumulativeScores[p.seat],
        wasAssafed: false,
        declaredYaniv: false,
        eliminated: true,
        reductionApplied: 0,
      };
    }

    if (p.seat === winnerSeat) {
      roundScore = 0;
    } else if (isAssaf && p.seat === declarerSeat) {
      // Declarer got assafed: penalty + hand value
      roundScore = settings.assafPenalty + handValue;
      wasAssafed = true;
    } else {
      // Regular loser: hand value
      roundScore = handValue;
    }

    let cumulativeScore = prevCumulativeScores[p.seat] + roundScore;
    let reductionApplied = 0;

    // Fifty reduction: at exact multiples of 50, where cumulative > 50
    if (settings.fiftyReduction && cumulativeScore > 50 && cumulativeScore % 50 === 0) {
      if (settings.australianReduction) {
        // Halve the score instead of subtracting 50
        const reduction = Math.floor(cumulativeScore / 2);
        reductionApplied = reduction;
        cumulativeScore = cumulativeScore - reduction;
      } else {
        reductionApplied = 50;
        cumulativeScore -= 50;
      }
    }

    // Check ofer: if declarer was assafed and ofer mode is on, eliminate
    let eliminated: boolean = p.eliminated;
    if (settings.ofer && wasAssafed) {
      eliminated = true;
    }

    // Check elimination by score limit
    if (settings.eliminationMode && cumulativeScore > settings.scoreLimit) {
      eliminated = true;
    }

    return {
      seat: p.seat,
      handValue,
      roundScore,
      cumulativeScore,
      wasAssafed,
      declaredYaniv: p.seat === declarerSeat,
      eliminated,
      reductionApplied,
    };
  });

  return { entries, winnerSeat, isAssaf };
}

/**
 * Check if the game is over.
 * The game ends when:
 * - In elimination mode: only 1 player remains.
 * - In non-elimination mode: any player exceeds the score limit.
 */
export function isGameOver(entries: YanivScoreEntry[], settings: YanivGameSettings): boolean {
  if (settings.eliminationMode) {
    const activePlayers = entries.filter((e) => !e.eliminated);
    return activePlayers.length <= 1;
  } else {
    return entries.some((e) => e.cumulativeScore > settings.scoreLimit);
  }
}

/**
 * Get the final winner(s) of the game.
 * The player(s) with the lowest cumulative score among non-eliminated players.
 */
export function getGameWinners(entries: YanivScoreEntry[]): number[] {
  const active = entries.filter((e) => !e.eliminated);
  if (active.length === 0) return [];

  const minScore = Math.min(...active.map((e) => e.cumulativeScore));
  return active.filter((e) => e.cumulativeScore === minScore).map((e) => e.seat);
}
