import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_GUESSES, WordleMode, WordlePhase } from '../types';
import type {
  WordleAction,
  WordleGameState,
  WordleLang,
  WordleProgress,
  WordleSettings,
  WordleStats,
} from '../types';
import { createInitialWordleState, wordleReducer } from '../engine/game-reducer';
import { dailyAnswer, dayNumber, loadWords } from '../engine/words';
import type { WordleWords } from '../engine/words';

const PROGRESS_KEY = 'wordle-progress';
const boardKey = (mode: WordleMode, lang: WordleLang) => `wordle-board-${mode}-${lang}`;
const statsKey = (lang: WordleLang) => `wordle-stats-${lang}`;

function blankStats(): WordleStats {
  return {
    played: 0, won: 0, streak: 0, best: 0, lastDay: -999,
    distribution: new Array<number>(MAX_GUESSES).fill(0),
  };
}

function loadStats(lang: WordleLang): WordleStats {
  try {
    const raw = localStorage.getItem(statsKey(lang));
    if (raw) {
      const saved = JSON.parse(raw) as WordleStats;
      if (Array.isArray(saved.distribution) && typeof saved.played === 'number') {
        return { ...blankStats(), ...saved };
      }
    }
  } catch { /* ignore parse errors */ }
  return blankStats();
}

function saveStats(lang: WordleLang, stats: WordleStats): void {
  try {
    localStorage.setItem(statsKey(lang), JSON.stringify(stats));
  } catch { /* ignore quota errors */ }
}

function loadProgress(fallback: WordleLang): WordleProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as WordleProgress;
      const lang = saved.lang === 'en' || saved.lang === 'he' ? saved.lang : fallback;
      const mode = saved.mode === WordleMode.ENDLESS ? WordleMode.ENDLESS : WordleMode.DAILY;
      return { lang, mode };
    }
  } catch { /* ignore parse errors */ }
  return { lang: fallback, mode: WordleMode.DAILY };
}

function saveProgress(progress: WordleProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch { /* ignore quota errors */ }
}

function saveBoard(state: WordleGameState): void {
  try {
    localStorage.setItem(boardKey(state.mode, state.lang), JSON.stringify(state));
  } catch { /* ignore quota errors */ }
}

function loadBoard(mode: WordleMode, lang: WordleLang, today: number): WordleGameState | null {
  try {
    const raw = localStorage.getItem(boardKey(mode, lang));
    if (!raw) return null;
    const saved = JSON.parse(raw) as WordleGameState;
    if (!saved.answer || !Array.isArray(saved.guesses)) return null;
    // Yesterday's daily is finished with, however it ended.
    if (mode === WordleMode.DAILY && saved.dayNumber !== today) return null;
    return { ...saved, message: '', nudge: 0 };
  } catch {
    return null;
  }
}

/** Folds one finished daily into the record. */
function recordDaily(stats: WordleStats, won: boolean, guessCount: number, day: number): WordleStats {
  // Finishing the same day twice must not count twice.
  if (stats.lastDay === day) return stats;

  const distribution = [...stats.distribution];
  if (won) distribution[Math.min(guessCount, MAX_GUESSES) - 1] += 1;

  // A streak survives only across consecutive days; a gap or a loss ends it.
  const continued = stats.lastDay === day - 1;
  const streak = won ? (continued ? stats.streak + 1 : 1) : 0;

  return {
    played: stats.played + 1,
    won: won ? stats.won + 1 : stats.won,
    streak,
    best: Math.max(stats.best, streak),
    lastDay: day,
    distribution,
  };
}

export interface UseWordleGameReturn {
  gameState: WordleGameState | null;
  stats: WordleStats;
  loading: boolean;
  startGame: (settings: WordleSettings, fallbackLang: WordleLang) => void;
  type: (letter: string) => void;
  backspace: () => void;
  submit: () => void;
  clearMessage: () => void;
  newEndless: () => void;
  setMode: (mode: WordleMode) => void;
  setLanguage: (lang: WordleLang) => void;
}

export function useWordleGame(): UseWordleGameReturn {
  const [gameState, setGameState] = useState<WordleGameState | null>(null);
  const [stats, setStats] = useState<WordleStats>(blankStats);
  const [loading, setLoading] = useState(true);

  const stateRef = useRef<WordleGameState | null>(null);
  const wordsRef = useRef<WordleWords | null>(null);
  const settingsRef = useRef<WordleSettings | null>(null);
  const statsRef = useRef<WordleStats>(stats);
  // Guards a slow word list landing after the player has moved on.
  const requestRef = useRef(0);

  const commit = useCallback((next: WordleGameState) => {
    stateRef.current = next;
    setGameState(next);
  }, []);

  const dispatch = useCallback((action: WordleAction) => {
    const prev = stateRef.current;
    if (!prev) return;
    let next: WordleGameState;
    try {
      next = wordleReducer(prev, action);
    } catch (e) {
      console.error('Wordle reducer error:', e);
      return;
    }
    commit(next);

    const finished = next.phase !== WordlePhase.PLAYING && prev.phase === WordlePhase.PLAYING;
    if (finished && next.mode === WordleMode.DAILY) {
      // The result is a consequence of the guess that produced it, so the
      // record is written here rather than in an effect (react-x treats
      // setState inside an effect as a cascading render).
      const updated = recordDaily(
        statsRef.current, next.phase === WordlePhase.WON, next.guesses.length, next.dayNumber,
      );
      statsRef.current = updated;
      setStats(updated);
      saveStats(next.lang, updated);
    }
  }, [commit]);

  useEffect(() => {
    if (gameState) saveBoard(gameState);
  }, [gameState]);

  const open = useCallback((lang: WordleLang, mode: WordleMode, fresh: boolean) => {
    const settings = settingsRef.current;
    if (!settings) return;
    const token = ++requestRef.current;
    setLoading(true);
    saveProgress({ lang, mode });

    const nextStats = loadStats(lang);
    statsRef.current = nextStats;
    setStats(nextStats);

    void loadWords(lang).then((words) => {
      if (token !== requestRef.current) return;
      wordsRef.current = words;
      const today = dayNumber();

      const saved = fresh ? null : loadBoard(mode, lang, today);
      if (saved) {
        commit({ ...saved, settings });
        setLoading(false);
        return;
      }

      const answer = mode === WordleMode.DAILY
        ? dailyAnswer(words.answers, today, lang)
        : words.answers[Math.floor(Math.random() * words.answers.length)];
      commit(createInitialWordleState(settings, lang, mode, answer, today));
      setLoading(false);
    }).catch(() => {
      if (token !== requestRef.current) return;
      setLoading(false);
    });
  }, [commit]);

  const startGame = useCallback((settings: WordleSettings, fallbackLang: WordleLang) => {
    settingsRef.current = settings;
    const progress = loadProgress(fallbackLang);
    open(progress.lang, progress.mode, false);
  }, [open]);

  return {
    gameState,
    stats,
    loading,
    startGame,
    type: useCallback((letter: string) => dispatch({ type: 'TYPE', letter }), [dispatch]),
    backspace: useCallback(() => dispatch({ type: 'BACKSPACE' }), [dispatch]),
    submit: useCallback(() => {
      const words = wordsRef.current;
      dispatch({ type: 'SUBMIT', isGuess: (word) => (words ? words.isGuess(word) : false) });
    }, [dispatch]),
    clearMessage: useCallback(() => dispatch({ type: 'CLEAR_MESSAGE' }), [dispatch]),
    newEndless: useCallback(() => {
      const prev = stateRef.current;
      if (prev) open(prev.lang, WordleMode.ENDLESS, true);
    }, [open]),
    setMode: useCallback((mode: WordleMode) => {
      const prev = stateRef.current;
      if (!prev || prev.mode === mode) return;
      open(prev.lang, mode, false);
    }, [open]),
    setLanguage: useCallback((lang: WordleLang) => {
      const prev = stateRef.current;
      if (!prev || prev.lang === lang) return;
      open(lang, prev.mode, false);
    }, [open]),
  };
}
