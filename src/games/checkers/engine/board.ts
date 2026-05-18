import type { Board, Piece, PieceColor } from '../types';

export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: 8 }, () => Array(8).fill(null));

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const isDark = (row + col) % 2 === 1;
      if (!isDark) continue;

      if (row < 3) {
        board[row][col] = { color: 'black', king: false };
      } else if (row > 4) {
        board[row][col] = { color: 'red', king: false };
      }
    }
  }

  return board;
}

function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function opponent(color: PieceColor): PieceColor {
  return color === 'red' ? 'black' : 'red';
}

// Red moves from high row index toward row 0; black moves from low index toward row 7.
function forwardDirections(piece: Piece): Array<[number, number]> {
  const forward: Array<[number, number]> = piece.color === 'red'
    ? [[-1, -1], [-1, 1]]
    : [[1, -1], [1, 1]];
  const backward: Array<[number, number]> = piece.color === 'red'
    ? [[1, -1], [1, 1]]
    : [[-1, -1], [-1, 1]];
  return piece.king ? [...forward, ...backward] : forward;
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function getCaptureMoves(
  board: Board,
  row: number,
  col: number
): Array<[number, number]> {
  const piece = board[row][col];
  if (!piece) return [];

  const dirs = forwardDirections(piece);
  const results: Array<[number, number]> = [];

  for (const [dr, dc] of dirs) {
    const midRow = row + dr;
    const midCol = col + dc;
    const landRow = row + dr * 2;
    const landCol = col + dc * 2;

    if (!inBounds(landRow, landCol)) continue;

    const mid = board[midRow][midCol];
    const land = board[landRow][landCol];

    if (mid && mid.color === opponent(piece.color) && land === null) {
      results.push([landRow, landCol]);
    }
  }

  return results;
}

export function getRegularMoves(
  board: Board,
  row: number,
  col: number
): Array<[number, number]> {
  const piece = board[row][col];
  if (!piece) return [];

  const dirs = forwardDirections(piece);
  const results: Array<[number, number]> = [];

  for (const [dr, dc] of dirs) {
    const newRow = row + dr;
    const newCol = col + dc;
    if (inBounds(newRow, newCol) && board[newRow][newCol] === null) {
      results.push([newRow, newCol]);
    }
  }

  return results;
}

export function getAllForcedPieces(
  board: Board,
  turn: PieceColor
): Array<[number, number]> {
  const forced: Array<[number, number]> = [];

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (piece && piece.color === turn && getCaptureMoves(board, row, col).length > 0) {
        forced.push([row, col]);
      }
    }
  }

  return forced;
}

export function applyMove(
  board: Board,
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number
): { board: Board; captured: boolean; promoted: boolean } {
  const next = cloneBoard(board);
  const piece = next[fromRow][fromCol];

  if (!piece) throw new Error(`No piece at [${fromRow},${fromCol}]`);

  const rowDelta = toRow - fromRow;
  const colDelta = toCol - fromCol;
  const isCapture = Math.abs(rowDelta) === 2;

  if (isCapture) {
    const midRow = fromRow + rowDelta / 2;
    const midCol = fromCol + colDelta / 2;
    next[midRow][midCol] = null;
  }

  next[toRow][toCol] = piece;
  next[fromRow][fromCol] = null;

  const promoted =
    !piece.king &&
    ((piece.color === 'red' && toRow === 0) ||
      (piece.color === 'black' && toRow === 7));

  if (promoted) {
    next[toRow][toCol] = { ...piece, king: true };
  }

  return { board: next, captured: isCapture, promoted };
}

export function hasAnyMoves(board: Board, color: PieceColor): boolean {
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const piece = board[row][col];
      if (!piece || piece.color !== color) continue;
      if (getCaptureMoves(board, row, col).length > 0) return true;
      if (getRegularMoves(board, row, col).length > 0) return true;
    }
  }
  return false;
}

export function countPieces(board: Board): { red: number; redKings: number; black: number; blackKings: number } {
  let red = 0, redKings = 0, black = 0, blackKings = 0;
  for (const row of board) {
    for (const cell of row) {
      if (!cell) continue;
      if (cell.color === 'red') { red++; if (cell.king) redKings++; }
      else { black++; if (cell.king) blackKings++; }
    }
  }
  return { red, redKings, black, blackKings };
}
