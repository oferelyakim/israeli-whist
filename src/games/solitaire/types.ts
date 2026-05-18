import type { Card, CardKey } from '../../types/card';
import type { GameType } from '../../types/game-common';
import type { BaseGameSettings } from '../../types/game-common';

// ─── Settings ────────────────────────────────────────────────────────

export interface SolitaireGameSettings extends BaseGameSettings {
  gameType: GameType.SOLITAIRE;
}

// ─── Game phases ─────────────────────────────────────────────────────

export enum SolitairePhase {
  DEALING = 'DEALING',
  PLAYING = 'PLAYING',
  AUTO_COMPLETING = 'AUTO_COMPLETING',
  WON = 'WON',
}

// ─── Tableau column ──────────────────────────────────────────────────

export interface TableauColumn {
  faceDown: Card[];
  faceUp: Card[];
}

// ─── Foundation pile (builds A → K by suit) ──────────────────────────

export interface FoundationPile {
  cards: Card[];
}

// ─── Joker tracking ──────────────────────────────────────────────────

export type JokerLocation =
  | { type: 'available' }
  | { type: 'tableau'; columnIndex: number };

// ─── Move source ─────────────────────────────────────────────────────

export type MoveSource =
  | { type: 'waste' }
  | { type: 'tableau'; columnIndex: number }
  | { type: 'foundation'; pileIndex: number }
  | { type: 'joker' };

// ─── State snapshot (for undo history) ───────────────────────────────

export interface SolitaireGameStateSnapshot {
  tableau: TableauColumn[];
  foundations: FoundationPile[];
  stock: Card[];
  waste: Card[];
  jokerLocation: JokerLocation;
  phase: SolitairePhase;
  moveCount: number;
}

// ─── Game state ──────────────────────────────────────────────────────

export interface SolitaireGameState {
  settings: SolitaireGameSettings;
  phase: SolitairePhase;
  seed: number;
  tableau: TableauColumn[];
  foundations: FoundationPile[];
  stock: Card[];
  waste: Card[];
  jokerLocation: JokerLocation;
  moveCount: number;
  moveHistory: SolitaireGameStateSnapshot[];
  hintHighlight: CardKey[] | null;
  hintTarget: import('./engine/hint').HintTarget;
  hintMessage: string | null;
  hintIndex: number;
  showStuckDialog: boolean;
}

// ─── Actions ─────────────────────────────────────────────────────────

export type SolitaireAction =
  | { type: 'DEAL'; seed: number }
  | { type: 'DRAW_FROM_STOCK' }
  | { type: 'RECYCLE_WASTE' }
  | { type: 'MOVE_TO_TABLEAU'; source: MoveSource; cardIndex: number; destColumn: number }
  | { type: 'MOVE_TO_FOUNDATION'; source: MoveSource; destFoundation: number }
  | { type: 'UNDO' }
  | { type: 'HINT' }
  | { type: 'AUTO_COMPLETE_STEP' }
  | { type: 'RESTART_SAME_CARDS' };

// ─── Leaderboard ─────────────────────────────────────────────────────

export interface LeaderboardEntry {
  moves: number;
  date: string;
}
