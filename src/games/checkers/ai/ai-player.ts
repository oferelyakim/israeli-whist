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

const MINIMAX_DEPTH = 5;

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
  isMaximizing: boolean
): number {
  if (depth === 0) return evaluate(board);

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
        // Multi-jump: same player continues
        value = minimax(nextBoard, turn, depth - 1, alpha, beta, isMaximizing);
      } else {
        if (!hasAnyMoves(nextBoard, opponent(turn))) {
          value = Infinity;
        } else {
          value = minimax(nextBoard, opponent(turn), depth - 1, alpha, beta, false);
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
        value = minimax(nextBoard, turn, depth - 1, alpha, beta, isMaximizing);
      } else {
        if (!hasAnyMoves(nextBoard, opponent(turn))) {
          value = -Infinity;
        } else {
          value = minimax(nextBoard, opponent(turn), depth - 1, alpha, beta, true);
        }
      }

      best = Math.min(best, value);
      beta = Math.min(beta, best);
      if (beta <= alpha) break;
    }
    return best;
  }
}

export function getCheckersAIAction(state: CheckersGameState): CheckersAction | null {
  const { board, turn } = state.state;

  const moves = generateMoves(board, turn);
  if (moves.length === 0) return null;

  // Black maximizes, red minimizes (evaluation: positive = red advantage)
  const isMaximizing = turn === 'black';

  let bestMove = moves[0];
  let bestScore = isMaximizing ? -Infinity : Infinity;

  for (const move of moves) {
    const { board: nextBoard, continueFrom } = applyMoveForAI(board, move);

    let score: number;
    if (continueFrom !== null) {
      score = minimax(nextBoard, turn, MINIMAX_DEPTH - 1, -Infinity, Infinity, isMaximizing);
    } else {
      const nextTurn = opponent(turn);
      if (!hasAnyMoves(nextBoard, nextTurn)) {
        score = isMaximizing ? Infinity : -Infinity;
      } else {
        score = minimax(nextBoard, nextTurn, MINIMAX_DEPTH - 1, -Infinity, Infinity, !isMaximizing);
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
