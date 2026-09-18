import type { GameType } from '../../types/game-common';
import type { BaseGameSettings } from '../../types/game-common';

// ─── Settings ────────────────────────────────────────────────────────

export type WordLang = 'en' | 'he';

export interface WordWondersGameSettings extends BaseGameSettings {
  gameType: GameType.WORD_WONDERS;
}

// ─── Level data ──────────────────────────────────────────────────────

/**
 * A word placed in the crossword.
 *
 * `key` is what the grid stores and what a traced word is matched against. For
 * Hebrew that is the sofit-normalised spelling, because one cell can be the end
 * of the across word and the middle of the down word at the same time and only
 * one glyph fits. `display` is how the word is really written.
 */
export interface PlacedWord {
  id: number;
  key: string;
  display: string;
  row: number;
  col: number;
  horiz: boolean;
}

export interface WordLevel {
  lang: WordLang;
  index: number;
  /** The seed word, whose letters make up the wheel. */
  seed: string;
  seedDisplay: string;
  /** Wheel letters, in the order the generator produced them. */
  letters: string[];
  rows: number;
  cols: number;
  words: PlacedWord[];
}

// ─── Game state ──────────────────────────────────────────────────────

export enum WordPhase {
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  COMPLETE = 'COMPLETE',
}

/** Why the last traced word was rejected — drives the readout, then clears. */
export type TraceResult =
  | { kind: 'none' }
  | { kind: 'found'; wordId: number }
  | { kind: 'bonus'; word: string }
  | { kind: 'repeat' }
  | { kind: 'invalid' };

export interface WordWondersGameState {
  settings: WordWondersGameSettings;
  phase: WordPhase;
  lang: WordLang;
  level: WordLevel | null;
  /** Wheel positions, as indices into `level.letters`; SHUFFLE rotates it. */
  wheelOrder: number[];
  /** Wheel positions currently traced, in order. */
  picked: number[];
  /** Ids of the grid words already revealed. */
  foundIds: number[];
  /** Display forms of valid words that were not in the grid. */
  bonusWords: string[];
  /** "row,col" of single cells uncovered by a hint, ahead of their word. */
  revealedCells: string[];
  lastResult: TraceResult;
  hintsUsed: number;
  coins: number;
  elapsedSeconds: number;
}

// ─── Actions ─────────────────────────────────────────────────────────

export type WordWondersAction =
  | { type: 'LOAD_LEVEL'; level: WordLevel }
  | { type: 'TRACE_START'; wheelIndex: number }
  | { type: 'TRACE_ENTER'; wheelIndex: number }
  | { type: 'TRACE_END'; isWord: (key: string) => boolean; display: (key: string) => string }
  | { type: 'CLEAR_RESULT' }
  | { type: 'SHUFFLE' }
  | { type: 'HINT' }
  | { type: 'TICK' };

// ─── Progress ────────────────────────────────────────────────────────

export interface WordWondersProgress {
  lang: WordLang;
  levelIndex: number;
  coins: number;
}
