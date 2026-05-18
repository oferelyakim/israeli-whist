import type { CheckersAction, CheckersGameState, CheckersSettings, CheckersState, PieceColor } from '../types';
import {
  createInitialBoard,
  getAllForcedPieces,
  getCaptureMoves,
  getRegularMoves,
  applyMove,
  hasAnyMoves,
} from './board';

function generateGameId(): string {
  return `checkers_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

function createInitialState(): CheckersState {
  const board = createInitialBoard();
  const forcedPieces = getAllForcedPieces(board, 'red');

  return {
    board,
    turn: 'red',
    phase: 'PLAYING',
    winner: null,
    selectedRow: null,
    selectedCol: null,
    forcedPieces,
    jumpingPiece: null,
    scores: { red: 0, black: 0 },
  };
}

export function createInitialCheckersState(settings: CheckersSettings): CheckersGameState {
  return {
    gameId: generateGameId(),
    state: createInitialState(),
    settings,
  };
}

function getLegalMovesForPiece(
  state: CheckersState,
  row: number,
  col: number
): Array<[number, number]> {
  const captureOptions = getCaptureMoves(state.board, row, col);
  if (captureOptions.length > 0) return captureOptions;

  // Only offer regular moves if there are no forced captures for any piece
  if (state.forcedPieces.length > 0) return [];

  return getRegularMoves(state.board, row, col);
}

function opponent(color: PieceColor): PieceColor {
  return color === 'red' ? 'black' : 'red';
}

function handleSelect(
  gameState: CheckersGameState,
  row: number,
  col: number
): CheckersGameState {
  const { state } = gameState;

  if (state.phase !== 'PLAYING') return gameState;

  const piece = state.board[row][col];
  if (!piece || piece.color !== state.turn) return gameState;

  // If there are forced captures, only forced pieces may be selected
  if (
    state.forcedPieces.length > 0 &&
    !state.forcedPieces.some(([fr, fc]) => fr === row && fc === col)
  ) {
    return gameState;
  }

  // During multi-jump only the jumping piece may be selected
  if (
    state.jumpingPiece !== null &&
    (state.jumpingPiece[0] !== row || state.jumpingPiece[1] !== col)
  ) {
    return gameState;
  }

  return {
    ...gameState,
    state: {
      ...state,
      selectedRow: row,
      selectedCol: col,
    },
  };
}

function handleMove(
  gameState: CheckersGameState,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number
): CheckersGameState {
  const { state } = gameState;

  if (state.phase !== 'PLAYING') return gameState;
  if (state.selectedRow === null || state.selectedCol === null) return gameState;

  // Verify the from position matches current selection
  if (fromRow !== state.selectedRow || fromCol !== state.selectedCol) return gameState;

  // Validate the destination is legal
  const legalLandings = getLegalMovesForPiece(state, fromRow, fromCol);
  const isLegal = legalLandings.some(([lr, lc]) => lr === toRow && lc === toCol);
  if (!isLegal) return gameState;

  const { board: newBoard, captured } = applyMove(state.board, fromRow, fromCol, toRow, toCol);

  // Check for continued multi-jump
  const canJumpAgain =
    captured && getCaptureMoves(newBoard, toRow, toCol).length > 0;

  let nextTurn = state.turn;
  let nextJumpingPiece: [number, number] | null = null;

  if (canJumpAgain) {
    nextJumpingPiece = [toRow, toCol];
    // Keep turn and forced pieces focused on the jumping piece
    const newState: CheckersState = {
      ...state,
      board: newBoard,
      selectedRow: toRow,
      selectedCol: toCol,
      jumpingPiece: nextJumpingPiece,
      forcedPieces: [[toRow, toCol]],
    };
    return { ...gameState, state: newState };
  }

  // Turn ends — check win condition
  nextTurn = opponent(state.turn);
  const opponentHasMoves = hasAnyMoves(newBoard, nextTurn);

  if (!opponentHasMoves) {
    const winner = state.turn;
    const newScores = {
      ...state.scores,
      [winner]: state.scores[winner] + 1,
    };
    return {
      ...gameState,
      state: {
        ...state,
        board: newBoard,
        phase: 'GAME_OVER',
        winner,
        selectedRow: null,
        selectedCol: null,
        jumpingPiece: null,
        forcedPieces: [],
        scores: newScores,
      },
    };
  }

  const nextForcedPieces = getAllForcedPieces(newBoard, nextTurn);

  return {
    ...gameState,
    state: {
      ...state,
      board: newBoard,
      turn: nextTurn,
      selectedRow: null,
      selectedCol: null,
      jumpingPiece: nextJumpingPiece,
      forcedPieces: nextForcedPieces,
    },
  };
}

export function checkersReducer(
  gameState: CheckersGameState,
  action: CheckersAction
): CheckersGameState {
  switch (action.type) {
    case 'SELECT_PIECE':
      return handleSelect(gameState, action.row, action.col);

    case 'MOVE_PIECE':
      return handleMove(gameState, action.fromRow, action.fromCol, action.toRow, action.toCol);

    case 'NEW_GAME': {
      const freshState = createInitialState();
      return {
        ...gameState,
        gameId: generateGameId(),
        state: {
          ...freshState,
          scores: gameState.state.scores,
        },
      };
    }

    default:
      return gameState;
  }
}

export function getLegalMovesForSelected(state: CheckersState): Array<[number, number]> {
  if (state.selectedRow === null || state.selectedCol === null) return [];
  return getLegalMovesForPiece(state, state.selectedRow, state.selectedCol);
}
