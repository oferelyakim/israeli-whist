import type { GameType } from '../../types/game-common';
import type { BaseGameSettings } from '../../types/game-common';

// ─── Settings ────────────────────────────────────────────────────────

export interface PipsSettings extends BaseGameSettings {
  gameType: GameType.PIPS;
}

// ─── Board ───────────────────────────────────────────────────────────

/** `"row,col"`. Boards are irregular, so cells are a set rather than a grid. */
export type CellKey = string;

export enum PipsDifficulty {
  EASY = 1,
  MEDIUM = 2,
  HARD = 3,
}

/**
 * What a coloured region demands of the pips inside it.
 *
 * `SUM`/`GT`/`LT` compare the region's total against `value`; `EQUAL` wants
 * every cell the same, `DISTINCT` wants them all different, and `NONE` marks
 * cells that only have to be covered.
 */
export type ConstraintKind = 'SUM' | 'GT' | 'LT' | 'EQUAL' | 'DISTINCT' | 'NONE';

export interface PipsRegion {
  id: string;
  cells: CellKey[];
  kind: ConstraintKind;
  /** Only meaningful for SUM, GT and LT. */
  value: number;
  /** Palette index, so a region keeps its colour across renders. */
  colour: number;
}

/** One tile from a double-six set. `a` and `b` are its two pip counts. */
export interface PipsDomino {
  id: string;
  a: number;
  b: number;
}

/** A domino on the board: `cells[0]` carries `a`, `cells[1]` carries `b`. */
export interface PipsPlacement {
  dominoId: string;
  cells: [CellKey, CellKey];
}

export interface PipsPuzzle {
  difficulty: PipsDifficulty;
  seed: number;
  rows: number;
  cols: number;
  /** Every playable cell, row-major. */
  cells: CellKey[];
  regions: PipsRegion[];
  dominoes: PipsDomino[];
  /** One winning arrangement — used by the hint, and by the tests. */
  solution: PipsPlacement[];
}

// ─── Game state ──────────────────────────────────────────────────────

export enum PipsPhase {
  PLAYING = 'PLAYING',
  SOLVED = 'SOLVED',
}

/**
 * Which way a held domino lies, as an index into `DELTAS`: 0 right, 1 down,
 * 2 left, 3 up. `a` always sits on the anchor cell, so cycling all four covers
 * both rotating the tile and swapping its ends.
 */
export type Orientation = 0 | 1 | 2 | 3;

export interface PipsGameState {
  settings: PipsSettings;
  phase: PipsPhase;
  levelIndex: number;
  puzzle: PipsPuzzle;
  placements: PipsPlacement[];
  /** Domino picked up from the tray, if any. */
  selectedId: string | null;
  orientation: Orientation;
  moves: number;
  hintsUsed: number;
  elapsedSeconds: number;
}

export type PipsAction =
  | { type: 'LOAD_LEVEL'; levelIndex: number; puzzle: PipsPuzzle }
  | { type: 'SELECT_DOMINO'; id: string | null }
  | { type: 'ROTATE' }
  | { type: 'PLACE'; dominoId: string; anchor: CellKey; orientation: Orientation }
  | { type: 'LIFT'; cell: CellKey }
  | { type: 'CLEAR_BOARD' }
  | { type: 'HINT' }
  | { type: 'TICK' };

// ─── Saved progress ──────────────────────────────────────────────────

export interface PipsProgress {
  levelIndex: number;
}

export interface PipsRecord {
  levelIndex: number;
  seconds: number;
  date: string;
}
