import type { Card } from '../../types/card';
import type { BaseGameSettings } from '../../types/game-common';
import { GameType, PlayerType } from '../../types/game-common';

export { GameType, PlayerType };

export enum IsraeliRummyPhase {
  DEALING = 'DEALING',
  PLAYING = 'PLAYING',
  ROUND_END = 'ROUND_END',
}

/**
 * On each turn the player can do ONE of:
 * - DRAW: Take a card from the draw pile (turn ends immediately)
 * - MELD: Put down melds / lay off / rearrange table (no drawing)
 */
export enum TurnAction {
  CHOOSE = 'CHOOSE',       // Player must choose: draw or meld
  REARRANGING = 'REARRANGING', // Player is rearranging the table
}

export interface Meld {
  id: string;
  cards: Card[];
  type: 'set' | 'run';
}

export interface IsraeliRummyPlayer {
  seat: number;
  name: string;
  type: PlayerType;
  hand: Card[];
  hasMetFirstMeld: boolean;
  isConnected: boolean;
}

/**
 * Snapshot of the board before rearrangement starts.
 * Used to revert if the player can't form valid melds.
 */
export interface BoardSnapshot {
  melds: Meld[];
  hand: Card[];
}

export interface IsraeliRummyGameState {
  gameId: string;
  settings: IsraeliRummyGameSettings;
  phase: IsraeliRummyPhase;
  players: IsraeliRummyPlayer[];
  drawPile: Card[];
  melds: Meld[];
  currentPlayer: number;
  turnAction: TurnAction;
  numPlayers: number;
  winner: number | null;
  moveCount: number;
  firstMeldThreshold: number; // 30
  /** Saved state before rearrangement so we can revert */
  boardSnapshot: BoardSnapshot | null;
  /**
   * Turns in a row where no tile was placed on the table. Resets on any
   * successful COMMIT_MELDS that placed at least one card from hand. Used
   * to detect the "nobody can play" deadlock when the draw pile is empty:
   * after 2 full rounds (2 * numPlayers) the round ends and the winner is
   * the player with the lowest total point value in hand.
   */
  consecutivePasses: number;
}

export interface IsraeliRummyGameSettings extends BaseGameSettings {
  gameType: GameType.ISRAELI_RUMMY;
}

export type IsraeliRummyAction =
  | { type: 'DEAL'; seed: number }
  | { type: 'DRAW_CARD' }                                // Take from draw pile, end turn
  | { type: 'START_REARRANGE' }                           // Enter rearrange mode
  | { type: 'COMMIT_MELDS'; melds: Meld[]; hand: Card[] } // Commit new table arrangement
  | { type: 'REVERT_REARRANGE' }                          // Revert to snapshot
  | { type: 'PASS_TURN' }                                 // Pass without doing anything (after revert)
  | { type: 'NEW_GAME'; seed: number };
