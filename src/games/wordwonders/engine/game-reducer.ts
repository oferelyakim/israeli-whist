import { WordPhase } from '../types';
import type {
  WordWondersAction,
  WordWondersGameSettings,
  WordWondersGameState,
  WordLang,
  WordLevel,
} from '../types';
import { createRNG } from '../../../utils/random';

export const COINS_PER_WORD = 5;
export const COINS_PER_BONUS = 2;
export const HINT_COST = 25;
export const STARTING_COINS = 120;

export function createInitialWordState(
  settings: WordWondersGameSettings,
  lang: WordLang,
  coins = STARTING_COINS,
): WordWondersGameState {
  return {
    settings,
    phase: WordPhase.LOADING,
    lang,
    level: null,
    wheelOrder: [],
    picked: [],
    foundIds: [],
    bonusWords: [],
    revealedCells: [],
    lastResult: { kind: 'none' },
    hintsUsed: 0,
    coins,
    elapsedSeconds: 0,
  };
}

/** Scrambles the wheel so the seed word is not just readable around the circle. */
function scrambleWheel(count: number, seed: number): number[] {
  const order = Array.from({ length: count }, (_, i) => i);
  const rng = createRNG(seed);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

/**
 * `picked` holds WHEEL SLOTS, not letter indices — the wheel is scrambled, so
 * each slot has to be mapped back through `wheelOrder` to reach its letter.
 */
function tracedKey(state: WordWondersGameState): string {
  const level = state.level;
  if (!level) return '';
  return state.picked.map((slot) => level.letters[state.wheelOrder[slot]]).join('');
}

function isComplete(level: WordLevel, foundIds: readonly number[]): boolean {
  return foundIds.length >= level.words.length;
}

export function wordWondersReducer(
  state: WordWondersGameState,
  action: WordWondersAction,
): WordWondersGameState {
  switch (action.type) {
    case 'LOAD_LEVEL': {
      const level = action.level;
      return {
        ...state,
        phase: WordPhase.PLAYING,
        lang: level.lang,
        level,
        wheelOrder: scrambleWheel(level.letters.length, level.index * 7919 + 13),
        picked: [],
        foundIds: [],
        bonusWords: [],
        revealedCells: [],
        lastResult: { kind: 'none' },
        hintsUsed: 0,
        elapsedSeconds: 0,
      };
    }

    case 'TRACE_START':
      if (state.phase !== WordPhase.PLAYING) return state;
      return { ...state, picked: [action.wheelIndex], lastResult: { kind: 'none' } };

    case 'TRACE_ENTER': {
      if (state.phase !== WordPhase.PLAYING || state.picked.length === 0) return state;
      const { picked } = state;
      // Dragging back onto the previous letter un-picks the last one, so a
      // mis-swipe can be corrected without lifting off.
      if (picked.length >= 2 && picked[picked.length - 2] === action.wheelIndex) {
        return { ...state, picked: picked.slice(0, -1) };
      }
      if (picked.includes(action.wheelIndex)) return state;
      return { ...state, picked: [...picked, action.wheelIndex] };
    }

    case 'TRACE_END': {
      if (state.phase !== WordPhase.PLAYING || !state.level) return state;
      const key = tracedKey(state);
      const cleared = { ...state, picked: [] };
      if (key.length < 3) return { ...cleared, lastResult: { kind: 'none' } };

      const target = state.level.words.find((w) => w.key === key);
      if (target) {
        if (state.foundIds.includes(target.id)) {
          return { ...cleared, lastResult: { kind: 'repeat' } };
        }
        const foundIds = [...state.foundIds, target.id];
        return {
          ...cleared,
          foundIds,
          coins: state.coins + COINS_PER_WORD,
          lastResult: { kind: 'found', wordId: target.id },
          phase: isComplete(state.level, foundIds) ? WordPhase.COMPLETE : WordPhase.PLAYING,
        };
      }

      if (!action.isWord(key)) return { ...cleared, lastResult: { kind: 'invalid' } };

      const display = action.display(key);
      if (state.bonusWords.includes(display)) {
        return { ...cleared, lastResult: { kind: 'repeat' } };
      }
      return {
        ...cleared,
        bonusWords: [...state.bonusWords, display],
        coins: state.coins + COINS_PER_BONUS,
        lastResult: { kind: 'bonus', word: display },
      };
    }

    case 'CLEAR_RESULT':
      return state.lastResult.kind === 'none' ? state : { ...state, lastResult: { kind: 'none' } };

    case 'SHUFFLE': {
      if (!state.level) return state;
      const seed = state.level.index * 31 + state.foundIds.length * 977 + state.hintsUsed + 1;
      return {
        ...state,
        wheelOrder: scrambleWheel(state.level.letters.length, seed),
        picked: [],
      };
    }

    case 'HINT': {
      if (state.phase !== WordPhase.PLAYING || !state.level) return state;
      if (state.coins < HINT_COST) return state;

      // Reveal one still-hidden letter, taking the shortest unfound word first
      // so a hint moves the player closer to actually finishing something.
      const pending = state.level.words
        .filter((w) => !state.foundIds.includes(w.id))
        .sort((a, b) => a.key.length - b.key.length);

      for (const word of pending) {
        for (let i = 0; i < word.key.length; i++) {
          const r = word.row + (word.horiz ? 0 : i);
          const c = word.col + (word.horiz ? i : 0);
          const cellKey = `${r},${c}`;
          if (state.revealedCells.includes(cellKey)) continue;
          return {
            ...state,
            revealedCells: [...state.revealedCells, cellKey],
            coins: state.coins - HINT_COST,
            hintsUsed: state.hintsUsed + 1,
          };
        }
      }
      return state;
    }

    case 'TICK':
      if (state.phase !== WordPhase.PLAYING) return state;
      return { ...state, elapsedSeconds: state.elapsedSeconds + 1 };

    default:
      return state;
  }
}

// ─── Derived view of the board ───────────────────────────────────────

export interface GridCell {
  row: number;
  col: number;
  letter: string;
  /** The letter is on show: its word is found, or a hint uncovered this cell. */
  shown: boolean;
}

/**
 * Flattens the level into one entry per occupied square. Cells shared by two
 * words appear once; the letter is the same either way, which is exactly what
 * the packer guaranteed.
 */
export function buildGrid(state: WordWondersGameState): (GridCell | null)[] {
  const { level } = state;
  if (!level) return [];
  const cells: (GridCell | null)[] = Array(level.rows * level.cols).fill(null);

  for (const word of level.words) {
    const found = state.foundIds.includes(word.id);
    for (let i = 0; i < word.key.length; i++) {
      const r = word.row + (word.horiz ? 0 : i);
      const c = word.col + (word.horiz ? i : 0);
      const at = r * level.cols + c;
      const revealed = found || state.revealedCells.includes(`${r},${c}`);
      const existing = cells[at];
      if (existing) {
        if (revealed) existing.shown = true;
      } else {
        cells[at] = { row: r, col: c, letter: word.key[i], shown: revealed };
      }
    }
  }
  return cells;
}
