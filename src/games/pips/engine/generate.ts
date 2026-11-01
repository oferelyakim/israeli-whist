import { createRNG } from '../../../utils/random';
import { PipsDifficulty } from '../types';
import type {
  CellKey,
  ConstraintKind,
  PipsDomino,
  PipsPlacement,
  PipsPuzzle,
  PipsRegion,
} from '../types';
import { MAX_PIP, REGION_COLOURS, key, parseKey, regionsTouch, stepFrom } from './board';
import { hasUniqueSolution } from './solver';

interface DifficultySpec {
  dominoes: number;
  maxPip: number;
  maxRows: number;
  maxCols: number;
  /** Relative chance of a region ending up 1, 2, 3 ... cells big. */
  regionWeights: readonly number[];
}

export const DIFFICULTY_SPEC: Readonly<Record<PipsDifficulty, DifficultySpec>> = {
  [PipsDifficulty.EASY]: {
    dominoes: 4, maxPip: 4, maxRows: 3, maxCols: 4, regionWeights: [1, 1],
  },
  [PipsDifficulty.MEDIUM]: {
    dominoes: 6, maxPip: 6, maxRows: 4, maxCols: 5, regionWeights: [1, 1, 1],
  },
  [PipsDifficulty.HARD]: {
    dominoes: 8, maxPip: 6, maxRows: 4, maxCols: 6, regionWeights: [8, 10, 2],
  },
};

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Builds the board by laying dominoes rather than carving a shape.
 *
 * Doing it this way means the region is tileable BY CONSTRUCTION — the growth
 * order is itself a tiling — so the generator can never hand back a board that
 * cannot be filled. Each new tile is scored on how many occupied neighbours it
 * touches, with enough jitter to keep shapes varied, which keeps boards compact
 * instead of growing long tendrils that waste the viewport.
 */
function growBoard(
  rng: () => number,
  count: number,
  maxRows: number,
  maxCols: number,
): Array<[CellKey, CellKey]> | null {
  if (maxCols < 2) return null;
  const occupied = new Set<CellKey>();
  const tiling: Array<[CellKey, CellKey]> = [];

  const inBounds = (cell: CellKey): boolean => {
    const [r, c] = parseKey(cell);
    return r >= 0 && r < maxRows && c >= 0 && c < maxCols;
  };
  const touching = (cell: CellKey): number => {
    let n = 0;
    for (let d = 0; d < 4; d++) if (occupied.has(stepFrom(cell, d))) n++;
    return n;
  };

  const startRow = Math.floor(rng() * maxRows);
  const startCol = Math.floor(rng() * (maxCols - 1));
  const opening: [CellKey, CellKey] = [key(startRow, startCol), key(startRow, startCol + 1)];
  tiling.push(opening);
  occupied.add(opening[0]);
  occupied.add(opening[1]);

  while (tiling.length < count) {
    const seen = new Set<string>();
    let best: [CellKey, CellKey] | null = null;
    let bestScore = -Infinity;

    for (const cell of occupied) {
      for (let d = 0; d < 4; d++) {
        const head = stepFrom(cell, d);
        if (!inBounds(head) || occupied.has(head)) continue;
        for (let e = 0; e < 4; e++) {
          const tail = stepFrom(head, e);
          if (tail === cell || !inBounds(tail) || occupied.has(tail)) continue;
          const id = head < tail ? `${head}|${tail}` : `${tail}|${head}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const score = touching(head) + touching(tail) + rng() * 3.5;
          if (score > bestScore) {
            bestScore = score;
            best = [head, tail];
          }
        }
      }
    }

    if (!best) return null;
    tiling.push(best);
    occupied.add(best[0]);
    occupied.add(best[1]);
  }
  return tiling;
}

interface NormalisedBoard {
  tiling: Array<[CellKey, CellKey]>;
  cells: CellKey[];
  rows: number;
  cols: number;
}

/** Slides the grown shape against the top-left corner and sorts its cells. */
function normalise(tiling: Array<[CellKey, CellKey]>): NormalisedBoard {
  let minRow = Infinity;
  let minCol = Infinity;
  let maxRow = -Infinity;
  let maxCol = -Infinity;
  for (const pair of tiling) {
    for (const cell of pair) {
      const [r, c] = parseKey(cell);
      if (r < minRow) minRow = r;
      if (c < minCol) minCol = c;
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    }
  }
  const shift = (cell: CellKey): CellKey => {
    const [r, c] = parseKey(cell);
    return key(r - minRow, c - minCol);
  };

  const moved = tiling.map(([a, b]) => [shift(a), shift(b)] as [CellKey, CellKey]);
  const cells = moved.flat().sort((x, y) => {
    const [rx, cx] = parseKey(x);
    const [ry, cy] = parseKey(y);
    return rx === ry ? cx - cy : rx - ry;
  });

  return { tiling: moved, cells, rows: maxRow - minRow + 1, cols: maxCol - minCol + 1 };
}

/** Every distinct tile of a double-`maxPip` set. */
function tileSet(maxPip: number): Array<[number, number]> {
  const tiles: Array<[number, number]> = [];
  for (let a = 0; a <= maxPip; a++) {
    for (let b = a; b <= maxPip; b++) tiles.push([a, b]);
  }
  return tiles;
}

/**
 * Cuts the board into connected groups.
 *
 * Every cell starts in a region. Loose, unconstrained cells are an OUTPUT of
 * the clue ladder further down, where a region whose clue turns out to be
 * redundant is dropped — reserving them up front only weakened the uniqueness
 * gate and made hard boards fall through to the ambiguous fallback.
 */
function partition(
  rng: () => number,
  cells: readonly CellKey[],
  weights: readonly number[],
): CellKey[][] {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const rollSize = (): number => {
    let target = rng() * totalWeight;
    for (let i = 0; i < weights.length; i++) {
      target -= weights[i];
      if (target < 0) return i + 1;
    }
    return weights.length;
  };
  const remaining = new Set(cells);
  const groups: CellKey[][] = [];

  while (remaining.size > 0) {
    const open = [...remaining];
    const start = open[Math.floor(rng() * open.length)];
    const target = rollSize();
    const group = [start];
    remaining.delete(start);

    while (group.length < target) {
      const frontier: CellKey[] = [];
      for (const member of group) {
        for (let d = 0; d < 4; d++) {
          const next = stepFrom(member, d);
          if (remaining.has(next) && !frontier.includes(next)) frontier.push(next);
        }
      }
      if (frontier.length === 0) break;
      const pick = frontier[Math.floor(rng() * frontier.length)];
      group.push(pick);
      remaining.delete(pick);
    }
    groups.push(group);
  }
  return groups;
}

interface Candidate {
  kind: ConstraintKind;
  value: number;
}

/**
 * Every clue that is true of this region, weakest first.
 *
 * The generator walks this ladder and keeps the FIRST rung that still leaves
 * one answer, so a region ends up with the loosest clue that does the job and
 * the board is not just a wall of exact sums. `NONE` leads so redundant regions
 * disappear entirely; the exact sum is the fallback at the end.
 */
function candidateLadder(
  rng: () => number,
  cells: readonly CellKey[],
  values: ReadonlyMap<CellKey, number>,
): Candidate[] {
  const pips = cells.map((cell) => values.get(cell) ?? 0);
  const sum = pips.reduce((a, b) => a + b, 0);
  const size = cells.length;
  const ceiling = MAX_PIP * size;
  const middle: Candidate[] = [];

  // Thresholds sit within three of the real total, so a clue reads like ">4"
  // rather than a vacuous ">0" that rules nothing out.
  if (sum >= 2) {
    middle.push({ kind: 'GT', value: Math.max(1, sum - 1 - Math.floor(rng() * 3)) });
  }
  // The floor of 2 keeps "<1" off the board: it is a roundabout way of saying
  // the region is all zeros, and reads like a misprint.
  if (sum <= ceiling - 2) {
    const limit = Math.max(2, Math.min(ceiling - 1, sum + 1 + Math.floor(rng() * 3)));
    if (sum < limit) middle.push({ kind: 'LT', value: limit });
  }
  if (size >= 2 && pips.every((p) => p === pips[0])) middle.push({ kind: 'EQUAL', value: 0 });
  if (size >= 2 && new Set(pips).size === size) middle.push({ kind: 'DISTINCT', value: 0 });

  shuffle(middle, rng);
  // A plain shuffle buries `=` and `\u2260`: a threshold clue almost always
  // pins the region first, so those two never reach the board. Half the time
  // they go to the front of the queue instead, which puts them back in the mix
  // wherever they genuinely do the job.
  if (rng() < 0.8) {
    const special = middle.filter((c) => c.kind === 'EQUAL' || c.kind === 'DISTINCT');
    if (special.length > 0) {
      const rest = middle.filter((c) => c.kind !== 'EQUAL' && c.kind !== 'DISTINCT');
      middle.length = 0;
      middle.push(...special, ...rest);
    }
  }
  return [{ kind: 'NONE', value: 0 }, ...middle, { kind: 'SUM', value: sum }];
}

/**
 * Colours the regions so two that touch never share one.
 *
 * Numbering them 0,1,2,... in order was fine until a board had more regions
 * than the palette has colours: the twelfth region wrapped back to the first
 * colour, and when the two touched they looked like a single region. Greedy
 * graph colouring, most-constrained region first, and the palette is wide
 * enough that it never has to reuse one.
 */
function assignColours(regions: PipsRegion[], rng: () => number): void {
  const neighbours = regions.map(() => new Set<number>());
  for (let a = 0; a < regions.length; a++) {
    for (let b = a + 1; b < regions.length; b++) {
      if (regionsTouch(regions[a], regions[b])) {
        neighbours[a].add(b);
        neighbours[b].add(a);
      }
    }
  }

  const order = regions
    .map((_, i) => i)
    .sort((x, y) => neighbours[y].size - neighbours[x].size);
  const chosen = new Array<number>(regions.length).fill(-1);
  const used = new Array<number>(REGION_COLOURS).fill(0);

  for (const i of order) {
    const taken = new Set<number>();
    for (const n of neighbours[i]) {
      if (chosen[n] >= 0) taken.add(chosen[n]);
    }

    let best = -1;
    let bestScore = Infinity;
    for (let colour = 0; colour < REGION_COLOURS; colour++) {
      if (taken.has(colour)) continue;
      const score = used[colour] + rng() * 0.5;
      if (score < bestScore) {
        bestScore = score;
        best = colour;
      }
    }
    // Every colour blocked would need a region touching twelve others; fall
    // back rather than leaving it uncoloured.
    chosen[i] = best >= 0 ? best : 0;
    used[chosen[i]] += 1;
  }

  regions.forEach((region, i) => { region.colour = chosen[i]; });
}

function buildOnce(
  rng: () => number,
  seed: number,
  difficulty: PipsDifficulty,
  spec: DifficultySpec,
  requireUnique: boolean,
): PipsPuzzle | null {
  const grown = growBoard(rng, spec.dominoes, spec.maxRows, spec.maxCols);
  if (!grown) return null;
  const board = normalise(grown);

  const tiles = shuffle(tileSet(spec.maxPip), rng).slice(0, spec.dominoes);
  if (tiles.length < spec.dominoes) return null;

  const dominoes: PipsDomino[] = [];
  const solution: PipsPlacement[] = [];
  const values = new Map<CellKey, number>();

  board.tiling.forEach(([one, two], i) => {
    const [a, b] = tiles[i];
    const id = `d${i}`;
    dominoes.push({ id, a, b });
    const flip = rng() < 0.5;
    const cells: [CellKey, CellKey] = flip ? [two, one] : [one, two];
    solution.push({ dominoId: id, cells });
    values.set(cells[0], a);
    values.set(cells[1], b);
  });

  for (let attempt = 0; attempt < 6; attempt++) {
    const groups = partition(rng, board.cells, spec.regionWeights);
    const regions: PipsRegion[] = groups.map((cells, i) => ({
      id: `r${i}`,
      cells,
      kind: 'SUM' as ConstraintKind,
      value: cells.reduce((total, cell) => total + (values.get(cell) ?? 0), 0),
      colour: i,
    }));

    const input = { cells: board.cells, regions, dominoes };
    // Pinning every region to its exact total is the tightest the board gets.
    // If that still leaves two answers, no weaker clue set will fix it, so cut
    // this partition rather than weakening into an ambiguous puzzle.
    if (requireUnique && !hasUniqueSolution(input)) continue;

    for (const region of shuffle([...regions], rng)) {
      const fallbackKind = region.kind;
      const fallbackValue = region.value;
      for (const option of candidateLadder(rng, region.cells, values)) {
        if (option.kind === 'SUM') break;
        region.kind = option.kind;
        region.value = option.value;
        if (hasUniqueSolution(input)) break;
        region.kind = fallbackKind;
        region.value = fallbackValue;
      }
    }

    // A region the ladder emptied is just loose cells now; drop it so the board
    // shows no tint and no badge there.
    const kept = regions.filter((region) => region.kind !== 'NONE');
    assignColours(kept, rng);

    return {
      difficulty,
      seed,
      rows: board.rows,
      cols: board.cols,
      cells: board.cells,
      regions: kept,
      dominoes: shuffle(dominoes, rng),
      solution,
    };
  }
  return null;
}

/**
 * Builds a puzzle with exactly one answer.
 *
 * The uniqueness requirement is dropped on the last few attempts rather than
 * throwing: a board whose clues allow a second arrangement is still winnable
 * and still fun, and an exception here would take the whole screen down.
 */
export function generatePuzzle(seed: number, difficulty: PipsDifficulty): PipsPuzzle {
  const spec = DIFFICULTY_SPEC[difficulty];
  const ATTEMPTS = 40;

  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const rng = createRNG(seed + attempt * 7919 + 1);
    const puzzle = buildOnce(rng, seed, difficulty, spec, attempt < ATTEMPTS - 4);
    if (puzzle) return puzzle;
  }

  // Nothing came back at all — fall back to the plainest board there is, every
  // region pinned to its own total.
  const rng = createRNG(seed + 104_729);
  const last = buildOnce(rng, seed, difficulty, spec, false);
  if (last) return last;
  throw new Error(`Pips: could not generate a board for seed ${seed}`);
}
