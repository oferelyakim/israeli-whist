import type { MahjongLayout, PlacedTile, TilePosition } from '../types';
import { tilesMatch } from './tiles';

/**
 * Per-position adjacency, derived once per layout. Tiles occupy a 2x2 span in
 * half-tile units, so two slots on the same layer touch when their x differs by
 * exactly 2 and their y spans overlap (|dy| < 2); a slot one layer up covers
 * this one when both spans overlap.
 */
export interface LayoutTopology {
  above: number[][];
  left: number[][];
  right: number[][];
}

const topologyCache = new WeakMap<MahjongLayout, LayoutTopology>();

function overlaps(a: number, b: number): boolean {
  return Math.abs(a - b) < 2;
}

export function getTopology(layout: MahjongLayout): LayoutTopology {
  const cached = topologyCache.get(layout);
  if (cached) return cached;

  const { positions } = layout;
  const above: number[][] = positions.map(() => []);
  const left: number[][] = positions.map(() => []);
  const right: number[][] = positions.map(() => []);

  for (let i = 0; i < positions.length; i++) {
    const a = positions[i];
    for (let j = 0; j < positions.length; j++) {
      if (i === j) continue;
      const b = positions[j];
      if (b.layer === a.layer + 1 && overlaps(a.x, b.x) && overlaps(a.y, b.y)) {
        above[i].push(j);
      } else if (b.layer === a.layer && overlaps(a.y, b.y)) {
        if (b.x === a.x - 2) left[i].push(j);
        else if (b.x === a.x + 2) right[i].push(j);
      }
    }
  }

  const topology: LayoutTopology = { above, left, right };
  topologyCache.set(layout, topology);
  return topology;
}

/** A slot is free when nothing covers it and at least one long side is clear. */
export function isSlotFree(topology: LayoutTopology, index: number, occupied: Set<number>): boolean {
  if (topology.above[index].some((i) => occupied.has(i))) return false;
  const blockedLeft = topology.left[index].some((i) => occupied.has(i));
  const blockedRight = topology.right[index].some((i) => occupied.has(i));
  return !blockedLeft || !blockedRight;
}

export function freeSlots(topology: LayoutTopology, occupied: Set<number>): number[] {
  const out: number[] = [];
  for (const index of occupied) {
    if (isSlotFree(topology, index, occupied)) out.push(index);
  }
  return out;
}

// ─── Runtime (game-state) helpers ────────────────────────────────────

function slotIndexMap(layout: MahjongLayout): Map<string, number> {
  const map = new Map<string, number>();
  layout.positions.forEach((p, i) => map.set(posKey(p), i));
  return map;
}

export function posKey(pos: TilePosition): string {
  return `${pos.layer}:${pos.x}:${pos.y}`;
}

/** Slot indices still holding a tile, keyed by tile id for lookup. */
export function occupancy(layout: MahjongLayout, tiles: PlacedTile[]): {
  occupied: Set<number>;
  indexByTileId: Map<string, number>;
} {
  const slots = slotIndexMap(layout);
  const occupied = new Set<number>();
  const indexByTileId = new Map<string, number>();
  for (const placed of tiles) {
    const index = slots.get(posKey(placed.pos));
    if (index === undefined) continue;
    occupied.add(index);
    indexByTileId.set(placed.tile.id, index);
  }
  return { occupied, indexByTileId };
}

export function freeTileIds(layout: MahjongLayout, tiles: PlacedTile[]): Set<string> {
  const topology = getTopology(layout);
  const { occupied, indexByTileId } = occupancy(layout, tiles);
  const free = new Set<string>();
  for (const placed of tiles) {
    const index = indexByTileId.get(placed.tile.id);
    if (index !== undefined && isSlotFree(topology, index, occupied)) free.add(placed.tile.id);
  }
  return free;
}

/** Every removable pair currently on the board. */
export function availableMatches(layout: MahjongLayout, tiles: PlacedTile[]): [string, string][] {
  const free = freeTileIds(layout, tiles);
  const freeTiles = tiles.filter((placed) => free.has(placed.tile.id));
  const matches: [string, string][] = [];
  for (let i = 0; i < freeTiles.length; i++) {
    for (let j = i + 1; j < freeTiles.length; j++) {
      if (tilesMatch(freeTiles[i].tile, freeTiles[j].tile)) {
        matches.push([freeTiles[i].tile.id, freeTiles[j].tile.id]);
      }
    }
  }
  return matches;
}

export function hasAvailableMatch(layout: MahjongLayout, tiles: PlacedTile[]): boolean {
  return availableMatches(layout, tiles).length > 0;
}
