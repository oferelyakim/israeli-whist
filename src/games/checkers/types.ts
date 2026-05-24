import type { BaseGameSettings } from '../../types/game-common';
import { GameType } from '../../types/game-common';

export interface CheckersSettings extends BaseGameSettings {
  gameType: GameType.CHECKERS;
  difficulty?: 1 | 2 | 3;
}

export const CHECKERS_DEFAULTS = {
  difficulty: 2 as 1 | 2 | 3,
} as const;

export type PieceColor = 'red' | 'black';

export interface Piece {
  color: PieceColor;
  king: boolean;
}

export type Board = (Piece | null)[][];

export interface CheckersState {
  board: Board;
  turn: PieceColor;
  phase: 'PLAYING' | 'GAME_OVER';
  winner: PieceColor | null;
  selectedRow: number | null;
  selectedCol: number | null;
  forcedPieces: Array<[number, number]>;
  jumpingPiece: [number, number] | null;
  scores: { red: number; black: number };
}

export interface CheckersGameState {
  gameId: string;
  state: CheckersState;
  settings: CheckersSettings;
}

export type CheckersAction =
  | { type: 'SELECT_PIECE'; row: number; col: number }
  | { type: 'MOVE_PIECE'; fromRow: number; fromCol: number; toRow: number; toCol: number }
  | { type: 'NEW_GAME' };
