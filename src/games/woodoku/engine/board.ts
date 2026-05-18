import type { WoodokuPiece } from '../types';

const BOARD_SIZE = 9;

export function canPlace(
  board: boolean[][],
  piece: WoodokuPiece,
  anchorRow: number,
  anchorCol: number,
): boolean {
  for (const [dr, dc] of piece.cells) {
    const r = anchorRow + dr;
    const c = anchorCol + dc;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
    if (board[r][c]) return false;
  }
  return true;
}

export function findCompletedLines(board: boolean[][]): {
  rows: number[];
  cols: number[];
  boxes: number[];
} {
  const rows: number[] = [];
  const cols: number[] = [];
  const boxes: number[] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    if (board[r].every(cell => cell)) rows.push(r);
  }

  for (let c = 0; c < BOARD_SIZE; c++) {
    if (board.every(row => row[c])) cols.push(c);
  }

  // 9 boxes, each 3x3; box index = Math.floor(boxRow/3)*3 + Math.floor(boxCol/3)
  for (let boxIndex = 0; boxIndex < 9; boxIndex++) {
    const startRow = Math.floor(boxIndex / 3) * 3;
    const startCol = (boxIndex % 3) * 3;
    let full = true;
    for (let dr = 0; dr < 3 && full; dr++) {
      for (let dc = 0; dc < 3 && full; dc++) {
        if (!board[startRow + dr][startCol + dc]) full = false;
      }
    }
    if (full) boxes.push(boxIndex);
  }

  return { rows, cols, boxes };
}

export function placePieceAndClear(
  board: boolean[][],
  piece: WoodokuPiece,
  anchorRow: number,
  anchorCol: number,
): { board: boolean[][]; clearedCells: number; score: number } {
  // Deep-copy the board
  const next: boolean[][] = board.map(row => [...row]);

  for (const [dr, dc] of piece.cells) {
    next[anchorRow + dr][anchorCol + dc] = true;
  }

  const { rows, cols, boxes } = findCompletedLines(next);

  // Collect unique cells to clear
  const toClear = new Set<number>();

  for (const r of rows) {
    for (let c = 0; c < BOARD_SIZE; c++) toClear.add(r * BOARD_SIZE + c);
  }
  for (const c of cols) {
    for (let r = 0; r < BOARD_SIZE; r++) toClear.add(r * BOARD_SIZE + c);
  }
  for (const boxIndex of boxes) {
    const startRow = Math.floor(boxIndex / 3) * 3;
    const startCol = (boxIndex % 3) * 3;
    for (let dr = 0; dr < 3; dr++) {
      for (let dc = 0; dc < 3; dc++) {
        toClear.add((startRow + dr) * BOARD_SIZE + (startCol + dc));
      }
    }
  }

  for (const key of toClear) {
    const r = Math.floor(key / BOARD_SIZE);
    const c = key % BOARD_SIZE;
    next[r][c] = false;
  }

  const clearedCells = toClear.size;
  const lineCount = rows.length + cols.length + boxes.length;

  // Base score: 1 point per cleared cell; bonus +10 per additional line beyond the first
  const score = clearedCells > 0 ? clearedCells + Math.max(0, lineCount - 1) * 10 : 0;

  return { board: next, clearedCells, score };
}

export function hasAnyPlacement(
  board: boolean[][],
  offered: (WoodokuPiece | null)[],
): boolean {
  for (const piece of offered) {
    if (!piece) continue;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (canPlace(board, piece, r, c)) return true;
      }
    }
  }
  return false;
}
