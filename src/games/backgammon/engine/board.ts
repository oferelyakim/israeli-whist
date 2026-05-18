import type { BgColor, BgMove, BgPoint, BgState } from '../types';

export function createInitialBoard(): BgPoint[] {
  const board: BgPoint[] = Array.from({ length: 24 }, () => ({ color: null, count: 0 }));

  // Standard backgammon setup (white moves index 23→0, black moves index 0→23)
  board[0]  = { color: 'black', count: 2 };  // point 1  — black anchor in white's home
  board[5]  = { color: 'white', count: 5 };  // point 6  — white home prime
  board[7]  = { color: 'white', count: 3 };  // point 8  — white mid
  board[11] = { color: 'black', count: 5 };  // point 12 — black outer
  board[12] = { color: 'white', count: 5 };  // point 13 — white outer
  board[16] = { color: 'black', count: 3 };  // point 17 — black mid
  board[18] = { color: 'black', count: 5 };  // point 19 — black home prime
  board[23] = { color: 'white', count: 2 };  // point 24 — white anchor in black's home

  return board;
}

export function pipCount(
  board: BgPoint[],
  bar: { white: number; black: number },
  color: BgColor
): number {
  let total = 0;

  for (let i = 0; i < 24; i++) {
    const point = board[i];
    if (point.color === color && point.count > 0) {
      const pips = color === 'white' ? i + 1 : 24 - i;
      total += pips * point.count;
    }
  }

  const barCount = bar[color];
  if (barCount > 0) {
    total += 25 * barCount; // bar is always 25 pips away
  }

  return total;
}

export function isInHomeBoard(pointIdx: number, color: BgColor): boolean {
  if (color === 'white') return pointIdx >= 0 && pointIdx <= 5;
  return pointIdx >= 18 && pointIdx <= 23;
}

export function canBearOff(
  board: BgPoint[],
  bar: { white: number; black: number },
  color: BgColor
): boolean {
  if (bar[color] > 0) return false;

  for (let i = 0; i < 24; i++) {
    if (board[i].color === color && board[i].count > 0) {
      if (!isInHomeBoard(i, color)) return false;
    }
  }

  return true;
}

/** Returns true if no checker can be hit by either side (pure race). */
export function isRunningGame(state: BgState): boolean {
  if (state.bar.white > 0 || state.bar.black > 0) return false;

  let whiteMax = -1;
  let blackMin = 24;

  for (let i = 0; i < 24; i++) {
    if (state.board[i].color === 'white' && state.board[i].count > 0) whiteMax = i;
    if (state.board[i].color === 'black' && state.board[i].count > 0) blackMin = i;
  }

  // White moves 23→0, black moves 0→23.
  // No contact when every white checker index is below every black checker index.
  return whiteMax < blackMin;
}

function isBlocked(board: BgPoint[], pointIdx: number, movingColor: BgColor): boolean {
  const point = board[pointIdx];
  const opponent: BgColor = movingColor === 'white' ? 'black' : 'white';
  return point.color === opponent && point.count >= 2;
}

function deduplicateMoves(moves: BgMove[]): BgMove[] {
  const seen = new Set<string>();
  return moves.filter((m) => {
    const key = `${m.from}:${m.to}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Compute the board index after moving `pip` steps from `from`.
 * Returns null if the source has no checker of `color`.
 * Returns -1 for a bear-off destination.
 * Returns undefined if the intermediate/target is out of bounds (no valid landing).
 */
function stepTarget(
  from: number | 'bar',
  pip: number,
  color: BgColor
): number | null {
  if (from === 'bar') {
    // Bar entry: white → 24-pip, black → pip-1
    const idx = color === 'white' ? 24 - pip : pip - 1;
    if (idx < 0 || idx >= 24) return null;
    return idx;
  }

  if (color === 'white') {
    const target = from - pip;
    // Bear-off territory
    if (target < 0) return -1;
    return target;
  } else {
    const target = from + pip;
    if (target >= 24) return -1;
    return target;
  }
}

/** Single-die moves for one specific pip value. */
function getMovesForDie(
  board: BgPoint[],
  bar: { white: number; black: number },
  color: BgColor,
  pip: number
): BgMove[] {
  const moves: BgMove[] = [];

  // Must enter from bar first
  if (bar[color] > 0) {
    const entryIndex = color === 'white' ? 24 - pip : pip - 1;
    if (entryIndex >= 0 && entryIndex < 24 && !isBlocked(board, entryIndex, color)) {
      moves.push({ from: 'bar', to: entryIndex });
    }
    return moves;
  }

  const bearOff = canBearOff(board, bar, color);

  for (let i = 0; i < 24; i++) {
    if (board[i].color !== color || board[i].count === 0) continue;

    if (color === 'white') {
      const target = i - pip;
      if (target < 0) {
        if (bearOff) {
          if (target === -1) {
            moves.push({ from: i, to: -1 });
          } else {
            // Overshoot bear-off: only legal if no checker sits on a higher home point
            const hasHigher = board.slice(i + 1, 6).some((p) => p.color === color && p.count > 0);
            if (!hasHigher) moves.push({ from: i, to: -1 });
          }
        }
      } else if (!isBlocked(board, target, color)) {
        moves.push({ from: i, to: target });
      }
    } else {
      const target = i + pip;
      if (target >= 24) {
        if (bearOff) {
          if (target === 24) {
            moves.push({ from: i, to: -1 });
          } else {
            const hasHigher = board.slice(18, i).some((p) => p.color === color && p.count > 0);
            if (!hasHigher) moves.push({ from: i, to: -1 });
          }
        }
      } else if (!isBlocked(board, target, color)) {
        moves.push({ from: i, to: target });
      }
    }
  }

  return moves;
}

/**
 * Combined 2-die moves: move a single checker using both dice in one action.
 * The intermediate point (`via`) must be open; the final point must be open.
 * These extend the reachable destinations without requiring two separate clicks.
 */
function getCombinedMoves(
  board: BgPoint[],
  bar: { white: number; black: number },
  color: BgColor,
  dice: number[]
): BgMove[] {
  if (dice.length < 2) return [];

  const moves: BgMove[] = [];
  const triedPairs = new Set<string>();

  for (let i = 0; i < dice.length; i++) {
    for (let j = 0; j < dice.length; j++) {
      if (i === j) continue;
      const pip1 = dice[i];
      const pip2 = dice[j];
      // For non-doubles each pair is tried twice (pip1,pip2) and (pip2,pip1);
      // deduplicate by sorted pair since the combined destination is the same.
      const pairKey = `${Math.min(pip1, pip2)}-${Math.max(pip1, pip2)}`;
      if (triedPairs.has(pairKey)) continue;
      triedPairs.add(pairKey);

      // Determine sources
      const sources: Array<number | 'bar'> = [];
      if (bar[color] > 0) {
        sources.push('bar');
      } else {
        for (let k = 0; k < 24; k++) {
          if (board[k].color === color && board[k].count > 0) sources.push(k);
        }
      }

      for (const from of sources) {
        // Try pip1 first then pip2, and pip2 first then pip1
        for (const [first, second] of [[pip1, pip2], [pip2, pip1]]) {
          const viaRaw = stepTarget(from, first, color);
          if (viaRaw === null || viaRaw === -1) continue; // bear-off can't be intermediate
          const via = viaRaw;
          if (isBlocked(board, via, color)) continue;

          // Simulate stepping onto via (may hit opponent blot — board changes)
          const opp: BgColor = color === 'white' ? 'black' : 'white';
          const boardAfterStep1 = board.map((p) => ({ ...p }));
          // Lift from source
          if (from === 'bar') {
            // bar handled separately — just check the entry point validity
          } else {
            boardAfterStep1[from] = {
              color: boardAfterStep1[from].count === 1 ? null : color,
              count: boardAfterStep1[from].count - 1,
            };
          }
          // Hit or land at via
          if (boardAfterStep1[via].color === opp && boardAfterStep1[via].count === 1) {
            boardAfterStep1[via] = { color: color, count: 1 };
          } else {
            boardAfterStep1[via] = {
              color: color,
              count: (boardAfterStep1[via].color === color ? boardAfterStep1[via].count : 0) + 1,
            };
          }

          // Now check step 2 from via
          const toRaw = stepTarget(via, second, color);
          if (toRaw === null) continue;
          const to = toRaw;

          if (to === -1) {
            // Bear-off via combined move: only if player can bear off
            if (!canBearOff(board, bar, color)) continue;
            // Overshoot bear-off check from via using second die
            if (color === 'white') {
              if (via - second < -1) {
                const hasHigher = boardAfterStep1.slice(via + 1, 6).some((p) => p.color === color && p.count > 0);
                if (hasHigher) continue;
              }
            } else {
              if (via + second > 24) {
                const hasHigher = boardAfterStep1.slice(18, via).some((p) => p.color === color && p.count > 0);
                if (hasHigher) continue;
              }
            }
          } else {
            if (isBlocked(boardAfterStep1, to, color)) continue;
          }

          moves.push({ from, to, via });
          // Only need one valid via per (from, to) pair — break inner loop
          break;
        }
      }
    }
  }

  return moves;
}

export function getLegalMoves(state: BgState, color: BgColor): BgMove[] {
  const { board, bar, dice } = state;

  if (dice.length === 0) return [];

  const uniqueDice = [...new Set(dice)];
  const allMoves: BgMove[] = [];

  // Single-die moves
  for (const pip of uniqueDice) {
    const moves = getMovesForDie(board, bar, color, pip);
    allMoves.push(...moves);
  }

  // Combined 2-die moves (only when not on bar, and at least 2 dice remain)
  if (dice.length >= 2 && bar[color] === 0) {
    const combined = getCombinedMoves(board, bar, color, dice);
    allMoves.push(...combined);
  }

  return deduplicateMoves(allMoves);
}
