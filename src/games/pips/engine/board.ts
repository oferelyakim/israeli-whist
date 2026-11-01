import type {
  CellKey,
  Orientation,
  PipsDomino,
  PipsPlacement,
  PipsPuzzle,
  PipsRegion,
} from '../types';

/** Highest pip count on a double-six tile. */
export const MAX_PIP = 6;

/**
 * How many colours the board may draw regions in.
 *
 * The renderer's palette must hold exactly this many. Hard boards reach twelve
 * regions, and with a shorter palette two of them wrap to the same colour; when
 * those two happen to touch they read as one scattered region, which is exactly
 * the sort of thing a player tries to fill with a single domino.
 */
export const REGION_COLOURS = 12;

export function key(row: number, col: number): CellKey {
  return `${row},${col}`;
}

export function parseKey(cell: CellKey): readonly [number, number] {
  const comma = cell.indexOf(',');
  return [Number(cell.slice(0, comma)), Number(cell.slice(comma + 1))];
}

/** Indexed by `Orientation`: right, down, left, up. */
export const DELTAS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

export function stepFrom(cell: CellKey, orientation: number): CellKey {
  const [r, c] = parseKey(cell);
  const [dr, dc] = DELTAS[orientation];
  return key(r + dr, c + dc);
}

/** The two cells a domino covers when its `a` end sits on `anchor`. */
export function placementCells(anchor: CellKey, orientation: Orientation): [CellKey, CellKey] {
  return [anchor, stepFrom(anchor, orientation)];
}

/** Which way a tile already on the board is lying. */
export function orientationOf(cells: readonly [CellKey, CellKey]): Orientation {
  const [r0, c0] = parseKey(cells[0]);
  const [r1, c1] = parseKey(cells[1]);
  if (c1 - c0 === 1) return 0;
  if (r1 - r0 === 1) return 1;
  if (c1 - c0 === -1) return 2;
  return 3;
}

export function canPlace(
  boardCells: ReadonlySet<CellKey>,
  occupied: ReadonlySet<CellKey>,
  anchor: CellKey,
  orientation: Orientation,
): boolean {
  const [first, second] = placementCells(anchor, orientation);
  if (!boardCells.has(first) || !boardCells.has(second)) return false;
  return !occupied.has(first) && !occupied.has(second);
}

/** Which pip count is showing on each covered cell. */
export function cellValues(
  dominoes: readonly PipsDomino[],
  placements: readonly PipsPlacement[],
): Map<CellKey, number> {
  const byId = new Map(dominoes.map((d) => [d.id, d]));
  const values = new Map<CellKey, number>();
  for (const placed of placements) {
    const domino = byId.get(placed.dominoId);
    if (!domino) continue;
    values.set(placed.cells[0], domino.a);
    values.set(placed.cells[1], domino.b);
  }
  return values;
}

export function occupiedCells(placements: readonly PipsPlacement[]): Set<CellKey> {
  const taken = new Set<CellKey>();
  for (const placed of placements) {
    taken.add(placed.cells[0]);
    taken.add(placed.cells[1]);
  }
  return taken;
}

export function regionsByCell(regions: readonly PipsRegion[]): Map<CellKey, PipsRegion> {
  const index = new Map<CellKey, PipsRegion>();
  for (const region of regions) {
    for (const cell of region.cells) index.set(cell, region);
  }
  return index;
}

/** Do two regions touch, counting corners? Two blobs meeting at a corner read
 *  as one shape, so diagonal contact matters as much as edge contact. */
export function regionsTouch(a: PipsRegion, b: PipsRegion): boolean {
  const theirs = new Set(b.cells);
  for (const cell of a.cells) {
    const [row, col] = parseKey(cell);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (theirs.has(key(row + dr, col + dc))) return true;
      }
    }
  }
  return false;
}

export type RegionStatus = 'open' | 'ok' | 'bad';

/**
 * How a region stands given what is on the board so far.
 *
 * `bad` is permanent: every test below is monotone in the cells still to be
 * filled (a pip is never negative and never above six), so a region that reads
 * `bad` on a partial board cannot come good later. That is what lets the solver
 * prune on this function and the UI warn the player immediately.
 */
export function regionStatus(
  region: PipsRegion,
  values: ReadonlyMap<CellKey, number>,
): RegionStatus {
  const filled: number[] = [];
  for (const cell of region.cells) {
    const value = values.get(cell);
    if (value !== undefined) filled.push(value);
  }
  const empty = region.cells.length - filled.length;
  const complete = empty === 0;

  switch (region.kind) {
    case 'NONE':
      return complete ? 'ok' : 'open';

    case 'EQUAL':
      for (const value of filled) if (value !== filled[0]) return 'bad';
      return complete ? 'ok' : 'open';

    case 'DISTINCT': {
      const seen = new Set(filled);
      if (seen.size !== filled.length) return 'bad';
      return complete ? 'ok' : 'open';
    }

    default: {
      let sum = 0;
      for (const value of filled) sum += value;
      const most = sum + MAX_PIP * empty;

      if (region.kind === 'SUM') {
        if (sum > region.value || most < region.value) return 'bad';
      } else if (region.kind === 'GT') {
        if (most <= region.value) return 'bad';
      } else if (sum >= region.value) {
        return 'bad';
      }
      return complete ? 'ok' : 'open';
    }
  }
}

/** Solved means every domino is down, every cell covered and every region met. */
export function isSolved(
  puzzle: Pick<PipsPuzzle, 'cells' | 'regions' | 'dominoes'>,
  placements: readonly PipsPlacement[],
): boolean {
  if (placements.length !== puzzle.dominoes.length) return false;
  const values = cellValues(puzzle.dominoes, placements);
  if (values.size !== puzzle.cells.length) return false;
  return puzzle.regions.every((region) => regionStatus(region, values) === 'ok');
}

export function constraintLabel(region: PipsRegion): string {
  switch (region.kind) {
    case 'SUM': return String(region.value);
    case 'GT': return `>${region.value}`;
    case 'LT': return `<${region.value}`;
    case 'EQUAL': return '=';
    case 'DISTINCT': return '≠';
    default: return '';
  }
}
