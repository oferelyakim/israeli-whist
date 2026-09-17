import type { GameType } from '../../types/game-common';
import type { BaseGameSettings } from '../../types/game-common';

// ─── Settings ────────────────────────────────────────────────────────

export interface MahjongGameSettings extends BaseGameSettings {
  gameType: GameType.MAHJONG;
}

// ─── Tiles ───────────────────────────────────────────────────────────

export enum MahjongSuit {
  CHARACTERS = 'CHARACTERS',
  BAMBOO = 'BAMBOO',
  CIRCLES = 'CIRCLES',
  WIND = 'WIND',
  DRAGON = 'DRAGON',
  FLOWER = 'FLOWER',
  SEASON = 'SEASON',
}

/**
 * A single tile instance. `matchKey` is the ONLY thing that decides whether two
 * tiles may be removed together: suited/honour tiles match their exact twin,
 * while every flower matches every other flower and every season matches every
 * other season (standard Mahjong Solitaire rule).
 */
export interface MahjongTile {
  id: string;
  suit: MahjongSuit;
  /** 1-9 for suits, 1-4 winds, 1-3 dragons, 1-4 flowers/seasons. */
  value: number;
  matchKey: string;
}

// ─── Board geometry ──────────────────────────────────────────────────

/**
 * Board coordinates are in HALF-tile units: a tile at (x, y) occupies
 * [x, x + 2) x [y, y + 2). Half-unit offsets let layouts stagger rows
 * (the turtle's left ear / right tail sit on a half row).
 */
export interface TilePosition {
  layer: number;
  x: number;
  y: number;
}

export interface PlacedTile {
  pos: TilePosition;
  tile: MahjongTile;
}

export enum MahjongLayoutId {
  TURTLE = 'TURTLE',
  PYRAMID = 'PYRAMID',
  FORTRESS = 'FORTRESS',
  TOWER = 'TOWER',
}

export interface MahjongLayout {
  id: MahjongLayoutId;
  positions: TilePosition[];
  /** Board extent in half-tile units, used for scaling. */
  width: number;
  height: number;
  maxLayer: number;
}

// ─── Game state ──────────────────────────────────────────────────────

export enum MahjongPhase {
  PLAYING = 'PLAYING',
  WON = 'WON',
}

export interface MahjongGameState {
  settings: MahjongGameSettings;
  phase: MahjongPhase;
  seed: number;
  layoutId: MahjongLayoutId;
  /** Tiles still on the board. */
  tiles: PlacedTile[];
  selectedId: string | null;
  /** Snapshots of `tiles` for undo (most recent last). */
  history: PlacedTile[][];
  moves: number;
  hintPair: [string, string] | null;
  shufflesUsed: number;
  elapsedSeconds: number;
  /** True when no match is available and the player must shuffle or restart. */
  stuck: boolean;
}

// ─── Actions ─────────────────────────────────────────────────────────

export type MahjongAction =
  | { type: 'DEAL'; seed: number; layoutId: MahjongLayoutId }
  | { type: 'TAP_TILE'; tileId: string }
  | { type: 'CLEAR_SELECTION' }
  | { type: 'UNDO' }
  | { type: 'HINT' }
  | { type: 'SHUFFLE' }
  | { type: 'TICK' }
  | { type: 'RESTART_SAME_TILES' };

// ─── Leaderboard ─────────────────────────────────────────────────────

export interface MahjongLeaderboardEntry {
  layoutId: MahjongLayoutId;
  seconds: number;
  moves: number;
  date: string;
}
