import type { GemPiece } from '../types';

/**
 * The shape catalogue.
 *
 * Pieces never rotate once offered, so every orientation a shape can appear in
 * is listed separately. The set is deliberately limited to the shapes in the
 * reference game: straight lines of 1-5, right-angle corners, T's and S/Z's.
 * No 2x2 square, no plus, no 3x3 block.
 */
export const PIECE_CATALOGUE: ReadonlyArray<GemPiece> = [
  // Straight lines, 1 to 5
  { id: 'i1', cells: [[0, 0]] },
  { id: 'i2h', cells: [[0, 0], [0, 1]] },
  { id: 'i2v', cells: [[0, 0], [1, 0]] },
  { id: 'i3h', cells: [[0, 0], [0, 1], [0, 2]] },
  { id: 'i3v', cells: [[0, 0], [1, 0], [2, 0]] },
  { id: 'i4h', cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { id: 'i4v', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { id: 'i5h', cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { id: 'i5v', cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },

  // Corners with two cells on each arm
  { id: 'c2-ne', cells: [[0, 0], [0, 1], [1, 0]] },
  { id: 'c2-nw', cells: [[0, 0], [0, 1], [1, 1]] },
  { id: 'c2-se', cells: [[0, 0], [1, 0], [1, 1]] },
  { id: 'c2-sw', cells: [[0, 1], [1, 0], [1, 1]] },

  // Corners with three cells on each arm
  { id: 'c3-ne', cells: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]] },
  { id: 'c3-nw', cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
  { id: 'c3-se', cells: [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2]] },
  { id: 'c3-sw', cells: [[0, 2], [1, 2], [2, 0], [2, 1], [2, 2]] },

  // Corners with three on one arm and two on the other
  { id: 'l-a', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { id: 'l-b', cells: [[0, 0], [0, 1], [0, 2], [1, 0]] },
  { id: 'l-c', cells: [[0, 0], [0, 1], [1, 1], [2, 1]] },
  { id: 'l-d', cells: [[0, 2], [1, 0], [1, 1], [1, 2]] },
  { id: 'j-a', cells: [[0, 1], [1, 1], [2, 0], [2, 1]] },
  { id: 'j-b', cells: [[0, 0], [1, 0], [1, 1], [1, 2]] },
  { id: 'j-c', cells: [[0, 0], [0, 1], [1, 0], [2, 0]] },
  { id: 'j-d', cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },

  // Three in a row with one on the middle of the next
  { id: 't-n', cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { id: 't-s', cells: [[0, 1], [1, 0], [1, 1], [1, 2]] },
  { id: 't-w', cells: [[0, 1], [1, 0], [1, 1], [2, 1]] },
  { id: 't-e', cells: [[0, 0], [1, 0], [1, 1], [2, 0]] },

  // Two and two, shifted by one
  { id: 's-h', cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { id: 's-v', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] },
  { id: 'z-h', cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  { id: 'z-v', cells: [[0, 1], [1, 0], [1, 1], [2, 0]] },
];

export const PIECE_BY_ID: ReadonlyMap<string, GemPiece> = new Map(
  PIECE_CATALOGUE.map((p) => [p.id, p]),
);

/**
 * How often each size is dealt, relative to the others.
 *
 * Uniform sampling over the catalogue deals too many five-cell corners, the
 * board silts up and a competent player loses more often than they should
 * (a greedy bot won only 70% of games). Mid-size shapes are the staple;
 * the big corners stay a garnish.
 */
const WEIGHT_BY_SIZE: Readonly<Record<number, number>> = { 1: 3, 2: 5, 3: 6, 4: 4, 5: 2 };

export const PIECE_WEIGHTS: ReadonlyArray<number> = PIECE_CATALOGUE.map(
  (p) => WEIGHT_BY_SIZE[p.cells.length] ?? 1,
);

const TOTAL_WEIGHT = PIECE_WEIGHTS.reduce((a, b) => a + b, 0);

/** Picks a shape with the weighting above; `roll` is in [0, 1). */
export function pickWeightedPiece(roll: number): GemPiece {
  let target = roll * TOTAL_WEIGHT;
  for (let i = 0; i < PIECE_CATALOGUE.length; i++) {
    target -= PIECE_WEIGHTS[i];
    if (target < 0) return PIECE_CATALOGUE[i];
  }
  return PIECE_CATALOGUE[PIECE_CATALOGUE.length - 1];
}

export function pieceSize(piece: GemPiece): { rows: number; cols: number } {
  let rows = 0;
  let cols = 0;
  for (const [r, c] of piece.cells) {
    if (r + 1 > rows) rows = r + 1;
    if (c + 1 > cols) cols = c + 1;
  }
  return { rows, cols };
}
