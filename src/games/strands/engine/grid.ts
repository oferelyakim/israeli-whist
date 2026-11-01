/** The board is 6 wide and 8 tall, as the game this follows uses. */
export const COLS = 6;
export const ROWS = 8;
export const CELLS = ROWS * COLS;

export function rowOf(index: number): number {
  return Math.floor(index / COLS);
}

export function colOf(index: number): number {
  return index % COLS;
}

export function indexOf(row: number, col: number): number {
  return row * COLS + col;
}

/**
 * Neighbours of every cell, including diagonals.
 *
 * Words snake through touching cells in any of the eight directions, so this
 * is the adjacency both the packer and the player's trace run on. Precomputed
 * once: it is read in the innermost loop of the path search.
 */
export const NEIGHBOURS: ReadonlyArray<readonly number[]> = (() => {
  const table: number[][] = [];
  for (let index = 0; index < CELLS; index++) {
    const row = rowOf(index);
    const col = colOf(index);
    const near: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr;
        const c = col + dc;
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) continue;
        near.push(indexOf(r, c));
      }
    }
    table.push(near);
  }
  return table;
})();

export function areAdjacent(a: number, b: number): boolean {
  return NEIGHBOURS[a].includes(b);
}

/** True when every step of the trace lands on a touching, unrepeated cell. */
export function isValidPath(path: readonly number[]): boolean {
  if (path.length === 0) return false;
  const seen = new Set<number>();
  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    if (cell < 0 || cell >= CELLS || seen.has(cell)) return false;
    seen.add(cell);
    if (i > 0 && !areAdjacent(path[i - 1], cell)) return false;
  }
  return true;
}

/** Sizes reachable as a sum of some subset of `parts`. */
export function subsetSums(parts: readonly number[]): boolean[] {
  const reachable = new Array<boolean>(CELLS + 1).fill(false);
  reachable[0] = true;
  for (const part of parts) {
    for (let total = CELLS; total >= part; total--) {
      if (reachable[total - part]) reachable[total] = true;
    }
  }
  return reachable;
}

/** Sizes of the free region's connected blobs, under the same adjacency. */
export function freeComponents(free: Uint8Array): number[] {
  const seen = new Uint8Array(CELLS);
  const sizes: number[] = [];
  const stack: number[] = [];

  for (let start = 0; start < CELLS; start++) {
    if (!free[start] || seen[start]) continue;
    let size = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const cell = stack.pop() as number;
      size++;
      for (const next of NEIGHBOURS[cell]) {
        if (free[next] && !seen[next]) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    sizes.push(size);
  }
  return sizes;
}
