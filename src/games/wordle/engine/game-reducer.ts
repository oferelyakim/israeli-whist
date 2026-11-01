import { MAX_GUESSES, WORD_LENGTH, WordleMode, WordlePhase } from '../types';
import type {
  WordleAction,
  WordleGameState,
  WordleLang,
  WordleSettings,
} from '../types';
import { markGuess, mergeKeyboard } from './scoring';

export function createInitialWordleState(
  settings: WordleSettings,
  lang: WordleLang,
  mode: WordleMode,
  answer: string,
  dayNumber: number,
): WordleGameState {
  return {
    settings,
    phase: WordlePhase.PLAYING,
    lang,
    mode,
    answer,
    dayNumber: mode === WordleMode.DAILY ? dayNumber : -1,
    guesses: [],
    current: '',
    keyboard: {},
    message: '',
    nudge: 0,
  };
}

export function wordleReducer(state: WordleGameState, action: WordleAction): WordleGameState {
  switch (action.type) {
    case 'NEW_GAME':
      return createInitialWordleState(
        state.settings, action.lang, action.mode, action.answer, action.dayNumber,
      );

    case 'RESTORE':
      return action.state;

    case 'TYPE': {
      if (state.phase !== WordlePhase.PLAYING) return state;
      if (state.current.length >= WORD_LENGTH) return state;
      return { ...state, current: state.current + action.letter, message: '' };
    }

    case 'BACKSPACE': {
      if (state.phase !== WordlePhase.PLAYING || state.current.length === 0) return state;
      return { ...state, current: state.current.slice(0, -1), message: '' };
    }

    case 'SUBMIT': {
      if (state.phase !== WordlePhase.PLAYING) return state;

      // Say which of the two it is. "Not a word" for a half-typed row reads as
      // the game rejecting a word the player never finished.
      if (state.current.length < WORD_LENGTH) {
        return { ...state, message: 'wordle.tooShort', nudge: state.nudge + 1 };
      }
      if (!action.isGuess(state.current)) {
        return { ...state, message: 'wordle.notAWord', nudge: state.nudge + 1 };
      }

      const marks = markGuess(state.current, state.answer);
      const guesses = [...state.guesses, { word: state.current, marks }];
      const keyboard = mergeKeyboard(state.keyboard, state.current, marks);
      const won = state.current === state.answer;
      const out = won || guesses.length >= MAX_GUESSES;

      return {
        ...state,
        guesses,
        keyboard,
        current: '',
        phase: won ? WordlePhase.WON : out ? WordlePhase.LOST : WordlePhase.PLAYING,
        message: '',
        nudge: state.nudge,
      };
    }

    case 'CLEAR_MESSAGE':
      return state.message === '' ? state : { ...state, message: '' };

    default:
      return state;
  }
}
