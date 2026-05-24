import { mulberry32, pickOne, shuffle } from '../../engine/seed';
import type { ArchetypeParams, PuzzleArchetype, ValidateResult, HintResult } from '../types';
import AnagramComponent from './Component';
import { WORDS_EASY, WORDS_MEDIUM, WORDS_HARD } from './words';

export interface AnagramState {
  word: string;
  scrambled: string;
}

function pickPool(d: ArchetypeParams['difficulty']): ReadonlyArray<string> {
  if (d === 'easy') return WORDS_EASY;
  if (d === 'medium') return WORDS_MEDIUM;
  return WORDS_HARD;
}

function scrambleDifferent(word: string, rng: () => number): string {
  let attempt = '';
  for (let i = 0; i < 10; i++) {
    attempt = shuffle(rng, word.split('')).join('');
    if (attempt !== word) return attempt;
  }
  // fallback: rotate
  return word.slice(1) + word[0];
}

export const anagramArchetype: PuzzleArchetype<AnagramState, string> = {
  id: 'anagram',
  supportedDifficulties: ['easy', 'medium', 'hard'] as const,

  init(params: ArchetypeParams): AnagramState {
    const rng = mulberry32(params.seed);
    const word = pickOne(rng, pickPool(params.difficulty)).toUpperCase();
    const scrambled = scrambleDifferent(word, rng);
    return { word, scrambled };
  },

  validate(state: AnagramState, input: string): ValidateResult {
    const guess = (input || '').trim().toUpperCase();
    if (guess === state.word) return { solved: true };
    if (guess.length !== state.word.length) {
      return { solved: false, feedback: 'escape.anagram.feedback.wrongLength' };
    }
    // Same letters but wrong order? -> closer
    const a = state.word.split('').sort().join('');
    const b = guess.split('').sort().join('');
    if (a === b) {
      return { solved: false, feedback: 'escape.anagram.feedback.sameLetters' };
    }
    return { solved: false, feedback: 'escape.anagram.feedback.try' };
  },

  hint(state: AnagramState, hintIndex: number): HintResult {
    const lettersToReveal = Math.min(hintIndex + 1, state.word.length - 1);
    const masked = state.word
      .split('')
      .map((c, i) => (i < lettersToReveal ? c : '_'))
      .join(' ');
    const exhausted = lettersToReveal >= state.word.length - 1;
    return {
      text: `escape.anagram.hint.reveal|${masked}`,
      costPoints: 15,
      exhausted,
    };
  },

  serialize(s) {
    return s;
  },
  restore(b) {
    return b as AnagramState;
  },

  Component: AnagramComponent,
};
