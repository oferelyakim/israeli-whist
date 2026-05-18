import type { Card, CardKey } from '../../types/card';
import { GameType } from '../../types/game-common';
import type { PlayerType, BaseGameSettings } from '../../types/game-common';

export enum ShitheadPhase {
  DEALING = 'DEALING',
  SWAPPING = 'SWAPPING',    // Pre-game swap hand<->face-up
  PLAYING = 'PLAYING',
  ROUND_END = 'ROUND_END',  // Someone is the shithead
}

export interface ShitheadPlayer {
  seat: number;
  name: string;
  type: PlayerType;
  hand: Card[];
  faceUp: Card[];    // 3 visible cards on table
  faceDown: Card[];  // 3 hidden cards on table
  finished: boolean; // Player has shed all cards
  finishOrder: number; // 0 = not finished, 1 = first out, etc.
  isConnected: boolean;
}

export interface ShitheadGameState {
  gameId: string;
  settings: ShitheadGameSettings;
  phase: ShitheadPhase;
  players: ShitheadPlayer[];
  drawPile: Card[];
  discardPile: Card[];     // top is last element
  currentPlayer: number;   // seat index
  numPlayers: number;
  finishedCount: number;   // how many players have finished
  lastPlayedBy: number;    // seat of last player who played (not picked up)
  shitheadSeat: number | null; // the loser
  burnAnimation: boolean;  // UI flag for pile burn animation
}

export interface ShitheadGameSettings extends BaseGameSettings {
  gameType: GameType.SHITHEAD;
}

export type ShitheadAction =
  | { type: 'DEAL'; seed: number }
  | { type: 'SWAP_CARDS'; seat: number; handCardKey: CardKey; faceUpCardKey: CardKey }
  | { type: 'DONE_SWAPPING'; seat: number }
  | { type: 'PLAY_CARDS'; seat: number; cardKeys: CardKey[] }
  | { type: 'PICK_UP_PILE'; seat: number }
  | { type: 'PLAY_BLIND'; seat: number; cardIndex: number }  // Play a face-down card
  | { type: 'NEW_GAME'; seed: number };
