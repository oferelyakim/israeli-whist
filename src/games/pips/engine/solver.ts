import type { CellKey, PipsDomino, PipsPlacement, PipsRegion } from '../types';
import { regionStatus, regionsByCell, stepFrom } from './board';

export interface SolverInput {
  cells: readonly CellKey[];
  regions: readonly PipsRegion[];
  dominoes: readonly PipsDomino[];
}

export interface SolveOutcome {
  /** Distinct pip layouts found, counted up to `limit`. */
  count: number;
  first: PipsPlacement[] | null;
  /** False when the node budget ran out, so `count` is only a lower bound. */
  complete: boolean;
}

const DEFAULT_NODE_CAP = 400_000;

/**
 * Counts the ways the given dominoes tile the board within the constraints.
 *
 * Two things keep this cheap enough to run inside the generator's uniqueness
 * loop. The search always extends from the FIRST uncovered cell in row-major
 * order, so it only ever reaches right or down — a tiling is therefore built
 * exactly once instead of once per ordering. And every pair of cells is checked
 * against its regions the moment it is laid, which prunes on `regionStatus`
 * being permanently `bad`.
 *
 * Solutions are counted as distinct PIP LAYOUTS, not distinct placements: if
 * two tilings show the player the same grid of pips, the puzzle reads as having
 * one answer and both are wins.
 */
export function solve(
  input: SolverInput,
  limit = 2,
  nodeCap = DEFAULT_NODE_CAP,
): SolveOutcome {
  const order = [...input.cells];
  const boardSet = new Set(order);
  const regionOf = regionsByCell(input.regions);
  const dominoes = input.dominoes;

  const values = new Map<CellKey, number>();
  const used = new Array<boolean>(dominoes.length).fill(false);
  const placed: PipsPlacement[] = [];
  const seen = new Set<string>();

  let first: PipsPlacement[] | null = null;
  let complete = true;
  let nodes = 0;

  /** True when the pair just laid already breaks one of its regions. */
  function broken(one: CellKey, two: CellKey): boolean {
    const regionOne = regionOf.get(one);
    if (regionOne && regionStatus(regionOne, values) === 'bad') return true;
    const regionTwo = regionOf.get(two);
    if (regionTwo && regionTwo !== regionOne && regionStatus(regionTwo, values) === 'bad') {
      return true;
    }
    return false;
  }

  /** Returns true to abort the whole search. */
  function search(from: number): boolean {
    if (++nodes > nodeCap) {
      complete = false;
      return true;
    }

    let index = -1;
    for (let i = from; i < order.length; i++) {
      if (!values.has(order[i])) {
        index = i;
        break;
      }
    }

    if (index === -1) {
      let layout = '';
      for (const cell of order) layout += `${values.get(cell)},`;
      if (!seen.has(layout)) {
        seen.add(layout);
        if (!first) first = placed.map((p) => ({ dominoId: p.dominoId, cells: [...p.cells] as [CellKey, CellKey] }));
      }
      return seen.size >= limit;
    }

    const cell = order[index];
    // Everything before `cell` is covered, so a partner can only lie right or
    // down. That is what makes each tiling appear exactly once.
    for (let direction = 0; direction < 2; direction++) {
      const partner = stepFrom(cell, direction);
      if (!boardSet.has(partner) || values.has(partner)) continue;

      for (let d = 0; d < dominoes.length; d++) {
        if (used[d]) continue;
        const domino = dominoes[d];
        const ends: ReadonlyArray<readonly [number, number]> =
          domino.a === domino.b
            ? [[domino.a, domino.b]]
            : [[domino.a, domino.b], [domino.b, domino.a]];

        for (const [onCell, onPartner] of ends) {
          values.set(cell, onCell);
          values.set(partner, onPartner);

          if (!broken(cell, partner)) {
            used[d] = true;
            placed.push({
              dominoId: domino.id,
              cells: onCell === domino.a ? [cell, partner] : [partner, cell],
            });
            const abort = search(index);
            placed.pop();
            used[d] = false;
            if (abort) {
              values.delete(cell);
              values.delete(partner);
              return true;
            }
          }

          values.delete(cell);
          values.delete(partner);
        }
      }
    }
    return false;
  }

  search(0);
  return { count: seen.size, first, complete };
}

/** True when the board can be filled exactly one way, proven within budget. */
export function hasUniqueSolution(input: SolverInput, nodeCap = DEFAULT_NODE_CAP): boolean {
  const outcome = solve(input, 2, nodeCap);
  return outcome.complete && outcome.count === 1;
}
