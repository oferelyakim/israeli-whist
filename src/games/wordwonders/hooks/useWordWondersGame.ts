import { useCallback, useEffect, useRef, useState } from 'react';
import { WordPhase } from '../types';
import type {
  WordLang,
  WordWondersAction,
  WordWondersGameSettings,
  WordWondersGameState,
  WordWondersProgress,
} from '../types';
import {
  STARTING_COINS,
  createInitialWordState,
  wordWondersReducer,
} from '../engine/game-reducer';
import { loadDictionary, peekDictionary } from '../engine/dictionary';
import type { Dictionary } from '../engine/dictionary';
import { buildLevel, seedForLevel } from '../engine/level';
import { EN_SEEDS } from '../data/seeds-en';
import { HE_SEEDS } from '../data/seeds-he';

const PROGRESS_KEY = 'wordwonders-progress';

function seedsFor(lang: WordLang): ReadonlyArray<string> {
  return lang === 'en' ? EN_SEEDS : HE_SEEDS;
}

function loadProgress(fallbackLang: WordLang): WordWondersProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as WordWondersProgress;
      if ((saved.lang === 'en' || saved.lang === 'he') && Number.isInteger(saved.levelIndex)) {
        return {
          lang: saved.lang,
          levelIndex: Math.max(0, saved.levelIndex),
          coins: Number.isFinite(saved.coins) ? saved.coins : STARTING_COINS,
        };
      }
    }
  } catch { /* ignore parse errors */ }
  return { lang: fallbackLang, levelIndex: 0, coins: STARTING_COINS };
}

function saveProgress(progress: WordWondersProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch { /* ignore quota errors */ }
}

export interface UseWordWondersGameReturn {
  gameState: WordWondersGameState | null;
  levelIndex: number;
  loading: boolean;
  error: string | null;
  startGame: (settings: WordWondersGameSettings, lang: WordLang) => void;
  traceStart: (wheelIndex: number) => void;
  traceEnter: (wheelIndex: number) => void;
  traceEnd: () => void;
  clearResult: () => void;
  shuffle: () => void;
  hint: () => void;
  nextLevel: () => void;
  setLanguage: (lang: WordLang) => void;
}

export function useWordWondersGame(): UseWordWondersGameReturn {
  const [gameState, setGameState] = useState<WordWondersGameState | null>(null);
  const [levelIndex, setLevelIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef<WordWondersGameState | null>(null);
  const dictRef = useRef<Dictionary | null>(null);
  const settingsRef = useRef<WordWondersGameSettings | null>(null);
  // Guards against a slow dictionary load landing after the player has already
  // switched language or moved on.
  const requestRef = useRef(0);

  const commit = useCallback((next: WordWondersGameState) => {
    stateRef.current = next;
    setGameState(next);
  }, []);

  const dispatch = useCallback((action: WordWondersAction) => {
    const prev = stateRef.current;
    if (!prev) return;
    try {
      commit(wordWondersReducer(prev, action));
    } catch (e) {
      console.error('Word Wonders reducer error:', e);
    }
  }, [commit]);

  /**
   * Generation can fail for a seed/index pair even though every shipped seed was
   * verified, so walk forward a few levels rather than dead-ending the player.
   */
  const openLevel = useCallback(async (lang: WordLang, index: number) => {
    const request = ++requestRef.current;
    setLoading(true);
    setError(null);
    try {
      const dict = peekDictionary(lang) ?? await loadDictionary(lang);
      if (request !== requestRef.current) return;
      dictRef.current = dict;

      const seeds = seedsFor(lang);
      for (let step = 0; step < 8; step++) {
        const at = index + step;
        const level = buildLevel(dict, seedForLevel(seeds, at), at);
        if (level) {
          const base = stateRef.current
            ?? createInitialWordState(settingsRef.current!, lang);
          commit(wordWondersReducer({ ...base, lang }, { type: 'LOAD_LEVEL', level }));
          setLevelIndex(at);
          saveProgress({ lang, levelIndex: at, coins: base.coins });
          setLoading(false);
          return;
        }
      }
      setError('generate');
      setLoading(false);
    } catch (e) {
      console.error('Word Wonders level load failed:', e);
      if (request === requestRef.current) {
        setError('load');
        setLoading(false);
      }
    }
  }, [commit]);

  const startGame = useCallback((settings: WordWondersGameSettings, lang: WordLang) => {
    settingsRef.current = settings;
    const progress = loadProgress(lang);
    stateRef.current = createInitialWordState(settings, progress.lang, progress.coins);
    setGameState(stateRef.current);
    void openLevel(progress.lang, progress.levelIndex);
  }, [openLevel]);

  // Persist coins as they change; the level number is written when one opens.
  useEffect(() => {
    if (!gameState || !gameState.level) return;
    saveProgress({ lang: gameState.lang, levelIndex, coins: gameState.coins });
  }, [gameState, levelIndex]);

  // Clock, keyed on phase only — see CLAUDE.md, the Mahjong timer gotcha.
  const phase = gameState?.phase ?? null;
  useEffect(() => {
    if (phase !== WordPhase.PLAYING) return;
    const timer = window.setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => window.clearInterval(timer);
  }, [phase, dispatch]);

  const traceEnd = useCallback(() => {
    const dict = dictRef.current;
    if (!dict) return;
    dispatch({
      type: 'TRACE_END',
      isWord: (key) => dict.all.has(key),
      display: (key) => dict.display(key),
    });
  }, [dispatch]);

  const nextLevel = useCallback(() => {
    const current = stateRef.current;
    if (!current) return;
    void openLevel(current.lang, levelIndex + 1);
  }, [openLevel, levelIndex]);

  const setLanguage = useCallback((lang: WordLang) => {
    const current = stateRef.current;
    if (!current || current.lang === lang) return;
    // Each language keeps its own progress; switching starts that one fresh
    // rather than carrying a level number across dictionaries.
    void openLevel(lang, 0);
  }, [openLevel]);

  return {
    gameState,
    levelIndex,
    loading,
    error,
    startGame,
    traceStart: useCallback((i: number) => dispatch({ type: 'TRACE_START', wheelIndex: i }), [dispatch]),
    traceEnter: useCallback((i: number) => dispatch({ type: 'TRACE_ENTER', wheelIndex: i }), [dispatch]),
    traceEnd,
    clearResult: useCallback(() => dispatch({ type: 'CLEAR_RESULT' }), [dispatch]),
    shuffle: useCallback(() => dispatch({ type: 'SHUFFLE' }), [dispatch]),
    hint: useCallback(() => dispatch({ type: 'HINT' }), [dispatch]),
    nextLevel,
    setLanguage,
  };
}
