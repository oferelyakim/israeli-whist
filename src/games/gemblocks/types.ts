import type { GameType } from '../../types/game-common';
import type { BaseGameSettings } from '../../types/game-common';

// ─── Settings ────────────────────────────────────────────────────────

export interface GemBlocksSettings extends BaseGameSettings {
  gameType: GameType.GEM_BLOCKS;
}

// ─── Pieces ──────────────────────────────────────────────────────────

/** A shape, as offsets from its top-left corner. Pieces never rotate in play. */
export interface GemPiece {
  id: string;
  cells: ReadonlyArray<readonly [number, number]>;
}

/**
 * One of the three shapes on offer. `gemIndex` points at the cell of
 * `piece.cells` carrying a gem, which is deposited on the board when the piece
 * is placed; null means a plain piece. `key` is unique per offer so React can
 * tell two identical shapes apart.
 */
export interface OfferedPiece {
  key: string;
  piece: GemPiece;
  gemIndex: number | null;
}

// ─── Game state ──────────────────────────────────────────────────────

export enum GemPhase {
  PLAYING = 'PLAYING',
  WON = 'WON',
  GAME_OVER = 'GAME_OVER',
}

/** What the last placement cleared — drives the flash, then resets. */
export interface ClearSummary {
  rows: number[];
  cols: number[];
  boxes: number[];
  cells: string[];
  gems: number;
}

export interface GemBlocksGameState {
  settings: GemBlocksSettings;
  phase: GemPhase;
  /** Occupied squares. */
  board: boolean[][];
  /** Gems resting on squares, filled or not. */
  gems: boolean[][];
  offered: (OfferedPiece | null)[];
  selectedIndex: number | null;
  gemsCollected: number;
  goal: number;
  score: number;
  moves: number;
  elapsedSeconds: number;
  seed: number;
  /** Counter behind `OfferedPiece.key`. */
  pieceSerial: number;
  lastClear: ClearSummary | null;
}

// ─── Actions ─────────────────────────────────────────────────────────

export type GemBlocksAction =
  | { type: 'NEW_GAME'; seed: number }
  | { type: 'SELECT_PIECE'; index: number | null }
  | { type: 'PLACE_PIECE'; index: number; row: number; col: number }
  | { type: 'CLEAR_FLASH' }
  | { type: 'TICK' };

// ─── Saved progress ──────────────────────────────────────────────────

export interface GemBlocksRecord {
  moves: number;
  seconds: number;
  date: string;
}
