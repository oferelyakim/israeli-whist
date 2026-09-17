import type { MahjongLayout, MahjongTile, PlacedTile } from '../types';
import { createRNG } from '../../../utils/random';
import { buildTilePairs, regroupIntoPairs } from './tiles';
import { getTopology, isSlotFree, occupancy } from './board';

const MAX_ATTEMPTS = 60;

export interface DealResult {
  tiles: PlacedTile[];
  /** Pairs in the order they can legally be taken off, by tile id. */
  solution: [string, string][] | null;
}

function pickIndex(rng: () => number, length: number): number {
  return Math.min(length - 1, Math.floor(rng() * length));
}

/**
 * Assigns matching pairs to slots so the board is guaranteed solvable.
 *
 * At every step we look at the slots that are free *given everything still
 * unassigned is occupied*, and drop one matching pair onto two of them. Because
 * step 1's occupancy is the board's opening position and each later step's
 * occupancy is exactly the position after the previous pair comes off, the
 * assignment order is itself a winning line of play.
 *
 * Returns null if a step ever finds fewer than two free slots (the caller
 * retries with a different seed).
 */
function tryAssign(
  layout: MahjongLayout,
  slotIndices: number[],
  pairs: [MahjongTile, MahjongTile][],
  rng: () => number,
): DealResult | null {
  const topology = getTopology(layout);
  const remaining = new Set(slotIndices);
  const order: [number, number][] = [];

  while (remaining.size > 0) {
    const free: number[] = [];
    for (const index of remaining) {
      if (isSlotFree(topology, index, remaining)) free.push(index);
    }
    if (free.length < 2) return null;

    const first = free[pickIndex(rng, free.length)];
    let second = first;
    while (second === first) second = free[pickIndex(rng, free.length)];

    remaining.delete(first);
    remaining.delete(second);
    order.push([first, second]);
  }

  if (order.length !== pairs.length) return null;

  const tiles: PlacedTile[] = [];
  const solution: [string, string][] = [];
  order.forEach(([slotA, slotB], i) => {
    const [tileA, tileB] = pairs[i];
    tiles.push({ pos: layout.positions[slotA], tile: tileA });
    tiles.push({ pos: layout.positions[slotB], tile: tileB });
    solution.push([tileA.id, tileB.id]);
  });
  return { tiles, solution };
}

function assignWithRetries(
  layout: MahjongLayout,
  slotIndices: number[],
  pairs: [MahjongTile, MahjongTile][],
  seed: number,
): DealResult {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = tryAssign(layout, slotIndices, pairs, createRNG(seed + attempt * 7919));
    if (result) return result;
  }
  // Layouts in MAHJONG_LAYOUTS always leave two free slots, so this is a
  // safety net rather than an expected path: deal in slot order so the player
  // still gets a board (possibly unwinnable) instead of a crash.
  const flat = pairs.flat();
  return {
    tiles: slotIndices.map((slotIndex, i) => ({ pos: layout.positions[slotIndex], tile: flat[i] })),
    solution: null,
  };
}

/** Deal plus the winning line the dealer built it around (null on fallback). */
export function generateSolvableDeal(layout: MahjongLayout, seed: number): DealResult {
  const slotIndices = layout.positions.map((_, i) => i);
  return assignWithRetries(layout, slotIndices, buildTilePairs(), seed);
}

export function generateSolvableBoard(layout: MahjongLayout, seed: number): PlacedTile[] {
  return generateSolvableDeal(layout, seed).tiles;
}

/**
 * Re-deals the tiles that are still on the board across the slots they already
 * occupy, so a shuffle always hands back a solvable position.
 */
export function reshuffleRemaining(
  layout: MahjongLayout,
  tiles: PlacedTile[],
  seed: number,
): PlacedTile[] {
  if (tiles.length === 0) return [];
  const { occupied } = occupancy(layout, tiles);
  const slotIndices = [...occupied];
  const pairs = regroupIntoPairs(tiles.map((placed) => placed.tile));
  return assignWithRetries(layout, slotIndices, pairs, seed).tiles;
}
