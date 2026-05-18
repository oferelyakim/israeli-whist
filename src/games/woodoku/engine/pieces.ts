import type { WoodokuPiece } from '../types';

export const PIECE_CATALOGUE: WoodokuPiece[] = [
  { id: 'single',      cells: [[0, 0]] },
  { id: 'domino-h',   cells: [[0, 0], [0, 1]] },
  { id: 'domino-v',   cells: [[0, 0], [1, 0]] },
  { id: 'tromino-l',  cells: [[0, 0], [1, 0], [1, 1]] },
  { id: 'tromino-i3', cells: [[0, 0], [1, 0], [2, 0]] },
  { id: 'tromino-i3h', cells: [[0, 0], [0, 1], [0, 2]] },
  { id: 'tetro-i4v',  cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
  { id: 'tetro-i4h',  cells: [[0, 0], [0, 1], [0, 2], [0, 3]] },
  { id: 'tetro-l',    cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
  { id: 'tetro-j',    cells: [[0, 1], [1, 1], [2, 0], [2, 1]] },
  { id: 'tetro-t',    cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
  { id: 'tetro-s',    cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
  { id: 'tetro-z',    cells: [[0, 0], [0, 1], [1, 1], [1, 2]] },
  { id: 'tetro-o',    cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
  { id: 'pento-i5v',  cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
  { id: 'pento-i5h',  cells: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] },
  { id: 'pento-l',    cells: [[0, 0], [1, 0], [2, 0], [3, 0], [3, 1]] },
  { id: 'pento-plus', cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] },
  { id: 'sq3x3',      cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [2, 0], [2, 1], [2, 2]] },
  { id: 'corner3',    cells: [[0, 0], [0, 1], [0, 2], [1, 0], [2, 0]] },
  { id: 'u-shape',    cells: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]] },
  { id: 'pento-s',    cells: [[0, 0], [0, 1], [1, 1], [2, 1], [2, 2]] },
  { id: 'diag3',      cells: [[0, 0], [1, 1], [2, 2]] },
  { id: 'rect2x3',    cells: [[0, 0], [0, 1], [0, 2], [1, 0], [1, 1], [1, 2]] },
  { id: 'rect3x2',    cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]] },
];

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function getRandomPieces(
  seed: number,
  count: number,
): { pieces: WoodokuPiece[]; nextSeed: number } {
  const rng = mulberry32(seed);
  const pieces: WoodokuPiece[] = [];
  for (let i = 0; i < count; i++) {
    const index = Math.floor(rng() * PIECE_CATALOGUE.length);
    pieces.push(PIECE_CATALOGUE[index]);
  }
  // Advance seed deterministically: run rng one more time and convert back to int
  const nextSeed = Math.floor(rng() * 2147483647) + 1;
  return { pieces, nextSeed };
}
