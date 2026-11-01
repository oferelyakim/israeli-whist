import { CELLS, COLS, NEIGHBOURS, ROWS, colOf, freeComponents, rowOf, subsetSums } from './grid';

interface Budget {
  nodes: number;
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

interface WalkOptions {
  /** Rejects a half-built path that can no longer reach what it needs. */
  canContinue?: (cell: number, stepsLeft: number) => boolean;
  /** Rejects a finished path. */
  accept?: (path: readonly number[]) => boolean;
}

/**
 * Walks simple paths of exactly `length` from `start` over the free cells,
 * handing each to `visit`.
 *
 * `free` is marked as the walk descends and unmarked as it backtracks. When
 * `visit` accepts a path the marks are deliberately LEFT in place, so the
 * caller can keep the path without re-marking it; every other exit restores
 * them. Getting that backwards silently frees cells that are in use.
 */
function eachPath(
  start: number,
  length: number,
  free: Uint8Array,
  rng: () => number,
  budget: Budget,
  visit: (path: readonly number[]) => boolean,
  options: WalkOptions = {},
): boolean {
  const path: number[] = [];
  let accepted = false;

  function step(cell: number): boolean {
    if (budget.nodes-- <= 0) return true;

    path.push(cell);
    free[cell] = 0;

    if (path.length === length) {
      if ((!options.accept || options.accept(path)) && visit(path)) {
        accepted = true;
        return true;
      }
      free[cell] = 1;
      path.pop();
      return false;
    }

    const stepsLeft = length - path.length;
    if (!options.canContinue || options.canContinue(cell, stepsLeft)) {
      for (const next of shuffled(NEIGHBOURS[cell], rng)) {
        if (!free[next]) continue;
        if (step(next)) {
          if (accepted) return true;
          free[cell] = 1;
          path.pop();
          return true;
        }
      }
    }

    free[cell] = 1;
    path.pop();
    return false;
  }

  step(start);
  return accepted;
}

/**
 * Lays the spangram, which has to touch two opposite edges.
 *
 * It is placed first and on its own terms: it is the longest word and the only
 * one with a positional rule, so fitting it around the others rarely works.
 */
function placeSpangram(
  length: number,
  free: Uint8Array,
  rng: () => number,
  budget: Budget,
): number[] | null {
  const vertical = ROWS <= length && (COLS > length || rng() < 0.5);
  if (!vertical && length < COLS) return null;
  if (vertical && length < ROWS) return null;

  const starts = shuffled(
    vertical
      ? Array.from({ length: COLS }, (_, c) => c)
      : Array.from({ length: ROWS }, (_, r) => r * COLS),
    rng,
  );

  let found: number[] | null = null;
  for (const start of starts) {
    const taken = eachPath(start, length, free, rng, budget, (path) => {
      found = [...path];
      return true;
    }, {
      // Never wander further from the far edge than there are steps left.
      canContinue: (cell, stepsLeft) => (
        vertical
          ? stepsLeft >= ROWS - 1 - rowOf(cell)
          : stepsLeft >= COLS - 1 - colOf(cell)
      ),
      accept: (path) => {
        const last = path[path.length - 1];
        return vertical ? rowOf(last) === ROWS - 1 : colOf(last) === COLS - 1;
      },
    });
    if (taken && found) return found;
  }
  return null;
}

/** Cheap proof that what is left could still be carved into the words left. */
function stillFillable(free: Uint8Array, remaining: readonly number[]): boolean {
  let total = 0;
  for (let i = 0; i < CELLS; i++) total += free[i];
  let wanted = 0;
  for (const length of remaining) wanted += length;
  if (total !== wanted) return false;

  // Each blob must be carvable on its own, or some word would have to straddle
  // two of them. This is a necessary condition, not a sufficient one, but it
  // kills the dead ends that otherwise dominate the search.
  const reachable = subsetSums(remaining);
  return freeComponents(free).every((size) => reachable[size]);
}

function fill(
  free: Uint8Array,
  remaining: number[],
  out: number[][],
  rng: () => number,
  budget: Budget,
): boolean {
  if (remaining.length === 0) return true;
  if (budget.nodes <= 0) return false;

  // Always extend from the first free cell. Every cover has to reach it, and
  // committing to it stops the search re-deriving the same layout in a
  // different order.
  let start = -1;
  for (let i = 0; i < CELLS; i++) {
    if (free[i]) { start = i; break; }
  }
  if (start === -1) return false;

  for (const length of shuffled([...new Set(remaining)], rng)) {
    const slot = remaining.indexOf(length);
    let placed = false;

    eachPath(start, length, free, rng, budget, (path) => {
      remaining.splice(slot, 1);
      out.push([...path]);
      if (stillFillable(free, remaining) && fill(free, remaining, out, rng, budget)) {
        placed = true;
        return true;
      }
      out.pop();
      remaining.splice(slot, 0, length);
      return false;
    });

    if (placed) return true;
  }
  return false;
}

export interface PackResult {
  /**
   * The spangram's path first, then the rest.
   *
   * Only the spangram's position is fixed. The others come back in the order
   * the search placed them, NOT the order of `lengths` — match words to paths
   * by length, never by index.
   */
  paths: number[][];
}

/**
 * Carves the whole board into snaking paths of exactly the given lengths.
 *
 * `lengths[0]` is the spangram. Every cell ends up in exactly one path, which
 * is what the game needs: there are no crossings, so letters never have to
 * agree and any word can be written along any path of its length.
 */
export function packPaths(
  rng: () => number,
  lengths: readonly number[],
  nodeCap = 400_000,
): PackResult | null {
  let total = 0;
  for (const length of lengths) total += length;
  if (total !== CELLS || lengths.length === 0) return null;

  const free = new Uint8Array(CELLS).fill(1);
  const budget: Budget = { nodes: nodeCap };

  const spangram = placeSpangram(lengths[0], free, rng, budget);
  if (!spangram) return null;

  const paths: number[][] = [spangram];
  const rest = [...lengths.slice(1)];
  if (!stillFillable(free, rest)) return null;
  if (!fill(free, rest, paths, rng, budget)) return null;

  return { paths };
}
