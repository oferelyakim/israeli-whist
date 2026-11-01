import { useCallback, useEffect, useRef, useState } from 'react';
import { PipsDifficulty, PipsPhase } from '../types';
import type {
  CellKey,
  Orientation,
  PipsAction,
  PipsGameState,
  PipsProgress,
  PipsSettings,
} from '../types';
import { createInitialPipsState, pipsReducer } from '../engine/game-reducer';
import { buildLevel } from '../engine/levels';

const PROGRESS_KEY = 'pips-progress';
const SAVE_KEY = 'pips-saved-game';

const DIFFICULTIES = [
  PipsDifficulty.EASY, PipsDifficulty.MEDIUM, PipsDifficulty.HARD,
] as const;

function blankLevels(): Record<PipsDifficulty, number> {
  return {
    [PipsDifficulty.EASY]: 0,
    [PipsDifficulty.MEDIUM]: 0,
    [PipsDifficulty.HARD]: 0,
  };
}

function isDifficulty(value: unknown): value is PipsDifficulty {
  return DIFFICULTIES.some((d) => d === value);
}

/** Which difficulty the old auto-ramp would have been on at this puzzle. */
function rampedDifficulty(index: number): PipsDifficulty {
  if (index < 4) return PipsDifficulty.EASY;
  if (index < 12) return PipsDifficulty.MEDIUM;
  return PipsDifficulty.HARD;
}

function loadProgress(): PipsProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<PipsProgress> & { levelIndex?: number };

      // Saves from before the difficulty picker held a single ramped index.
      // Drop it onto the track it would have been on rather than resetting,
      // so a player mid-way does not lose their place.
      if (saved.levels === undefined && typeof saved.levelIndex === 'number') {
        const index = Math.max(0, Math.floor(saved.levelIndex));
        const difficulty = rampedDifficulty(index);
        const levels = blankLevels();
        levels[difficulty] = index;
        return { difficulty, levels };
      }

      const difficulty = isDifficulty(saved.difficulty) ? saved.difficulty : PipsDifficulty.EASY;
      const levels = blankLevels();
      for (const d of DIFFICULTIES) {
        const value = saved.levels?.[d];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
          levels[d] = Math.floor(value);
        }
      }
      return { difficulty, levels };
    }
  } catch { /* ignore parse errors */ }
  return { difficulty: PipsDifficulty.EASY, levels: blankLevels() };
}

function saveProgress(progress: PipsProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch { /* ignore quota errors */ }
}

function saveGame(state: PipsGameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, selectedId: null }));
  } catch { /* ignore quota errors */ }
}

function loadSavedGame(difficulty: PipsDifficulty, levelIndex: number): PipsGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as PipsGameState;
    if (saved.phase !== PipsPhase.PLAYING) return null;
    if (!saved.puzzle || !Array.isArray(saved.puzzle.cells) || saved.puzzle.cells.length === 0) {
      return null;
    }
    if (!Array.isArray(saved.placements)) return null;
    // Only resume a board from the track the player is actually on.
    if (saved.puzzle.difficulty !== difficulty || saved.levelIndex !== levelIndex) return null;
    return { ...saved, selectedId: null };
  } catch {
    return null;
  }
}

function clearSavedGame(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* ignore */ }
}

export interface UsePipsGameReturn {
  gameState: PipsGameState | null;
  difficulty: PipsDifficulty;
  startGame: (settings: PipsSettings) => void;
  selectDomino: (id: string | null) => void;
  rotate: () => void;
  place: (dominoId: string, anchor: CellKey, orientation: Orientation) => void;
  lift: (cell: CellKey) => void;
  clearBoard: () => void;
  hint: () => void;
  nextLevel: () => void;
  restartLevel: () => void;
  setDifficulty: (difficulty: PipsDifficulty) => void;
}

export function usePipsGame(): UsePipsGameReturn {
  const [gameState, setGameState] = useState<PipsGameState | null>(null);
  const [progress, setProgress] = useState<PipsProgress>(
    () => ({ difficulty: PipsDifficulty.EASY, levels: blankLevels() }),
  );
  const stateRef = useRef<PipsGameState | null>(null);
  const progressRef = useRef<PipsProgress>(progress);

  const commit = useCallback((next: PipsGameState) => {
    stateRef.current = next;
    setGameState(next);
  }, []);

  const dispatch = useCallback((action: PipsAction) => {
    const prev = stateRef.current;
    if (!prev) return;
    let next: PipsGameState;
    try {
      next = pipsReducer(prev, action);
    } catch (e) {
      console.error('Pips reducer error:', e);
      return;
    }
    commit(next);

    // Clearing a board is a consequence of the move that cleared it, so the
    // counter is written here rather than in an effect (react-x treats setState
    // inside an effect as a cascading render).
    if (next.phase === PipsPhase.SOLVED && prev.phase !== PipsPhase.SOLVED) {
      const difficulty = next.puzzle.difficulty;
      const current = progressRef.current;
      const reached = Math.max(current.levels[difficulty], next.levelIndex + 1);
      const updated: PipsProgress = {
        difficulty,
        levels: { ...current.levels, [difficulty]: reached },
      };
      progressRef.current = updated;
      setProgress(updated);
      saveProgress(updated);
      clearSavedGame();
    }
  }, [commit]);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === PipsPhase.PLAYING) saveGame(gameState);
  }, [gameState]);

  // Clock keyed on phase and level only — see CLAUDE.md, the Mahjong timer
  // gotcha: keying it to the whole state restarts the interval every move and
  // the clock never advances.
  const phase = gameState?.phase ?? null;
  const levelIndex = gameState?.levelIndex ?? null;
  useEffect(() => {
    if (phase !== PipsPhase.PLAYING) return;
    const timer = window.setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => window.clearInterval(timer);
  }, [phase, levelIndex, dispatch]);

  const startGame = useCallback((settings: PipsSettings) => {
    const stored = loadProgress();
    progressRef.current = stored;
    setProgress(stored);

    const index = stored.levels[stored.difficulty];
    const saved = loadSavedGame(stored.difficulty, index);
    if (saved) {
      commit({ ...saved, settings });
      return;
    }
    commit(createInitialPipsState(settings, index, buildLevel(index, stored.difficulty)));
  }, [commit]);

  const openLevel = useCallback((index: number, difficulty: PipsDifficulty) => {
    const prev = stateRef.current;
    if (!prev) return;
    clearSavedGame();
    const updated: PipsProgress = {
      difficulty,
      levels: { ...progressRef.current.levels, [difficulty]: index },
    };
    progressRef.current = updated;
    setProgress(updated);
    saveProgress(updated);
    commit(createInitialPipsState(prev.settings, index, buildLevel(index, difficulty)));
  }, [commit]);

  return {
    gameState,
    difficulty: progress.difficulty,
    startGame,
    selectDomino: useCallback((id: string | null) => dispatch({ type: 'SELECT_DOMINO', id }), [dispatch]),
    rotate: useCallback(() => dispatch({ type: 'ROTATE' }), [dispatch]),
    place: useCallback(
      (dominoId: string, anchor: CellKey, orientation: Orientation) =>
        dispatch({ type: 'PLACE', dominoId, anchor, orientation }),
      [dispatch],
    ),
    lift: useCallback((cell: CellKey) => dispatch({ type: 'LIFT', cell }), [dispatch]),
    clearBoard: useCallback(() => dispatch({ type: 'CLEAR_BOARD' }), [dispatch]),
    hint: useCallback(() => dispatch({ type: 'HINT' }), [dispatch]),
    nextLevel: useCallback(() => {
      const prev = stateRef.current;
      if (prev) openLevel(prev.levelIndex + 1, prev.puzzle.difficulty);
    }, [openLevel]),
    restartLevel: useCallback(() => {
      const prev = stateRef.current;
      if (prev) openLevel(prev.levelIndex, prev.puzzle.difficulty);
    }, [openLevel]),
    setDifficulty: useCallback((difficulty: PipsDifficulty) => {
      const prev = stateRef.current;
      if (!prev || prev.puzzle.difficulty === difficulty) return;
      // Pick up that track where it was left, rather than starting it over.
      openLevel(progressRef.current.levels[difficulty], difficulty);
    }, [openLevel]),
  };
}
