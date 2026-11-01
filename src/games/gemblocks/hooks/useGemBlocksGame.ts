import { useCallback, useEffect, useRef, useState } from 'react';
import { GemPhase } from '../types';
import type {
  GemBlocksAction,
  GemBlocksGameState,
  GemBlocksRecord,
  GemBlocksSettings,
} from '../types';
import { createInitialGemState, gemBlocksReducer } from '../engine/game-reducer';
import { randomSeed } from '../../../utils/random';

const SAVE_KEY = 'gemblocks-saved-game';
const RECORD_KEY = 'gemblocks-record';

function saveGame(state: GemBlocksGameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, lastClear: null }));
  } catch { /* ignore quota errors */ }
}

function loadSavedGame(): GemBlocksGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as GemBlocksGameState;
    if (saved.phase !== GemPhase.PLAYING) return null;
    if (!Array.isArray(saved.board) || saved.board.length !== 9) return null;
    return { ...saved, selectedIndex: null, lastClear: null };
  } catch {
    return null;
  }
}

function clearSavedGame(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* ignore */ }
}

export function loadRecord(): GemBlocksRecord | null {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as GemBlocksRecord;
    return Number.isFinite(saved.moves) ? saved : null;
  } catch {
    return null;
  }
}

/** Keeps the fewest-moves win; ties break on the quicker clock. */
function recordWin(moves: number, seconds: number): GemBlocksRecord {
  const previous = loadRecord();
  const better =
    !previous || moves < previous.moves || (moves === previous.moves && seconds < previous.seconds);
  const next: GemBlocksRecord = better
    ? { moves, seconds, date: new Date().toLocaleDateString() }
    : previous;
  try {
    localStorage.setItem(RECORD_KEY, JSON.stringify(next));
  } catch { /* ignore quota errors */ }
  return next;
}

export interface UseGemBlocksGameReturn {
  gameState: GemBlocksGameState | null;
  record: GemBlocksRecord | null;
  startGame: (settings: GemBlocksSettings) => void;
  selectPiece: (index: number | null) => void;
  placePiece: (index: number, row: number, col: number) => void;
  clearFlash: () => void;
  newGame: () => void;
}

export function useGemBlocksGame(): UseGemBlocksGameReturn {
  const [gameState, setGameState] = useState<GemBlocksGameState | null>(null);
  const [record, setRecord] = useState<GemBlocksRecord | null>(null);
  const stateRef = useRef<GemBlocksGameState | null>(null);

  const commit = useCallback((next: GemBlocksGameState) => {
    stateRef.current = next;
    setGameState(next);
  }, []);

  const dispatch = useCallback((action: GemBlocksAction) => {
    const prev = stateRef.current;
    if (!prev) return;
    let next: GemBlocksGameState;
    try {
      next = gemBlocksReducer(prev, action);
    } catch (e) {
      console.error('Gem Blocks reducer error:', e);
      return;
    }
    commit(next);

    // Finishing is a consequence of the move that finished it, so the record is
    // written here rather than in an effect (react-x treats setState inside an
    // effect as a cascading render).
    if (next.phase === GemPhase.WON && prev.phase !== GemPhase.WON) {
      setRecord(recordWin(next.moves, next.elapsedSeconds));
      clearSavedGame();
    } else if (next.phase === GemPhase.GAME_OVER) {
      clearSavedGame();
    }
  }, [commit]);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === GemPhase.PLAYING) saveGame(gameState);
  }, [gameState]);

  // Clock keyed on phase only — see CLAUDE.md, the Mahjong timer gotcha.
  const phase = gameState?.phase ?? null;
  useEffect(() => {
    if (phase !== GemPhase.PLAYING) return;
    const timer = window.setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => window.clearInterval(timer);
  }, [phase, dispatch]);

  const startGame = useCallback((settings: GemBlocksSettings) => {
    setRecord(loadRecord());
    const saved = loadSavedGame();
    commit(saved ? { ...saved, settings } : createInitialGemState(settings, randomSeed()));
  }, [commit]);

  const newGame = useCallback(() => {
    const prev = stateRef.current;
    if (!prev) return;
    clearSavedGame();
    commit(createInitialGemState(prev.settings, randomSeed()));
  }, [commit]);

  return {
    gameState,
    record,
    startGame,
    selectPiece: useCallback((index: number | null) => dispatch({ type: 'SELECT_PIECE', index }), [dispatch]),
    placePiece: useCallback(
      (index: number, row: number, col: number) => dispatch({ type: 'PLACE_PIECE', index, row, col }),
      [dispatch],
    ),
    clearFlash: useCallback(() => dispatch({ type: 'CLEAR_FLASH' }), [dispatch]),
    newGame,
  };
}
