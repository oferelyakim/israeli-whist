import { mulberry32, randInt, pickOne } from '../../engine/seed';
import type { ArchetypeParams, PuzzleArchetype, ValidateResult, HintResult } from '../types';
import CaesarComponent from './Component';
import { WORDS_EASY, WORDS_MEDIUM } from '../anagram/words';

export interface CaesarState {
  plaintext: string;   // uppercase, single word for easy/medium, short phrase for hard
  ciphertext: string;
  shift: number;       // 1..25
  shiftKnown: boolean; // easy reveals shift in the prompt; harder hides it
}

const HARD_PHRASES: ReadonlyArray<string> = [
  'HIDDEN DOOR',
  'GOLDEN KEY',
  'SECRET ROOM',
  'CLOCK TOWER',
  'BLUE MOON',
  'PAPER MAP',
  'BROKEN MIRROR',
  'SILVER COIN',
  'DARK FOREST',
  'IRON GATE',
];

function shiftChar(ch: string, shift: number): string {
  const code = ch.charCodeAt(0);
  if (code >= 65 && code <= 90) {
    return String.fromCharCode(((code - 65 + shift) % 26) + 65);
  }
  return ch;
}

function shiftText(text: string, shift: number): string {
  let out = '';
  for (const ch of text) out += shiftChar(ch, shift);
  return out;
}

function pickPlaintext(rng: () => number, d: ArchetypeParams['difficulty']): string {
  if (d === 'easy') return pickOne(rng, WORDS_EASY).toUpperCase();
  if (d === 'medium') return pickOne(rng, WORDS_MEDIUM).toUpperCase();
  return pickOne(rng, HARD_PHRASES);
}

export const caesarArchetype: PuzzleArchetype<CaesarState, string> = {
  id: 'caesar-cipher',
  supportedDifficulties: ['easy', 'medium', 'hard'] as const,

  init(params: ArchetypeParams): CaesarState {
    const rng = mulberry32(params.seed);
    const plaintext = pickPlaintext(rng, params.difficulty);
    let shift: number;
    if (params.difficulty === 'easy') shift = randInt(rng, 1, 5);
    else if (params.difficulty === 'medium') shift = randInt(rng, 3, 12);
    else shift = randInt(rng, 1, 25);
    const ciphertext = shiftText(plaintext, shift);
    return {
      plaintext,
      ciphertext,
      shift,
      shiftKnown: params.difficulty === 'easy',
    };
  },

  validate(state: CaesarState, input: string): ValidateResult {
    const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, ' ');
    const guess = norm(input || '');
    if (guess === '') return { solved: false, feedback: 'escape.caesar.feedback.empty' };
    if (guess === norm(state.plaintext)) return { solved: true };
    if (guess.length !== state.plaintext.length) {
      return { solved: false, feedback: 'escape.caesar.feedback.wrongLength' };
    }
    return { solved: false, feedback: 'escape.caesar.feedback.try' };
  },

  hint(state: CaesarState, hintIndex: number): HintResult {
    // 0: reveal first letter. 1: reveal shift (if hidden). 2: reveal answer.
    if (hintIndex === 0) {
      const firstLetter = state.plaintext.split('').find((c) => c >= 'A' && c <= 'Z') ?? '?';
      return {
        text: `escape.caesar.hint.firstLetter|${firstLetter}`,
        costPoints: 10,
        exhausted: false,
      };
    }
    if (hintIndex === 1 && !state.shiftKnown) {
      return {
        text: `escape.caesar.hint.shift|${state.shift}`,
        costPoints: 15,
        exhausted: false,
      };
    }
    return {
      text: `escape.caesar.hint.reveal|${state.plaintext}`,
      costPoints: 30,
      exhausted: true,
    };
  },

  serialize(s) {
    return s;
  },
  restore(b) {
    return b as CaesarState;
  },

  Component: CaesarComponent,
};
