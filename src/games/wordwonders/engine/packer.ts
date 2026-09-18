import { createRNG } from '../../../utils/random';

export interface Placement {
  word: string;
  row: number;
  col: number;
  horiz: boolean;
}

export interface PackResult {
  placements: Placement[];
  rows: number;
  cols: number;
}

interface Cells {
  get(r: number, c: number): string | undefined;
  set(r: number, c: number, ch: string): void;
}

function makeCells(): Cells & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: (r, c) => map.get(`${r},${c}`),
    set: (r, c, ch) => { map.set(`${r},${c}`, ch); },
  };
}

/**
 * Can `word` sit at (row, col) without breaking the crossword?
 *
 * Returns the number of letters it shares with words already down, or null if
 * the placement is illegal. Two rules keep the board readable:
 *   - the cells immediately before and after the word must be empty, or it
 *     glues onto a neighbour and reads as one longer nonsense run;
 *   - a cell the word brings in NEW must have empty neighbours to either side
 *     across its direction, or it forms an unintended two-letter pair.
 * A cell it shares with an existing word is a crossing and is fine.
 */
function crossingsFor(
  cells: Cells,
  word: string,
  row: number,
  col: number,
  horiz: boolean,
): number | null {
  const dr = horiz ? 0 : 1;
  const dc = horiz ? 1 : 0;
  const pr = horiz ? 1 : 0;
  const pc = horiz ? 0 : 1;

  if (cells.get(row - dr, col - dc) !== undefined) return null;
  if (cells.get(row + dr * word.length, col + dc * word.length) !== undefined) return null;

  let crossings = 0;
  for (let i = 0; i < word.length; i++) {
    const r = row + dr * i;
    const c = col + dc * i;
    const cur = cells.get(r, c);
    if (cur !== undefined) {
      if (cur !== word[i]) return null;
      crossings++;
    } else {
      if (cells.get(r + pr, c + pc) !== undefined) return null;
      if (cells.get(r - pr, c - pc) !== undefined) return null;
    }
  }
  if (crossings === word.length) return null; // already fully on the board
  return crossings;
}

function bounds(map: ReadonlyMap<string, string>) {
  let minR = Infinity, minC = Infinity, maxR = -Infinity, maxC = -Infinity;
  for (const key of map.keys()) {
    const comma = key.indexOf(',');
    const r = Number(key.slice(0, comma));
    const c = Number(key.slice(comma + 1));
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
  }
  return { minR, minC, rows: maxR - minR + 1, cols: maxC - minC + 1 };
}

/**
 * Greedy packer: the longest word goes down first, then each remaining word
 * takes its best-scoring crossing. Scoring favours a compact board and more
 * interlock, with a little noise so retries explore different shapes.
 */
function packOnce(words: readonly string[], maxDim: number, rng: () => number): PackResult | null {
  if (words.length === 0) return null;
  const cells = makeCells();
  const placements: Placement[] = [];

  for (let i = 0; i < words[0].length; i++) cells.set(0, i, words[0][i]);
  placements.push({ word: words[0], row: 0, col: 0, horiz: true });

  for (let w = 1; w < words.length; w++) {
    const word = words[w];
    let best: { score: number; row: number; col: number; horiz: boolean } | null = null;

    for (const anchor of placements) {
      const adr = anchor.horiz ? 0 : 1;
      const adc = anchor.horiz ? 1 : 0;
      for (let ai = 0; ai < anchor.word.length; ai++) {
        const ar = anchor.row + adr * ai;
        const ac = anchor.col + adc * ai;
        const anchorCh = anchor.word[ai];
        for (let wi = 0; wi < word.length; wi++) {
          if (word[wi] !== anchorCh) continue;
          const horiz = !anchor.horiz;
          const row = ar - (horiz ? 0 : wi);
          const col = ac - (horiz ? wi : 0);
          const crossings = crossingsFor(cells, word, row, col, horiz);
          if (crossings === null) continue;

          const trial = new Map(cells.map);
          const dr = horiz ? 0 : 1;
          const dc = horiz ? 1 : 0;
          for (let i = 0; i < word.length; i++) {
            trial.set(`${row + dr * i},${col + dc * i}`, word[i]);
          }
          const b = bounds(trial);
          if (b.rows > maxDim || b.cols > maxDim) continue;

          const score = -(b.rows * b.cols) + crossings * 6 + rng();
          if (!best || score > best.score) best = { score, row, col, horiz };
        }
      }
    }

    if (!best) return null; // every word must land, or the level is short
    const dr = best.horiz ? 0 : 1;
    const dc = best.horiz ? 1 : 0;
    for (let i = 0; i < word.length; i++) {
      cells.set(best.row + dr * i, best.col + dc * i, word[i]);
    }
    placements.push({ word, row: best.row, col: best.col, horiz: best.horiz });
  }

  const b = bounds(cells.map);
  return {
    rows: b.rows,
    cols: b.cols,
    placements: placements.map((p) => ({ ...p, row: p.row - b.minR, col: p.col - b.minC })),
  };
}

export interface PackOptions {
  maxDim?: number;
  attempts?: number;
}

/**
 * Packs `words` into a crossword, retrying with fresh noise because a greedy
 * pass can paint itself into a corner. Returns the most compact success.
 */
export function packWords(
  words: readonly string[],
  seed: number,
  { maxDim = 9, attempts = 24 }: PackOptions = {},
): PackResult | null {
  let best: PackResult | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const result = packOnce(words, maxDim, createRNG(seed + attempt * 7919));
    if (!result) continue;
    if (!best || result.rows * result.cols < best.rows * best.cols) best = result;
  }
  return best;
}
