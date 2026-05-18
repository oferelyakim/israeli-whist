import type { BaseGameSettings } from '../../types/game-common';
import { GameType } from '../../types/game-common';

export interface WoodokuSettings extends BaseGameSettings {
  gameType: GameType.WOODOKU;
}

export interface WoodokuPiece {
  id: string;
  cells: [number, number][];
}

export interface WoodokuState {
  board: boolean[][];
  offered: (WoodokuPiece | null)[];
  score: number;
  phase: 'PLAYING' | 'GAME_OVER';
  selectedIndex: number | null;
  lastCleared: number;
  seed: number;
}

export interface WoodokuGameState {
  gameId: string;
  state: WoodokuState;
  settings: WoodokuSettings;
  highScore: number;
}

export type WoodokuAction =
  | { type: 'SELECT_PIECE'; index: number }
  | { type: 'PLACE_PIECE'; row: number; col: number }
  | { type: 'NEW_GAME'; seed: number };
