import type { BaseGameSettings } from '../../types/game-common';
import { GameType, PlayerType } from '../../types/game-common';

export interface BackgammonSettings extends BaseGameSettings {
  gameType: GameType.BACKGAMMON;
  playerColor?: BgColor;    // which color the human plays, default 'white'
  homeRight?: boolean;      // home quadrant on right (standard), default true
  difficulty?: 1 | 2 | 3;  // AI difficulty, default 2
  showMoveHints?: boolean;  // highlight valid source squares before selection
}

export const BG_DEFAULTS = {
  playerColor: 'white' as BgColor,
  homeRight: true,
  difficulty: 2 as 1 | 2 | 3,
  showMoveHints: false,
} as const;

// white moves from point 24→1 (index 23→0), black moves 1→24 (index 0→23)
export type BgColor = 'white' | 'black';

export interface BgPoint {
  color: BgColor | null;
  count: number;
}

export interface BgState {
  board: BgPoint[];
  bar: { white: number; black: number };
  off: { white: number; black: number };
  dice: number[];
  diceRolled: boolean;
  turn: BgColor;
  phase: 'ROLLING' | 'MOVING' | 'GAME_OVER';
  winner: BgColor | null;
  scores: { white: number; black: number };
}

export interface BackgammonPlayer {
  seat: number;
  name: string;
  type: PlayerType;
  color: BgColor;
}

export interface BackgammonGameState {
  gameId: string;
  state: BgState;
  settings: BackgammonSettings;
  players: BackgammonPlayer[];
}

/** A single legal move entry. `via` is set for combined-dice moves (both dice on one checker). */
export interface BgMove {
  from: number | 'bar';
  to: number;
  via?: number; // intermediate point when using 2 dice on one checker
}

export type BackgammonAction =
  | { type: 'ROLL_DICE'; seed: number }
  | { type: 'MOVE_CHECKER'; from: number | 'bar'; to: number }
  | { type: 'COMBINED_MOVE'; from: number | 'bar'; via: number; to: number }
  | { type: 'PASS_TURN' }
  | { type: 'NEW_GAME'; seed: number };
