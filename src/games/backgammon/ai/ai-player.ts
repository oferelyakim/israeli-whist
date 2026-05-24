import type { BackgammonAction, BackgammonGameState, BgColor, BgState } from '../types';
import { getLegalMoves, isInHomeBoard, isRunningGame, pipCount } from '../engine/board';
import { backgammonReducer } from '../engine/game-reducer';

// ---------------------------------------------------------------------------
// Phase detection
// ---------------------------------------------------------------------------

/** Count quadrant-boundary crossovers a color's checkers still need to make. */
function countCrossovers(
  board: BgState['board'],
  bar: BgState['bar'],
  color: BgColor
): number {
  let cross = 0;
  if (color === 'white') {
    cross += bar.white * 4;
    for (let i = 0; i < 24; i++) {
      if (board[i].color === 'white' && board[i].count > 0) {
        // Quadrant distance: idx 0-5 = home (0), 6-11 = 1, 12-17 = 2, 18-23 = 3
        cross += board[i].count * Math.floor(i / 6);
      }
    }
  } else {
    cross += bar.black * 4;
    for (let i = 0; i < 24; i++) {
      if (board[i].color === 'black' && board[i].count > 0) {
        cross += board[i].count * Math.floor((23 - i) / 6);
      }
    }
  }
  return cross;
}

// ---------------------------------------------------------------------------
// Race evaluator
// ---------------------------------------------------------------------------

function evaluateRace(state: BgState, color: BgColor): number {
  const opp: BgColor = color === 'white' ? 'black' : 'white';

  const myPips  = pipCount(state.board, state.bar, color);
  const oppPips = pipCount(state.board, state.bar, opp);

  let score = (oppPips - myPips) * 1.0; // pip lead is everything in a race

  // Crossovers: fewer is better
  const myCross  = countCrossovers(state.board, state.bar, color);
  const oppCross = countCrossovers(state.board, state.bar, opp);
  score += (oppCross - myCross) * 0.5;

  // Bearing-off progress
  score += (state.off[color] - state.off[opp]) * 2.0;

  // Home board distribution: spread checkers across low points (easier to bear off)
  const homeStart = color === 'white' ? 0 : 18;
  const homeEnd   = color === 'white' ? 5 : 23;
  let highestOccupied = homeStart;
  for (let i = homeStart; i <= homeEnd; i++) {
    if (state.board[i].color === color && state.board[i].count > 0) highestOccupied = i;
  }
  // Penalise having checkers stacked on the highest point (wasteful in a race)
  const highPoint = state.board[highestOccupied];
  if (highPoint.color === color && highPoint.count > 2) {
    score -= (highPoint.count - 2) * 0.3;
  }

  return score;
}

// ---------------------------------------------------------------------------
// Contact evaluator
// ---------------------------------------------------------------------------

/**
 * Count "shot" weight: opponent checkers that can hit our blot at `blotIdx`.
 * Direct (dist 1-6): weight 1.5 per attacker; indirect (7-12): 0.5.
 */
function blotExposure(state: BgState, blotIdx: number, blotColor: BgColor): number {
  const opp: BgColor = blotColor === 'white' ? 'black' : 'white';
  let exposure = 0;

  for (let dist = 1; dist <= 12; dist++) {
    // Attacker position: black attacks white from below, white attacks black from above
    const attackerIdx = blotColor === 'white' ? blotIdx - dist : blotIdx + dist;
    if (attackerIdx < 0 || attackerIdx >= 24) continue;
    if (state.board[attackerIdx].color === opp && state.board[attackerIdx].count > 0) {
      exposure += dist <= 6 ? 1.5 : 0.5;
    }
  }

  // Bar opponent: can enter and hit blots in opponent's home board
  if (state.bar[opp] > 0) {
    const barCanHit = blotColor === 'white' ? blotIdx >= 18 : blotIdx <= 5;
    if (barCanHit) exposure += state.bar[opp] * 1.0;
  }

  return exposure;
}

/** Length of longest consecutive prime (owned points with 2+ checkers). */
function longestPrime(board: BgState['board'], color: BgColor): number {
  let run = 0;
  let best = 0;
  for (let i = 0; i < 24; i++) {
    run = (board[i].color === color && board[i].count >= 2) ? run + 1 : 0;
    if (run > best) best = run;
  }
  return best;
}

/** Exponential value for a prime of length n (each extra point roughly doubles value). */
function primeScore(len: number): number {
  if (len <= 1) return len;
  // 2→2, 3→4, 4→8, 5→15, 6→25
  const table = [0, 1, 2, 4, 8, 15, 25];
  return table[Math.min(len, 6)];
}

/**
 * Value of an anchor (2+ checkers on a single point) in the opponent's home board.
 * Higher-numbered opponent home points (closer to opponent's 5-point) are more valuable.
 */
function anchorValue(idx: number, anchorColor: BgColor): number {
  if (anchorColor === 'white') {
    // White anchor in black's home (idx 18-23)
    // Black's 5-point = idx 19; 4-point = idx 20; 6-point = idx 18
    if (idx === 19) return 5;  // golden anchor (black's 5-point)
    if (idx === 20) return 4;  // black's 4-point
    if (idx === 18) return 3;  // black's 6-point
    return 2;
  } else {
    // Black anchor in white's home (idx 0-5)
    // White's 5-point = idx 4; 4-point = idx 3; 6-point = idx 5
    if (idx === 4) return 5;   // golden anchor (white's 5-point)
    if (idx === 3) return 4;
    if (idx === 5) return 3;
    return 2;
  }
}

function evaluateContact(state: BgState, color: BgColor): number {
  const opp: BgColor = color === 'white' ? 'black' : 'white';
  let score = 0;

  // 1. Pip count (less dominant than in race, but still matters)
  const myPips  = pipCount(state.board, state.bar, color);
  const oppPips = pipCount(state.board, state.bar, opp);
  score += (oppPips - myPips) * 0.4;

  // 2. Blot penalties (with exposure weighting)
  for (let i = 0; i < 24; i++) {
    if (state.board[i].color === color && state.board[i].count === 1) {
      const exposure = blotExposure(state, i, color);
      const inHome   = isInHomeBoard(i, color);
      // Base penalty: -3 outside home, -1 inside home; scaled by exposure
      const basePenalty = inHome ? 1 : 3;
      score -= basePenalty + exposure * 0.5;
    }
  }

  // 3. Made points (2+ checkers) — own board strength
  let ownMadePoints = 0;
  for (let i = 0; i < 24; i++) {
    if (state.board[i].color === color && state.board[i].count >= 2) {
      score += 2;
      ownMadePoints++;
      // Golden own 5-point bonus
      if ((color === 'white' && i === 4) || (color === 'black' && i === 19)) score += 4;
    }
  }

  // 4. Home board strength (consecutive made points in own home)
  const homeStart = color === 'white' ? 0 : 18;
  const homeEnd   = color === 'white' ? 5 : 23;
  let homePoints = 0;
  for (let i = homeStart; i <= homeEnd; i++) {
    if (state.board[i].color === color && state.board[i].count >= 2) homePoints++;
  }
  if (homePoints >= 4) score += 3; // near-closed board bonus

  // 5. Primes
  const prime = longestPrime(state.board, color);
  score += primeScore(prime);

  // 6. Anchors in opponent's home board
  const oppHomeStart = color === 'white' ? 18 : 0;
  const oppHomeEnd   = color === 'white' ? 23 : 5;
  let anchors = 0;
  for (let i = oppHomeStart; i <= oppHomeEnd; i++) {
    if (state.board[i].color === color && state.board[i].count >= 2) {
      score += anchorValue(i, color);
      anchors++;
    }
  }
  if (anchors >= 2) score += 3; // back-game bonus: two anchors = excellent timing

  // 7. Opponent blots and bar
  for (let i = 0; i < 24; i++) {
    if (state.board[i].color === opp && state.board[i].count === 1) {
      const exposure = blotExposure(state, i, opp);
      score += 1 + exposure * 0.3; // more valuable when we can actually hit them
    }
  }
  score += state.bar[opp] * 5;  // opponent on bar = great

  // 8. Own checkers on bar (bad)
  score -= state.bar[color] * 4;

  // 9. Bearing-off progress
  score += state.off[color] * 3;
  score -= state.off[opp]  * 3;

  // 10. Opponent prime penalty
  const oppPrime = longestPrime(state.board, opp);
  score -= primeScore(oppPrime);

  return score;
}

// ---------------------------------------------------------------------------
// Unified evaluator
// ---------------------------------------------------------------------------

function evaluatePosition(state: BgState, color: BgColor): number {
  if (state.winner === color) return 10000;
  if (state.winner !== null) return -10000;
  return isRunningGame(state)
    ? evaluateRace(state, color)
    : evaluateContact(state, color);
}

// ---------------------------------------------------------------------------
// Full-turn DFS
// ---------------------------------------------------------------------------

interface SeqResult {
  firstFrom: number | 'bar';
  firstTo: number;
  firstVia: number | undefined;
  score: number;
}

function bestSequence(
  gameState: BackgammonGameState,
  color: BgColor,
  limit: number,
  evalOrdering: boolean
): SeqResult | null {
  let best: SeqResult | null = null;
  let explored = 0;

  function dfs(
    gs: BackgammonGameState,
    firstFrom: number | 'bar' | null,
    firstTo: number | null,
    firstVia: number | undefined
  ): void {
    if (explored > limit) return;
    const st = gs.state;

    if (st.phase !== 'MOVING' || st.turn !== color) {
      const sc = evaluatePosition(st, color);
      if (best === null || sc > best.score) {
        best = { firstFrom: firstFrom!, firstTo: firstTo!, firstVia, score: sc };
      }
      return;
    }

    const moves = getLegalMoves(st, color);
    if (moves.length === 0) {
      const sc = evaluatePosition(st, color);
      if (best === null || sc > best.score) {
        best = { firstFrom: firstFrom!, firstTo: firstTo!, firstVia, score: sc };
      }
      return;
    }

    for (const m of moves) {
      explored++;
      const action: BackgammonAction = m.via !== undefined
        ? { type: 'COMBINED_MOVE', from: m.from, via: m.via, to: m.to }
        : { type: 'MOVE_CHECKER', from: m.from, to: m.to };
      const next = backgammonReducer(gs, action);
      dfs(
        next,
        firstFrom ?? m.from,
        firstTo ?? m.to,
        firstFrom === null ? m.via : firstVia
      );
      if (explored > limit) return;
    }
  }

  const initMoves = getLegalMoves(gameState.state, color);
  const opp: BgColor = color === 'white' ? 'black' : 'white';

  function quickScore(m: typeof initMoves[0]): number {
    if (m.to === -1) return 3; // bear-off
    const targetPoint = gameState.state.board[m.to];
    if (targetPoint.color === opp && targetPoint.count === 1) return 2; // hit
    if (targetPoint.color === color && targetPoint.count >= 1) return 1; // make point
    return 0;
  }

  // Hard mode: rank first-level moves by 1-ply evaluation so the DFS
  // explores the most promising lines first and prunes poor ones earlier.
  const sortedMoves = evalOrdering
    ? [...initMoves].sort((a, b) => {
        const applyFirst = (m: typeof initMoves[0]): number => {
          const action: BackgammonAction = m.via !== undefined
            ? { type: 'COMBINED_MOVE', from: m.from, via: m.via, to: m.to }
            : { type: 'MOVE_CHECKER', from: m.from, to: m.to };
          return evaluatePosition(backgammonReducer(gameState, action).state, color);
        };
        return applyFirst(b) - applyFirst(a);
      })
    : [...initMoves].sort((a, b) => quickScore(b) - quickScore(a));

  for (const m of sortedMoves) {
    explored++;
    const action: BackgammonAction = m.via !== undefined
      ? { type: 'COMBINED_MOVE', from: m.from, via: m.via, to: m.to }
      : { type: 'MOVE_CHECKER', from: m.from, to: m.to };
    const next = backgammonReducer(gameState, action);
    dfs(next, m.from, m.to, m.via);
    if (explored > limit) break;
  }

  return best;
}

// ---------------------------------------------------------------------------
// Per-move heuristic (used only for tie-breaking in legacy code path)
// ---------------------------------------------------------------------------

function scoreMoveHeuristic(
  gameState: BackgammonGameState,
  from: number | 'bar',
  to: number
): number {
  const state = gameState.state;
  const color = state.turn;
  const opp: BgColor = color === 'white' ? 'black' : 'white';

  const nextGs    = backgammonReducer(gameState, { type: 'MOVE_CHECKER', from, to });
  const nextState = nextGs.state;

  if (nextState.winner === color) return 10000;

  const before = pipCount(state.board, state.bar, color);
  const after  = pipCount(nextState.board, nextState.bar, color);
  let score = before - after;

  if (to !== -1 && state.board[to].color === opp && state.board[to].count === 1) score += 8;
  if (to !== -1 && nextState.board[to].count === 1 && nextState.board[to].color === color) {
    score -= isInHomeBoard(to, color) ? 1 : 4;
  }
  const leftN  = to > 0  ? nextState.board[to - 1] : null;
  const rightN = to < 23 ? nextState.board[to + 1] : null;
  if (
    (leftN?.color === color  && (leftN.count  ?? 0) >= 1) ||
    (rightN?.color === color && (rightN.count ?? 0) >= 1)
  ) score += 3;

  return score;
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function getBgAIAction(
  gameState: BackgammonGameState,
  difficulty: 1 | 2 | 3 = 2
): BackgammonAction | null {
  const bgState = gameState.state;

  if (bgState.phase === 'GAME_OVER') return null;

  if (bgState.phase === 'ROLLING') {
    return { type: 'ROLL_DICE', seed: (Math.random() * 1e9) | 0 };
  }

  const color      = bgState.turn;
  const legalMoves = getLegalMoves(bgState, color);

  if (legalMoves.length === 0) return { type: 'PASS_TURN' };

  // Low: DFS with small node budget + heuristic fallback (was Medium)
  if (difficulty === 1) {
    const seq = bestSequence(gameState, color, 400, false);
    if (!seq) {
      let bestScore = -Infinity;
      let bestMove  = legalMoves[0];
      for (const move of legalMoves) {
        if (move.via !== undefined) continue;
        const sc = scoreMoveHeuristic(gameState, move.from, move.to);
        if (sc > bestScore) { bestScore = sc; bestMove = move; }
      }
      return bestMove.via !== undefined
        ? { type: 'COMBINED_MOVE', from: bestMove.from, via: bestMove.via, to: bestMove.to }
        : { type: 'MOVE_CHECKER', from: bestMove.from, to: bestMove.to };
    }
    return seq.firstVia !== undefined
      ? { type: 'COMBINED_MOVE', from: seq.firstFrom, via: seq.firstVia, to: seq.firstTo }
      : { type: 'MOVE_CHECKER', from: seq.firstFrom, to: seq.firstTo };
  }

  // Medium: DFS 2000 nodes + categorical move ordering (was Hard)
  if (difficulty === 2) {
    const seq = bestSequence(gameState, color, 2000, false);
    if (!seq) return { type: 'PASS_TURN' };
    return seq.firstVia !== undefined
      ? { type: 'COMBINED_MOVE', from: seq.firstFrom, via: seq.firstVia, to: seq.firstTo }
      : { type: 'MOVE_CHECKER', from: seq.firstFrom, to: seq.firstTo };
  }

  // Hard: DFS 5000 nodes + 1-ply evaluation-based move ordering
  const seq = bestSequence(gameState, color, 5000, true);
  if (!seq) return { type: 'PASS_TURN' };
  return seq.firstVia !== undefined
    ? { type: 'COMBINED_MOVE', from: seq.firstFrom, via: seq.firstVia, to: seq.firstTo }
    : { type: 'MOVE_CHECKER', from: seq.firstFrom, to: seq.firstTo };
}
