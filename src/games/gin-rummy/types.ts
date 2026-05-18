import type { Card, CardKey } from '../../types/card';
import type { BaseGameSettings } from '../../types/game-common';
import { GameType, PlayerType } from '../../types/game-common';

export { GameType, PlayerType };

export enum GinRummyPhase {
  DEALING = 'DEALING',
  PLAYING = 'PLAYING',
  KNOCKING = 'KNOCKING',
  LAYING_OFF = 'LAYING_OFF',
  ROUND_END = 'ROUND_END',
}

export enum TurnStep {
  DRAW = 'DRAW',
  DISCARD = 'DISCARD',
}

export interface Meld {
  id: string;
  cards: Card[];
  type: 'set' | 'run';
}

export interface GinRummyPlayer {
  seat: number;
  name: string;
  type: PlayerType;
  hand: Card[];
  melds: Meld[];
  deadwood: Card[];
}

export interface GinRummyGameState {
  gameId: string;
  settings: GinRummyGameSettings;
  phase: GinRummyPhase;
  players: GinRummyPlayer[];
  drawPile: Card[];
  discardPile: Card[];
  currentPlayer: number;
  turnStep: TurnStep;
  winner: number | null;
  moveCount: number;
  knocker: number | null;
  isGin: boolean;
  lastDrawnFromDiscard: boolean;
  lastDrawnCard: CardKey | null;
}

export interface GinRummyGameSettings extends BaseGameSettings {
  gameType: GameType.GIN_RUMMY;
}

export type GinRummyAction =
  | { type: 'DEAL'; seed: number }
  | { type: 'DRAW_FROM_STOCK' }
  | { type: 'DRAW_FROM_DISCARD' }
  | { type: 'DISCARD'; cardKey: CardKey; knock?: boolean }
  | { type: 'LAY_OFF_ON_KNOCK'; cardKey: CardKey; meldIndex: number }
  | { type: 'DONE_LAYING_OFF' }
  | { type: 'NEW_GAME'; seed: number };
