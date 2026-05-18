import type { Card, CardKey } from '../../types/card';
import { GameType } from '../../types/game-common';
import type { PlayerType, BaseGameSettings } from '../../types/game-common';

export enum YanivPhase {
  DEALING = 'DEALING',
  PLAYER_TURN = 'PLAYER_TURN',
  QUICK_STICK = 'QUICK_STICK',
  ROUND_END = 'ROUND_END',
  GAME_OVER = 'GAME_OVER',
}

export interface YanivPlayer {
  seat: number;
  name: string;
  type: PlayerType;
  hand: Card[];
  roundScore: number;
  totalScore: number;
  eliminated: boolean;
  declaredYaniv: boolean;
  isConnected: boolean;
}

export interface DiscardGroup {
  cards: Card[];
  type: 'single' | 'set' | 'sequence';
}

export interface YanivRoundState {
  roundNumber: number;
  dealerSeat: number;
  phase: YanivPhase;
  players: YanivPlayer[];
  drawPile: Card[];
  discardPile: DiscardGroup[];
  currentPlayer: number;
  lastDiscard: DiscardGroup | null;
  lastDiscardBySeat: number | null;
  yanivDeclarer: number | null;
  quickStickEligible: boolean;
  numPlayers: number;
}

export interface YanivGameSettings extends BaseGameSettings {
  gameType: GameType.YANIV;
  handSize: 5 | 6 | 7;
  yanivThreshold: number;
  scoreLimit: number;
  assafPenalty: number;
  eliminationMode: boolean;
  ofer: boolean;
  fiftyReduction: boolean;
  australianReduction: boolean;
  useDoubleDeck: boolean;
}

export interface YanivScoreEntry {
  seat: number;
  handValue: number;
  roundScore: number;
  cumulativeScore: number;
  wasAssafed: boolean;
  declaredYaniv: boolean;
  eliminated: boolean;
  reductionApplied: number;
}

export interface YanivGameState {
  gameId: string;
  currentRound: YanivRoundState;
  scoreboard: YanivScoreEntry[][];
  settings: YanivGameSettings;
  roundCount: number;
}

export type YanivAction =
  | { type: 'DEAL'; seed: number }
  | {
      type: 'DISCARD_AND_DRAW';
      seat: number;
      discardCards: CardKey[];
      drawSource: 'pile' | 'discard';
      drawCardKey?: CardKey;
      reshuffleSeed?: number;
    }
  | { type: 'QUICK_STICK'; seat: number; discardCard: CardKey }
  | { type: 'SKIP_QUICK_STICK'; seat: number }
  | { type: 'DECLARE_YANIV'; seat: number }
  | { type: 'NEXT_ROUND'; seed: number }
  | { type: 'END_GAME' };
