import type { ClearSummary, GemPiece, OfferedPiece } from '../types';
import { pickWeightedPiece } from './pieces';
import { createRNG } from '../../../utils/random';

export const BOARD_SIZE = 9;
export const BOX_SIZE = 3;
export const GEM_GOAL = 14;
/** Gems resting on the board before the first piece is placed. */
export const OPENING_GEMS = 4;
/** At most this many gems ride the tray at once, so they arrive in a trickle. */
const MAX_TRAY_GEMS = 2;

export function createEmptyGrid(): boolean[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array<boolean>(BOARD_SIZE).fill(false));
}

export function cloneGrid(grid: readonly boolean[][]): boolean[][] {
  return grid.map((row) => [...row]);
}

export function canPlace(
  board: readonly boolean[][],
  piece: GemPiece,
  row: number,
  col: number,
): boolean {
  for (const [dr, dc] of piece.cells) {
    const r = row + dr;
    const c = col + dc;
    if (r < 0 || r >= BOARD_SIZE || c < 0 || c >= BOARD_SIZE) return false;
    if (board[r][c]) return false;
  }
  return true;
}

/** Every anchor where this piece fits. Empty means it cannot be played at all. */
export function placementsFor(
  board: readonly boolean[][],
  piece: GemPiece,
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (canPlace(board, piece, r, c)) out.push([r, c]);
    }
  }
  return out;
}

export function hasAnyPlacement(
  board: readonly boolean[][],
  offered: ReadonlyArray<OfferedPiece | null>,
): boolean {
  for (const offer of offered) {
    if (!offer) continue;
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        if (canPlace(board, offer.piece, r, c)) return true;
      }
    }
  }
  return false;
}

/** Full rows, full columns and full 3x3 boxes — all three clear. */
export function findCompletedLines(board: readonly boolean[][]): {
  rows: number[];
  cols: number[];
  boxes: number[];
} {
  const rows: number[] = [];
  const cols: number[] = [];
  const boxes: number[] = [];

  for (let r = 0; r < BOARD_SIZE; r++) {
    if (board[r].every(Boolean)) rows.push(r);
  }
  for (let c = 0; c < BOARD_SIZE; c++) {
    if (board.every((row) => row[c])) cols.push(c);
  }
  for (let box = 0; box < 9; box++) {
    const r0 = Math.floor(box / 3) * BOX_SIZE;
    const c0 = (box % 3) * BOX_SIZE;
    let full = true;
    for (let dr = 0; dr < BOX_SIZE && full; dr++) {
      for (let dc = 0; dc < BOX_SIZE && full; dc++) {
        if (!board[r0 + dr][c0 + dc]) full = false;
      }
    }
    if (full) boxes.push(box);
  }
  return { rows, cols, boxes };
}

function clearedCellKeys(lines: { rows: number[]; cols: number[]; boxes: number[] }): Set<string> {
  const keys = new Set<string>();
  for (const r of lines.rows) {
    for (let c = 0; c < BOARD_SIZE; c++) keys.add(`${r},${c}`);
  }
  for (const c of lines.cols) {
    for (let r = 0; r < BOARD_SIZE; r++) keys.add(`${r},${c}`);
  }
  for (const box of lines.boxes) {
    const r0 = Math.floor(box / 3) * BOX_SIZE;
    const c0 = (box % 3) * BOX_SIZE;
    for (let dr = 0; dr < BOX_SIZE; dr++) {
      for (let dc = 0; dc < BOX_SIZE; dc++) keys.add(`${r0 + dr},${c0 + dc}`);
    }
  }
  return keys;
}

export interface PlacementResult {
  board: boolean[][];
  gems: boolean[][];
  clear: ClearSummary;
  score: number;
}

/**
 * Drops a piece on the board, then clears whatever that completed.
 *
 * A gem riding the piece lands on its cell first, so a placement that both
 * delivers a gem and completes the line collects that gem in the same move —
 * which is how the reference game behaves.
 */
export function placeAndClear(
  board: readonly boolean[][],
  gems: readonly boolean[][],
  offer: OfferedPiece,
  row: number,
  col: number,
): PlacementResult {
  const nextBoard = cloneGrid(board);
  const nextGems = cloneGrid(gems);

  offer.piece.cells.forEach(([dr, dc], i) => {
    const r = row + dr;
    const c = col + dc;
    nextBoard[r][c] = true;
    if (offer.gemIndex === i) nextGems[r][c] = true;
  });

  const lines = findCompletedLines(nextBoard);
  const keys = clearedCellKeys(lines);

  let collected = 0;
  for (const key of keys) {
    const comma = key.indexOf(',');
    const r = Number(key.slice(0, comma));
    const c = Number(key.slice(comma + 1));
    if (nextGems[r][c]) {
      collected++;
      nextGems[r][c] = false;
    }
    nextBoard[r][c] = false;
  }

  const lineCount = lines.rows.length + lines.cols.length + lines.boxes.length;
  // Placement pays per cell; clearing pays per line, and combos pay more.
  const score = offer.piece.cells.length + lineCount * lineCount * 18 + collected * 25;

  return {
    board: nextBoard,
    gems: nextGems,
    clear: { ...lines, cells: [...keys], gems: collected },
    score,
  };
}

// ─── Offers ──────────────────────────────────────────────────────────

export function countGems(gems: readonly boolean[][]): number {
  let n = 0;
  for (const row of gems) for (const cell of row) if (cell) n++;
  return n;
}

export interface OfferBatch {
  offered: OfferedPiece[];
  nextSeed: number;
  nextSerial: number;
}

/**
 * Deals three shapes, attaching gems to some of them.
 *
 * Supply is driven by what the player still needs, NOT by how many gems are
 * already lying on the board: a gem can be stranded somewhere that never
 * clears, and gating on board gems would then starve the game and make the
 * goal unreachable. Gems keep arriving until enough have been handed out to
 * finish, capped at two per tray so they trickle rather than flood.
 */
export function makeOffer(
  seed: number,
  gemsCollected: number,
  goal: number,
  serial: number,
): OfferBatch {
  const rng = createRNG(seed);
  const offered: OfferedPiece[] = [];
  let nextSerial = serial;
  let trayGems = 0;

  for (let i = 0; i < 3; i++) {
    const piece = pickWeightedPiece(rng());
    const wantGem =
      gemsCollected + trayGems < goal && trayGems < MAX_TRAY_GEMS && rng() < 0.5;
    const gemIndex = wantGem ? Math.floor(rng() * piece.cells.length) : null;
    if (gemIndex !== null) trayGems++;
    offered.push({ key: `p${nextSerial++}`, piece, gemIndex });
  }

  return {
    offered,
    nextSeed: Math.floor(rng() * 2147483647) + 1,
    nextSerial,
  };
}

/** Scatters the opening gems over empty squares. */
export function seedBoardGems(seed: number, count: number): boolean[][] {
  const gems = createEmptyGrid();
  const rng = createRNG(seed);
  let placed = 0;
  let guard = 0;
  while (placed < count && guard < 500) {
    guard++;
    const r = Math.floor(rng() * BOARD_SIZE);
    const c = Math.floor(rng() * BOARD_SIZE);
    if (gems[r][c]) continue;
    gems[r][c] = true;
    placed++;
  }
  return gems;
}
