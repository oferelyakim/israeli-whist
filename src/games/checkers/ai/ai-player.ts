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

const DEPTH_BY_DIFFICULTY: Record<1 | 2 | 3, number> = { 1: 2, 2: 4, 3: 6 };

// Standard evaluation used at Easy/Medium depth
function evaluate(board: Board): number {
  const { red, redKings, black, blackKings } = countPieces(board);
  let score = (red * 1.0 + redKings * 1.5) - (black * 1.0 + blackKings * 1.5);

  // Center bonus: rows 3-4, cols 2-5
  for (let row = 3; row <= 4; row++) {
    for (let col = 2; col <= 5; col++) {
      const cell = board[row][col];
      if (cell) {
        score += cell.color === 'red' ? 0.1 : -0.1;
      }
    }
  }

  return score;
}

// Richer evaluation used at Hard depth (kings worth more, positional bonuses)
function evaluateHard(board: Board): number {
  const { red, redKings, black, blackKings } = countPieces(board);
  let score = (red * 1.0 + redKings * 1.65) - (black * 1.0 + blackKings * 1.65);

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece) continue;
      const sign = piece.color === 'red' ? 1 : -1;

      if (!piece.king) {
        // Advancement: closer to promotion row = more valuable
        const advance = piece.color === 'red' ? (7 - row) : row;
        score += sign * advance * 0.04;
        // Back-row anchor: last piece in back row prevents easy promotions
        const isBack = piece.color === 'red' ? row === 7 : row === 0;
        if (isBack) score += sign * 0.25;
      } else {
        // King centrality: central kings control more squares
        const centerDist = Math.abs(row - 3.5) + Math.abs(col - 3.5);
        score += sign * (7 - centerDist) * 0.04;
      }

      // Broad center bonus for all pieces
      if (row >= 2 && row <= 5 && col >= 2 && col <= 5) {
        score += sign * 0.12;
      }
    }
  }

  return score;
}

interface Move {
  fromRow: number;
  fromCol: number;
  toRow: number;
  toCol: number;
}

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

function opponent(color: PieceColor): PieceColor {
  return color === 'red' ? 'black' : 'red';
}

// Apply a single move and return new board + whether a multi-jump continues from (toRow, toCol)
function applyMoveForAI(
  board: Board,
  move: Move
): { board: Board; continueFrom: [number, number] | null } {
  const { board: newBoard, captured } = applyMove(
    board,
    move.fromRow,
    move.fromCol,
    move.toRow,
    move.toCol
  );
  const continueFrom: [number, number] | null =
    captured && getCaptureMoves(newBoard, move.toRow, move.toCol).length > 0
      ? [move.toRow, move.toCol]
      : null;

  return { board: newBoard, continueFrom };
}

// Minimax: maximizing = black's perspective (AI is black by default, but evaluation is symmetric)
// The caller decides which side to maximize based on the turn.
function minimax(
  board: Board,
  turn: PieceColor,
  depth: number,
  alpha: number,
  beta: number,
  isMaximizing: boolean,
  useHardEval: boolean
): number {
  if (depth === 0) return useHardEval ? evaluateHard(board) : evaluate(board);

  const moves = generateMoves(board, turn);
  if (moves.length === 0) {
    // Current player has no moves — they lose
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
