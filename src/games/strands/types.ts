import type { GameType } from '../../types/game-common';
import type { BaseGameSettings } from '../../types/game-common';

export type StrandsLang = 'en' | 'he';

export interface StrandsSettings extends BaseGameSettings {
  gameType: GameType.STRANDS;
}

/**
 * A theme and the words it can draw on.
 *
 * `words` is a pool, not a board: the level builder picks whichever subset's
 * lengths happen to fill the grid exactly, so one theme yields many boards.
 * `spangram` is written with its spaces and closed up for the grid.
 */
export interface StrandsTheme {
  id: string;
  clue: string;
  spangram: string;
  words: readonly string[];
}

export interface PlacedWord {
  /** Grid spelling — for Hebrew, with final letters folded back. */
  word: string;
  /** How the word is read. */
  display: string;
  /** Cell indices in spelling order. */
  path: number[];
  spangram: boolean;
}

export interface StrandsLevel {
  lang: StrandsLang;
  index: number;
  themeId: string;
  clue: string;
  rows: number;
  cols: number;
  /** One letter per cell, row-major. */
  letters: string[];
  words: PlacedWord[];
}

export enum StrandsPhase {
  LOADING = 'LOADING',
  PLAYING = 'PLAYING',
  COMPLETE = 'COMPLETE',
}

/** What the last trace turned out to be; drives the readout, then clears. */
export type StrandsResult =
  | { kind: 'none' }
  | { kind: 'theme'; wordId: number }
  | { kind: 'spangram'; wordId: number }
  | { kind: 'bonus'; word: string }
  | { kind: 'repeat' }
  | { kind: 'invalid' };

export interface StrandsGameState {
  settings: StrandsSettings;
  phase: StrandsPhase;
  lang: StrandsLang;
  level: StrandsLevel | null;
  /** Indices into `level.words` already found. */
  foundIds: number[];
  /** Non-theme words found, as the player reads them. */
  bonusWords: string[];
  /** Cells in the trace being drawn right now. */
  trace: number[];
  /** Word whose letters a hint has lit up, awaiting a second hint. */
  hintWordId: number | null;
  hintsUsed: number;
  lastResult: StrandsResult;
  elapsedSeconds: number;
}

export type StrandsAction =
  | { type: 'LOAD_LEVEL'; level: StrandsLevel }
  | { type: 'TRACE_START'; cell: number }
  | { type: 'TRACE_ENTER'; cell: number }
  | { type: 'TRACE_CLEAR' }
  | { type: 'TRACE_END'; isWord: (key: string) => boolean; display: (key: string) => string }
  | { type: 'CLEAR_RESULT' }
  | { type: 'HINT' }
  | { type: 'TICK' };

export interface StrandsProgress {
  lang: StrandsLang;
  levelIndex: number;
}

/** Bonus words earn a hint for every this many found. */
export const BONUS_PER_HINT = 3;
