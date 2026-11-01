import { useCallback, useEffect, useRef, useState } from 'react';
import { PipsPhase } from '../types';
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

function loadProgress(): PipsProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return { levelIndex: 0 };
    const saved = JSON.parse(raw) as PipsProgress;
    const index = Number(saved.levelIndex);
    return { levelIndex: Number.isFinite(index) && index >= 0 ? index : 0 };
  } catch {
    return { levelIndex: 0 };
  }
}

function saveProgress(levelIndex: number): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ levelIndex }));
  } catch { /* ignore quota errors */ }
}

function saveGame(state: PipsGameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, selectedId: null }));
  } catch { /* ignore quota errors */ }
}

function loadSavedGame(): PipsGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as PipsGameState;
    if (saved.phase !== PipsPhase.PLAYING) return null;
    if (!saved.puzzle || !Array.isArray(saved.puzzle.cells) || saved.puzzle.cells.length === 0) {
      return null;
    }
    if (!Array.isArray(saved.placements)) return null;
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
  /** How far the player has got, so the menu can offer the next board. */
  unlocked: number;
  startGame: (settings: PipsSettings) => void;
  selectDomino: (id: string | null) => void;
  rotate: () => void;
  place: (dominoId: string, anchor: CellKey, orientation: Orientation) => void;
  lift: (cell: CellKey) => void;
  clearBoard: () => void;
  hint: () => void;
  nextLevel: () => void;
  restartLevel: () => void;
}

export function usePipsGame(): UsePipsGameReturn {
  const [gameState, setGameState] = useState<PipsGameState | null>(null);
  const [unlocked, setUnlocked] = useState(0);
  const stateRef = useRef<PipsGameState | null>(null);

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
    // unlock is written here rather than in an effect (react-x treats setState
    // inside an effect as a cascading render).
    if (next.phase === PipsPhase.SOLVED && prev.phase !== PipsPhase.SOLVED) {
      const reached = next.levelIndex + 1;
      setUnlocked((current) => {
        const best = Math.max(current, reached);
        saveProgress(best);
        return best;
      });
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
    const progress = loadProgress();
    setUnlocked(progress.levelIndex);
    const saved = loadSavedGame();
    if (saved) {
      commit({ ...saved, settings });
      return;
    }
    commit(createInitialPipsState(settings, progress.levelIndex, buildLevel(progress.levelIndex)));
  }, [commit]);

  const openLevel = useCallback((index: number) => {
    const prev = stateRef.current;
    if (!prev) return;
    clearSavedGame();
    commit(createInitialPipsState(prev.settings, index, buildLevel(index)));
  }, [commit]);

  return {
    gameState,
    unlocked,
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
      if (prev) openLevel(prev.levelIndex + 1);
    }, [openLevel]),
    restartLevel: useCallback(() => {
      const prev = stateRef.current;
      if (prev) openLevel(prev.levelIndex);
    }, [openLevel]),
  };
}
