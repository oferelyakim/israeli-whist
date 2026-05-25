import type { CheckersAction, CheckersGameState, PieceColor } from '../types';
import type { Board } from '../types';
import {
  getAllForcedPieces,
  getCaptureMoves,
  getRegularMoves,
  applyMove,
  hasAnyMoves,
  countPieces,
} from '../engine/board';

// Hard uses depth 7 + quiescence search; Easy/Medium use shallower depth, simpler eval
const DEPTH_BY_DIFFICULTY: Record<1 | 2 | 3, number> = { 1: 2, 2: 4, 3: 7 };

// At leaf nodes for Hard, extend the search up to this many extra plies
// but only for capture moves — prevents the horizon effect mid-exchange.
const QUIESCENCE_DEPTH = 4;

// ---------------------------------------------------------------------------
// Easy / Medium evaluation (piece count + basic center bonus)
// ---------------------------------------------------------------------------

function evaluate(board: Board): number {
  const { red, redKings, black, blackKings } = countPieces(board);
  let score = (red * 1.0 + redKings * 1.5) - (black * 1.0 + blackKings * 1.5);

  for (let row = 3; row <= 4; row++) {
    for (let col = 2; col <= 5; col++) {
      const cell = board[row][col];
      if (cell) score += cell.color === 'red' ? 0.1 : -0.1;
    }
  }
  return score;
}

// ---------------------------------------------------------------------------
// Hard evaluation helpers
// ---------------------------------------------------------------------------

/** Count pieces of `color` that can be immediately captured by the opponent. */
function countHanging(board: Board, color: PieceColor): number {
  const opp: PieceColor = color === 'red' ? 'black' : 'red';
  const threatened = new Set<string>();
  for (const [fromRow, fromCol] of getAllForcedPieces(board, opp)) {
    for (const [toRow, toCol] of getCaptureMoves(board, fromRow, fromCol)) {
      // The captured piece sits between from and to
      const midRow = (fromRow + toRow) / 2;
      const midCol = (fromCol + toCol) / 2;
      threatened.add(`${midRow},${midCol}`);
    }
  }
  return threatened.size;
}

/** Number of legal moves available to `color`. Used for mobility comparison. */
function mobilityCount(board: Board, color: PieceColor): number {
  const forced = getAllForcedPieces(board, color);
  if (forced.length > 0) {
    let count = 0;
    for (const [r, c] of forced) count += getCaptureMoves(board, r, c).length;
    return count;
  }
  let count = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.color === color) count += getRegularMoves(board, r, c).length;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Hard evaluation (richer positional + tactical terms)
// ---------------------------------------------------------------------------

function evaluateHard(board: Board): number {
  const { red, redKings, black, blackKings } = countPieces(board);

  // 1. Material — kings worth 1.8× (4 move directions vs 2 for regular pieces)
  let score = (red * 1.0 + redKings * 1.8) - (black * 1.0 + blackKings * 1.8);

  // 2. Positional features per piece
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;
      const sign = piece.color === 'red' ? 1 : -1;

      if (!piece.king) {
        // Tempo — pieces close to promotion are much more valuable.
        // Red promotes at row 0; black promotes at row 7.
        const rowsToKing = piece.color === 'red' ? row : 7 - row;
        if (rowsToKing === 1) score += sign * 0.7;  // one move from becoming king
        else if (rowsToKing === 2) score += sign * 0.2;

        // Back-row anchor — keeping a piece in its own back row prevents the
        // opponent from freely promoting through that row.
        const isOwnBack = piece.color === 'red' ? row === 7 : row === 0;
        if (isOwnBack) score += sign * 0.35;
      } else {
        // King centrality — central kings cover 4 diagonals; corner kings cover 2.
        const centerDist = Math.abs(row - 3.5) + Math.abs(col - 3.5);
        score += sign * (7 - centerDist) * 0.07;
      }

      // Center control — pieces in the center rows/cols constrain opponent movement.
      if (row >= 3 && row <= 4 && col >= 2 && col <= 5) {
        score += sign * 0.2;   // core 4 center squares
      } else if (row >= 2 && row <= 5 && col >= 1 && col <= 6) {
        score += sign * 0.07;  // extended center
      }
    }
  }

  // 3. Mobility — more legal moves = more control and flexibility.
  const redMobility  = mobilityCount(board, 'red');
  const blackMobility = mobilityCount(board, 'black');
  score += (redMobility - blackMobility) * 0.1;

  // 4. Piece safety — penalize immediately capturable (hanging) pieces.
  //    The search handles tactical exchanges, but this nudges the AI away
  //    from leaving pieces en prise at positions the depth doesn't reach.
  const redHanging   = countHanging(board, 'red');
  const blackHanging = countHanging(board, 'black');
  score += (blackHanging - redHanging) * 0.4;

  return score;
}

// ---------------------------------------------------------------------------
// Quiescence search — extends leaf nodes when captures are available.
// This prevents the horizon effect: the AI won't stop evaluation mid-exchange
// and falsely think it's ahead because it can't see the reply capture.
// ---------------------------------------------------------------------------

interface Move {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

function applyMoveForAI(
  board: Board,
  move: Move
): { board: Board; continueFrom: [number, number] | null } {
  const { board: newBoard, captured } = applyMove(
    board, move.fromRow, move.fromCol, move.toRow, move.toCol
  );
  const continueFrom: [number, number] | null =
    captured && getCaptureMoves(newBoard, move.toRow, move.toCol).length > 0
      ? [move.toRow, move.toCol]
      : null;
  return { board: newBoard, continueFrom };
}

function opponent(color: PieceColor): PieceColor {
  return color === 'red' ? 'black' : 'red';
}

function quiescence(
  board: Board,
  turn: PieceColor,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  depth: number
): number {
  // Stand-pat score: what we get if we stop searching now.
  const standPat = evaluateHard(board);

  if (isMaximizing) {
    if (standPat >= beta) return standPat;  // fail-hard beta cutoff
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return standPat; // fail-hard alpha cutoff
    if (standPat < beta) beta = standPat;
  }

  if (depth === 0) return standPat;

  // Only expand forced capture moves — stop at quiet positions.
  const forced = getAllForcedPieces(board, turn);
  if (forced.length === 0) return standPat;

  const captureMoves: Move[] = [];
  for (const [row, col] of forced) {
    for (const [toRow, toCol] of getCaptureMoves(board, row, col)) {
      captureMoves.push({ fromRow: row, fromCol: col, toRow, toCol });
    }
  }

  let best = standPat;
  for (const move of captureMoves) {
    const { board: nextBoard, continueFrom } = applyMoveForAI(board, move);
    const value = continueFrom !== null
      // Multi-jump: same player continues
      ? quiescence(nextBoard, turn, alpha, beta, isMaximizing, depth - 1)
      : quiescence(nextBoard, opponent(turn), alpha, beta, !isMaximizing, depth - 1);

    if (isMaximizing) {
      if (value > best) best = value;
      if (best > alpha) alpha = best;
    } else {
      if (value < best) best = value;
      if (best < beta) beta = best;
    }
    if (beta <= alpha) break;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Move generation
// ---------------------------------------------------------------------------

function generateMoves(board: Board, turn: PieceColor): Move[] {
  const forced = getAllForcedPieces(board, turn);
  const moves: Move[] = [];

  if (forced.length > 0) {
    for (const [row, col] of forced) {
      for (const [toRow, toCol] of getCaptureMoves(board, row, col)) {
        moves.push({ fromRow: row, fromCol: col, toRow, toCol });
      }
    }
    return moves;
  }

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece || piece.color !== turn) continue;
      for (const [toRow, toCol] of getRegularMoves(board, row, col)) {
        moves.push({ fromRow: row, fromCol: col, toRow, toCol });
      }
    }
  }
  return moves;
}

// ---------------------------------------------------------------------------
// Minimax with alpha-beta pruning
// ---------------------------------------------------------------------------

function minimax(
  board: Board,
  turn: PieceColor,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  useHardEval: boolean
): number {
  if (depth === 0) {
    // Hard: run quiescence search to resolve any pending captures before evaluating
    if (useHardEval) return quiescence(board, turn, alpha, beta, isMaximizing, QUIESCENCE_DEPTH);
    return evaluate(board);
  }

  const moves = generateMoves(board, turn);
  if (moves.length === 0) {
    return isMaximizing ? -Infinity : Infinity;
  }

  if (isMaximizing) {
    let best = -Infinity;
    for (const move of moves) {
      const { board: nextBoard, continueFrom } = applyMoveForAI(board, move);
      let value: number;
      if (continueFrom !== null) {
        value = minimax(nextBoard, turn, depth - 1, alpha, beta, isMaximizing, useHardEval);
      } else {
        if (!hasAnyMoves(nextBoard, opponent(turn))) {
          value = Infinity;
        } else {
          value = minimax(nextBoard, opponent(turn), depth - 1, alpha, beta, false, useHardEval);
        }
      }
      best = Math.max(best, value);
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const move of moves) {
      const { board: nextBoard, continueFrom } = applyMoveForAI(board, move);
      let value: number;
      if (continueFrom !== null) {
        value = minimax(nextBoard, turn, depth - 1, alpha, beta, isMaximizing, useHardEval);
      } else {
        if (!hasAnyMoves(nextBoard, opponent(turn))) {
          value = -Infinity;
        } else {
          value = minimax(nextBoard, opponent(turn), depth - 1, alpha, beta, true, useHardEval);
        }
      }
      best = Math.min(best, value);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function getCheckersAIAction(
  state: CheckersGameState,
  difficulty: 1 | 2 | 3 = 2
): CheckersAction | null {
  const { board, turn } = state.state;

  const moves = generateMoves(board, turn);
  if (moves.length === 0) return null;

  const depth = DEPTH_BY_DIFFICULTY[difficulty];
  const useHardEval = difficulty === 3;

  // Black maximizes, red minimizes (evaluation: positive = red advantage)
  const isMaximizing = turn === 'black';

  let bestMove = moves[0];
  let bestScore = isMaximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const { board: nextBoard, continueFrom } = applyMoveForAI(board, move);

    let score: number;
    if (continueFrom !== null) {
      score = minimax(nextBoard, turn, depth - 1, -Infinity, Infinity, isMaximizing, useHardEval);
    } else {
      const nextTurn = opponent(turn);
      if (!hasAnyMoves(nextBoard, nextTurn)) {
        score = isMaximizing ? Infinity : -Infinity;
      } else {
        score = minimax(nextBoard, nextTurn, depth - 1, -Infinity, Infinity, !isMaximizing, useHardEval);
      }
    }

    if (isMaximizing ? score > bestScore : score < bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return {
    type: 'MOVE_PIECE',
    fromRow: bestMove.fromRow,
    fromCol: bestMove.fromCol,
    toRow: bestMove.toRow,
    toCol: bestMove.toCol,
  };
}
