import { MahjongLayoutId } from '../types';
import type { MahjongLayout, TilePosition } from '../types';
import { TOTAL_TILES } from './tiles';

/** Builds a centered w x h block of tiles on `layer`, in half-tile units. */
function block(layer: number, cx: number, cy: number, w: number, h: number): TilePosition[] {
  const positions: TilePosition[] = [];
  const x0 = cx - w; // w tiles = 2w half-units wide, centered on cx
  const y0 = cy - h;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      positions.push({ layer, x: x0 + col * 2, y: y0 + row * 2 });
    }
  }
  return positions;
}

function row(layer: number, y: number, xs: number[]): TilePosition[] {
  return xs.map((x) => ({ layer, x, y }));
}

function evens(from: number, to: number): number[] {
  const out: number[] = [];
  for (let x = from; x <= to; x += 2) out.push(x);
  return out;
}

/**
 * The classic "Turtle" (a.k.a. Dragon) layout: 87 + 36 + 16 + 4 + 1 = 144.
 * The half-row at y = 7 carries the turtle's left ear (x = 0) and its two-tile
 * tail (x = 26, 28) — the tail's outer tile must come off first.
 */
function buildTurtle(): TilePosition[] {
  return [
    ...row(0, 0, evens(2, 24)),
    ...row(0, 2, evens(6, 20)),
    ...row(0, 4, evens(4, 22)),
    ...row(0, 6, evens(2, 24)),
    ...row(0, 7, [0, 26, 28]),
    ...row(0, 8, evens(2, 24)),
    ...row(0, 10, evens(4, 22)),
    ...row(0, 12, evens(6, 20)),
    ...row(0, 14, evens(2, 24)),
    ...block(1, 14, 8, 6, 6),
    ...block(2, 14, 8, 4, 4),
    ...block(3, 14, 8, 2, 2),
    { layer: 4, x: 13, y: 7 },
  ];
}

/** Stepped wedding-cake: 72 + 40 + 16 + 12 + 4 = 144. */
function buildPyramid(): TilePosition[] {
  return [
    ...block(0, 12, 6, 12, 6),
    ...block(1, 12, 6, 10, 4),
    ...block(2, 12, 6, 8, 2),
    ...block(3, 12, 6, 6, 2),
    ...block(4, 12, 6, 2, 2),
  ];
}

/** Squat keep: 96 + 32 + 16 = 144. */
function buildFortress(): TilePosition[] {
  return [
    ...block(0, 12, 8, 12, 8),
    ...block(1, 12, 8, 8, 4),
    ...block(2, 12, 8, 4, 4),
  ];
}

/**
 * Portrait-shaped board (8 wide x 12 tall): 96 + 36 + 12 = 144. The wide
 * layouts shrink to ~25px tiles on a phone; this one fits the long axis, so
 * it is the default when the app first opens on a narrow portrait screen.
 */
function buildTower(): TilePosition[] {
  return [
    ...block(0, 8, 12, 8, 12),
    ...block(1, 8, 12, 6, 6),
    ...block(2, 8, 12, 3, 4),
  ];
}

function finalize(id: MahjongLayoutId, positions: TilePosition[]): MahjongLayout {
  let width = 0;
  let height = 0;
  let maxLayer = 0;
  for (const p of positions) {
    if (p.x + 2 > width) width = p.x + 2;
    if (p.y + 2 > height) height = p.y + 2;
    if (p.layer > maxLayer) maxLayer = p.layer;
  }
  return { id, positions, width, height, maxLayer };
}

export const MAHJONG_LAYOUTS: Record<MahjongLayoutId, MahjongLayout> = {
  [MahjongLayoutId.TURTLE]: finalize(MahjongLayoutId.TURTLE, buildTurtle()),
  [MahjongLayoutId.PYRAMID]: finalize(MahjongLayoutId.PYRAMID, buildPyramid()),
  [MahjongLayoutId.FORTRESS]: finalize(MahjongLayoutId.FORTRESS, buildFortress()),
  [MahjongLayoutId.TOWER]: finalize(MahjongLayoutId.TOWER, buildTower()),
};

export const MAHJONG_LAYOUT_IDS: MahjongLayoutId[] = [
  MahjongLayoutId.TURTLE,
  MahjongLayoutId.PYRAMID,
  MahjongLayoutId.FORTRESS,
  MahjongLayoutId.TOWER,
];

export interface LayoutProblem {
  layoutId: MahjongLayoutId;
  reason: string;
}

/**
 * Startup guard, mirroring the Escape Room manifest validator: a layout with the
 * wrong tile count or duplicate slots would deal an unsolvable board.
 */
export function validateLayouts(): LayoutProblem[] {
  const problems: LayoutProblem[] = [];
  for (const id of MAHJONG_LAYOUT_IDS) {
    const layout = MAHJONG_LAYOUTS[id];
    if (layout.positions.length !== TOTAL_TILES) {
      problems.push({ layoutId: id, reason: `expected ${TOTAL_TILES} positions, got ${layout.positions.length}` });
    }
    const seen = new Set<string>();
    for (const p of layout.positions) {
      const key = `${p.layer}:${p.x}:${p.y}`;
      if (seen.has(key)) problems.push({ layoutId: id, reason: `duplicate position ${key}` });
      seen.add(key);
    }
  }
  return problems;
}
