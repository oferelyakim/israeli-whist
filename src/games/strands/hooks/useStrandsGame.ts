import { useCallback, useEffect, useRef, useState } from 'react';
import { StrandsPhase } from '../types';
import type {
  StrandsAction,
  StrandsGameState,
  StrandsLang,
  StrandsProgress,
  StrandsSettings,
} from '../types';
import { createInitialStrandsState, strandsReducer } from '../engine/game-reducer';
import { buildLevel } from '../engine/level';
import { EN_THEMES } from '../data/themes-en';
import { HE_THEMES } from '../data/themes-he';
import { loadDictionary } from '../../wordwonders/engine/dictionary';
import type { Dictionary } from '../../wordwonders/engine/dictionary';

const PROGRESS_KEY = 'strands-progress';
const SAVE_KEY = 'strands-saved-game';

function themesFor(lang: StrandsLang) {
  return lang === 'en' ? EN_THEMES : HE_THEMES;
}

function loadProgress(fallback: StrandsLang): StrandsProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as StrandsProgress;
      if ((saved.lang === 'en' || saved.lang === 'he') && Number.isInteger(saved.levelIndex)) {
        return { lang: saved.lang, levelIndex: Math.max(0, saved.levelIndex) };
      }
    }
  } catch { /* ignore parse errors */ }
  return { lang: fallback, levelIndex: 0 };
}

function saveProgress(progress: StrandsProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch { /* ignore quota errors */ }
}

function saveGame(state: StrandsGameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, trace: [] }));
  } catch { /* ignore quota errors */ }
}

function loadSavedGame(lang: StrandsLang, levelIndex: number): StrandsGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as StrandsGameState;
    if (saved.phase !== StrandsPhase.PLAYING) return null;
    if (!saved.level || saved.level.lang !== lang || saved.level.index !== levelIndex) return null;
    if (!Array.isArray(saved.level.letters) || saved.level.letters.length === 0) return null;
    return { ...saved, trace: [], lastResult: { kind: 'none' } };
  } catch {
    return null;
  }
}

function clearSavedGame(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* ignore */ }
}

export interface UseStrandsGameReturn {
  gameState: StrandsGameState | null;
  levelIndex: number;
  loading: boolean;
  error: string | null;
  startGame: (settings: StrandsSettings, lang: StrandsLang) => void;
  traceStart: (cell: number) => void;
  traceEnter: (cell: number) => void;
  traceClear: () => void;
  traceEnd: () => void;
  clearResult: () => void;
  hint: () => void;
  nextLevel: () => void;
  setLanguage: (lang: StrandsLang) => void;
}

export function useStrandsGame(): UseStrandsGameReturn {
  const [gameState, setGameState] = useState<StrandsGameState | null>(null);
  const [levelIndex, setLevelIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const stateRef = useRef<StrandsGameState | null>(null);
  const dictRef = useRef<Dictionary | null>(null);
  const settingsRef = useRef<StrandsSettings | null>(null);
  // Guards a slow dictionary load landing after the player has switched
  // language or moved on to the next board.
  const requestRef = useRef(0);

  const commit = useCallback((next: StrandsGameState) => {
    stateRef.current = next;
    setGameState(next);
  }, []);

  const dispatch = useCallback((action: StrandsAction) => {
    const prev = stateRef.current;
    if (!prev) return;
    let next: StrandsGameState;
    try {
      next = strandsReducer(prev, action);
    } catch (e) {
      console.error('Strands reducer error:', e);
      return;
    }
    commit(next);

    // Finishing a board is a consequence of the move that finished it, so the
    // unlock is written here rather than in an effect (react-x treats setState
    // inside an effect as a cascading render).
    if (next.phase === StrandsPhase.COMPLETE && prev.phase !== StrandsPhase.COMPLETE) {
      saveProgress({ lang: next.lang, levelIndex: next.level ? next.level.index + 1 : 0 });
      clearSavedGame();
    }
  }, [commit]);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === StrandsPhase.PLAYING) saveGame(gameState);
  }, [gameState]);

  // Clock keyed on phase and level only — see CLAUDE.md, the Mahjong timer
  // gotcha: keying it to the whole state restarts the interval on every move.
  const phase = gameState?.phase ?? null;
  const currentIndex = gameState?.level?.index ?? null;
  useEffect(() => {
    if (phase !== StrandsPhase.PLAYING) return;
    const timer = window.setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => window.clearInterval(timer);
  }, [phase, currentIndex, dispatch]);

  const open = useCallback((lang: StrandsLang, index: number, restore: boolean) => {
    const settings = settingsRef.current;
    if (!settings) return;
    const token = ++requestRef.current;
    setLoading(true);
    setError(null);
    setLevelIndex(index);

    const saved = restore ? loadSavedGame(lang, index) : null;
    const level = saved?.level ?? buildLevel(lang, themesFor(lang), index);
    if (!level) {
      setError('build');
      setLoading(false);
      return;
    }

    commit(saved ? { ...saved, settings } : createInitialStrandsState(settings, lang, level));
    saveProgress({ lang, levelIndex: index });

    void loadDictionary(lang)
      .then((dict) => {
        if (token !== requestRef.current) return;
        dictRef.current = dict;
        setLoading(false);
      })
      .catch(() => {
        if (token !== requestRef.current) return;
        // The board is still playable without it; only bonus words need the
        // list, so say so rather than refusing to start.
        setError('dictionary');
        setLoading(false);
      });
  }, [commit]);

  const startGame = useCallback((settings: StrandsSettings, fallbackLang: StrandsLang) => {
    settingsRef.current = settings;
    const progress = loadProgress(fallbackLang);
    open(progress.lang, progress.levelIndex, true);
  }, [open]);

  return {
    gameState,
    levelIndex,
    loading,
    error,
    startGame,
    traceStart: useCallback((cell: number) => dispatch({ type: 'TRACE_START', cell }), [dispatch]),
    traceEnter: useCallback((cell: number) => dispatch({ type: 'TRACE_ENTER', cell }), [dispatch]),
    traceClear: useCallback(() => dispatch({ type: 'TRACE_CLEAR' }), [dispatch]),
    traceEnd: useCallback(() => {
      const dict = dictRef.current;
      dispatch({
        type: 'TRACE_END',
        isWord: (key) => (dict ? dict.all.has(key) : false),
        display: (key) => (dict ? dict.display(key) : key),
      });
    }, [dispatch]),
    clearResult: useCallback(() => dispatch({ type: 'CLEAR_RESULT' }), [dispatch]),
    hint: useCallback(() => dispatch({ type: 'HINT' }), [dispatch]),
    nextLevel: useCallback(() => {
      const prev = stateRef.current;
      if (!prev || !prev.level) return;
      clearSavedGame();
      open(prev.lang, prev.level.index + 1, false);
    }, [open]),
    setLanguage: useCallback((lang: StrandsLang) => {
      const prev = stateRef.current;
      if (!prev || prev.lang === lang) return;
      clearSavedGame();
      const progress = loadProgress(lang);
      open(lang, progress.lang === lang ? progress.levelIndex : 0, false);
    }, [open]),
  };
}
