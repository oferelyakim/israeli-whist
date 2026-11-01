import type { GameType } from '../../types/game-common';
import type { BaseGameSettings } from '../../types/game-common';

export type WordleLang = 'en' | 'he';

export interface WordleSettings extends BaseGameSettings {
  gameType: GameType.WORDLE;
}

export const WORD_LENGTH = 5;
export const MAX_GUESSES = 6;

export enum WordleMode {
  /** One word a day, the same for every device in that language. */
  DAILY = 'DAILY',
  /** A fresh word whenever you want one. Never touches the streak. */
  ENDLESS = 'ENDLESS',
}

export type Mark = 'correct' | 'present' | 'absent';

export enum WordlePhase {
  PLAYING = 'PLAYING',
  WON = 'WON',
  LOST = 'LOST',
}

export interface WordleGuess {
  word: string;
  marks: Mark[];
}

export interface WordleGameState {
  settings: WordleSettings;
  phase: WordlePhase;
  lang: WordleLang;
  mode: WordleMode;
  /** Grid spelling — Hebrew holds the non-final form. */
  answer: string;
  /** Which daily this is; -1 in endless. */
  dayNumber: number;
  guesses: WordleGuess[];
  /** Letters typed but not yet submitted. */
  current: string;
  /** Best mark each letter has earned, for the on-screen keyboard. */
  keyboard: Record<string, Mark>;
  /** Transient note under the grid, as a translation key. */
  message: string;
  /** Bumped to replay the shake; a boolean cannot retrigger an animation. */
  nudge: number;
}

export type WordleAction =
  | { type: 'NEW_GAME'; lang: WordleLang; mode: WordleMode; answer: string; dayNumber: number }
  | { type: 'RESTORE'; state: WordleGameState }
  | { type: 'TYPE'; letter: string }
  | { type: 'BACKSPACE' }
  | { type: 'SUBMIT'; isGuess: (word: string) => boolean }
  | { type: 'CLEAR_MESSAGE' };

/** Daily results only. Endless never touches these. */
export interface WordleStats {
  played: number;
  won: number;
  streak: number;
  best: number;
  /** Day number of the last daily finished, so a streak can be broken. */
  lastDay: number;
  /** Wins by guess count; index 0 is a win on the first guess. */
  distribution: number[];
}

export interface WordleProgress {
  lang: WordleLang;
  mode: WordleMode;
}
