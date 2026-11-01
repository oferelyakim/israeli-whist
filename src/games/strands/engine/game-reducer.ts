import { BONUS_PER_HINT, StrandsPhase } from '../types';
import type {
  StrandsAction,
  StrandsGameState,
  StrandsLang,
  StrandsLevel,
  StrandsSettings,
} from '../types';
import { areAdjacent } from './grid';

/** Shortest run that counts as a find. Hebrew words run shorter. */
export function minTraceLength(lang: StrandsLang): number {
  return lang === 'he' ? 3 : 4;
}

/**
 * What a TAP on `cell` should do, given what is already traced.
 *
 * Letters can be tapped one at a time as well as dragged through, so a press
 * has to mean different things depending on where it lands. Kept here rather
 * than in the component because it is the rule, not the rendering.
 */
export type TapOutcome = 'start' | 'extend' | 'submit' | 'clear';

export function tapOutcome(trace: readonly number[], cell: number): TapOutcome {
  if (trace.length === 0) return 'start';
  const last = trace[trace.length - 1];
  // Tapping the letter you just added submits the word — except when it is the
  // only one, where there is nothing to submit and it means "never mind".
  if (cell === last) return trace.length >= 2 ? 'submit' : 'clear';
  // A letter already in the word, or one that does not touch the last one,
  // starts again from there rather than doing nothing.
  if (trace.includes(cell)) return 'start';
  return areAdjacent(last, cell) ? 'extend' : 'start';
}

export function createInitialStrandsState(
  settings: StrandsSettings,
  lang: StrandsLang,
  level: StrandsLevel | null,
): StrandsGameState {
  return {
    settings,
    phase: level ? StrandsPhase.PLAYING : StrandsPhase.LOADING,
    lang,
    level,
    foundIds: [],
    bonusWords: [],
    trace: [],
    hintWordId: null,
    hintsUsed: 0,
    lastResult: { kind: 'none' },
    elapsedSeconds: 0,
  };
}

/** Hints earned by bonus finds, less the ones already spent. */
export function hintsAvailable(state: StrandsGameState): number {
  return Math.floor(state.bonusWords.length / BONUS_PER_HINT) - state.hintsUsed;
}

function settle(state: StrandsGameState, foundIds: number[]): StrandsGameState {
  const total = state.level?.words.length ?? 0;
  return {
    ...state,
    foundIds,
    phase: total > 0 && foundIds.length === total ? StrandsPhase.COMPLETE : state.phase,
  };
}

export function strandsReducer(state: StrandsGameState, action: StrandsAction): StrandsGameState {
  const level = state.level;

  switch (action.type) {
    case 'LOAD_LEVEL':
      return createInitialStrandsState(state.settings, action.level.lang, action.level);

    case 'TRACE_START':
      if (state.phase !== StrandsPhase.PLAYING) return state;
      return { ...state, trace: [action.cell], lastResult: { kind: 'none' } };

    case 'TRACE_CLEAR':
      return state.trace.length === 0 ? state : { ...state, trace: [], lastResult: { kind: 'none' } };

    case 'TRACE_ENTER': {
      if (state.phase !== StrandsPhase.PLAYING || state.trace.length === 0) return state;
      const trace = state.trace;
      const last = trace[trace.length - 1];
      if (action.cell === last) return state;

      // Sliding back onto the previous cell rubs the last letter out, which is
      // how a player corrects a slip without starting the word again.
      if (trace.length >= 2 && action.cell === trace[trace.length - 2]) {
        return { ...state, trace: trace.slice(0, -1) };
      }
      if (trace.includes(action.cell) || !areAdjacent(last, action.cell)) return state;
      return { ...state, trace: [...trace, action.cell] };
    }

    case 'TRACE_END': {
      if (state.phase !== StrandsPhase.PLAYING || !level) return state;
      const trace = state.trace;
      if (trace.length === 0) return state;

      const cleared = { ...state, trace: [] };
      if (trace.length < minTraceLength(state.lang)) {
        return { ...cleared, lastResult: { kind: 'invalid' } };
      }

      const key = trace.map((cell) => level.letters[cell]).join('');

      // A theme word counts only when its own cells are traced, in order.
      // Spelling the same letters out of other cells is not that word.
      const wordId = level.words.findIndex(
        (placed) => placed.path.length === trace.length
          && placed.path.every((cell, i) => cell === trace[i]),
      );

      if (wordId >= 0) {
        if (state.foundIds.includes(wordId)) {
          return { ...cleared, lastResult: { kind: 'repeat' } };
        }
        const next = settle(cleared, [...state.foundIds, wordId]);
        return {
          ...next,
          // A hint pointing at the word the player just found has done its job.
          hintWordId: state.hintWordId === wordId ? null : state.hintWordId,
          lastResult: level.words[wordId].spangram
            ? { kind: 'spangram', wordId }
            : { kind: 'theme', wordId },
        };
      }

      // Don't pay a bonus for a theme word's spelling found somewhere else —
      // it reads as if the game accepted the theme word and then lost it.
      if (level.words.some((placed) => placed.word === key)) {
        return { ...cleared, lastResult: { kind: 'invalid' } };
      }

      if (!action.isWord(key)) {
        return { ...cleared, lastResult: { kind: 'invalid' } };
      }

      const shown = action.display(key);
      if (state.bonusWords.includes(shown)) {
        return { ...cleared, lastResult: { kind: 'repeat' } };
      }
      return {
        ...cleared,
        bonusWords: [...state.bonusWords, shown],
        lastResult: { kind: 'bonus', word: shown },
      };
    }

    case 'CLEAR_RESULT':
      return state.lastResult.kind === 'none' ? state : { ...state, lastResult: { kind: 'none' } };

    case 'HINT': {
      if (state.phase !== StrandsPhase.PLAYING || !level) return state;
      if (hintsAvailable(state) <= 0) return state;

      // The first hint lights up a word's letters; a second one spends another
      // hint to lay out their order, which finds the word.
      if (state.hintWordId !== null) {
        const wordId = state.hintWordId;
        if (state.foundIds.includes(wordId)) {
          return { ...state, hintWordId: null };
        }
        return {
          ...settle(state, [...state.foundIds, wordId]),
          hintWordId: null,
          hintsUsed: state.hintsUsed + 1,
          lastResult: level.words[wordId].spangram
            ? { kind: 'spangram', wordId }
            : { kind: 'theme', wordId },
        };
      }

      // Point at an ordinary theme word first; the spangram is the last thing
      // worth giving away.
      const plain = level.words.findIndex(
        (placed, i) => !placed.spangram && !state.foundIds.includes(i),
      );
      const next = plain >= 0
        ? plain
        : level.words.findIndex((_, i) => !state.foundIds.includes(i));
      if (next < 0) return state;
      return { ...state, hintWordId: next, hintsUsed: state.hintsUsed + 1 };
    }

    case 'TICK':
      if (state.phase !== StrandsPhase.PLAYING) return state;
      return { ...state, elapsedSeconds: state.elapsedSeconds + 1 };

    default:
      return state;
  }
}
