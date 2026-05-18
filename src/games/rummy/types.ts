import type { Card, CardKey } from '../../types/card';
import type { BaseGameSettings } from '../../types/game-common';
import { GameType, PlayerType } from '../../types/game-common';

export { GameType, PlayerType };

export enum RummyVariant {
  BASIC = 'BASIC',
  GIN = 'GIN',
  ISRAELI = 'ISRAELI',
}

export enum RummyPhase {
  DEALING = 'DEALING',
  PLAYING = 'PLAYING',
  ROUND_END = 'ROUND_END',
  KNOCK_REVEAL = 'KNOCK_REVEAL',  // Gin: after knock, defender lays off
}

export enum TurnStep {
  DRAW = 'DRAW',       // Must draw a card
  MELD = 'MELD',       // Can meld/layoff (optional), then must discard
}

export interface Meld {
  id: string;         // unique meld ID
  cards: Card[];      // cards in the meld
  type: 'set' | 'run';
}

export interface RummyPlayer {
  seat: number;
  name: string;
  type: PlayerType;
  hand: Card[];
  isConnected: boolean;
}

export interface GinState {
  knocker: number;              // seat of who knocked
  knockerMelds: Meld[];        // knocker's declared melds
  knockerDeadwood: Card[];     // knocker's unmelded cards
  defenderDeadwood: Card[];    // defender's remaining cards
  isGin: boolean;              // true if knocker has gin
  lastDrawnFromDiscard: boolean; // track last draw source
  lastDrawnCard: CardKey | null; // card drawn from discard (can't discard it back)
}

export interface RummyGameState {
  gameId: string;
  settings: RummyGameSettings;
  phase: RummyPhase;
  players: RummyPlayer[];
  drawPile: Card[];
  discardPile: Card[];
  melds: Meld[];           // All melds on the table (shared)
  currentPlayer: number;   // seat index
  turnStep: TurnStep;
  numPlayers: number;
  winner: number | null;   // seat of winner
  moveCount: number;
  ginState?: GinState;     // Gin Rummy specific state
  consecutiveSkips?: number; // turns passed in a row when deck is exhausted
}

export interface RummyGameSettings extends BaseGameSettings {
  gameType: GameType.RUMMY;
  variant?: RummyVariant;
}

export type RummyAction =
  | { type: 'DEAL'; seed: number }
  | { type: 'DRAW_FROM_STOCK' }
  | { type: 'DRAW_FROM_DISCARD' }
  | { type: 'MELD_CARDS'; cardKeys: CardKey[] }
  | { type: 'LAY_OFF'; cardKey: CardKey; meldId: string }
  | { type: 'DISCARD'; cardKey: CardKey }
  | { type: 'PASS_TURN' }
  | { type: 'NEW_GAME'; seed: number }
  | { type: 'KNOCK'; melds: CardKey[][] }
  | { type: 'GIN'; melds: CardKey[][] }
  | { type: 'DEFENDER_LAYOFF'; cardKey: CardKey; meldIndex: number }
  | { type: 'DEFENDER_DONE' };
