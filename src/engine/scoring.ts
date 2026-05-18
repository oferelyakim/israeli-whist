import type { ScoreEntry, Player } from '../types/game';

export function calculateRoundScore(
  bid: number,
  tricksTaken: number,
  totalBids: number
): number {
  if (bid === 0) {
    return calculateZeroBidScore(tricksTaken, totalBids);
  }

  if (tricksTaken === bid) {
    // Exact: bid² + 10
    return bid * bid + 10;
  }

  // Miss: -10 per trick off
  return -10 * Math.abs(tricksTaken - bid);
}

export function calculateZeroBidScore(
  tricksTaken: number,
  totalBids: number
): number {
  const isOverGame = totalBids > 13;

  if (tricksTaken === 0) {
    // Made it
    return isOverGame ? 30 : 50;
  }

  if (isOverGame) {
    // Failed zero bid in over game: flat -30
    return -30;
  }

  // Failed zero bid in under game: -50 for 1, -40 for 2, -30 for 3, etc.
  // Formula: -50 + (tricksTaken - 1) * 10
  return -50 + (tricksTaken - 1) * 10;
}

export function computeRoundScores(
  players: Player[],
  totalBids: number,
  previousScoreboard: ScoreEntry[][]
): ScoreEntry[] {
  const previousRound = previousScoreboard.length > 0
    ? previousScoreboard[previousScoreboard.length - 1]
    : null;

  return players.map((player) => {
    const bid = player.bid ?? 0;
    const roundScore = calculateRoundScore(bid, player.tricksWon, totalBids);
    const prevCumulative = previousRound
      ? previousRound.find((e) => e.seat === player.seat)?.cumulativeScore ?? 0
      : 0;

    return {
      seat: player.seat,
      bid,
      tricksTaken: player.tricksWon,
      roundScore,
      cumulativeScore: prevCumulative + roundScore,
      isZeroBid: bid === 0,
      totalBids,
    };
  });
}
