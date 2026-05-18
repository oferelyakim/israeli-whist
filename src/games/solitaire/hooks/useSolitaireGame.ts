import { useCallback, useEffect, useRef, useState } from 'react';
import type { SolitaireGameState, SolitaireGameSettings, SolitaireAction, MoveSource } from '../types';
import { SolitairePhase } from '../types';
import { solitaireReducer, createInitialSolitaireState } from '../engine/game-reducer';
import { randomSeed } from '../../../utils/random';

const AUTO_COMPLETE_DELAY = 150;
const SAVE_KEY = 'solitaire-saved-game';

function saveGame(state: SolitaireGameState): void {
  try {
    // Don't save moveHistory (too large) — undo won't work after restore, that's fine
    const toSave = { ...state, moveHistory: [] };
    localStorage.setItem(SAVE_KEY, JSON.stringify(toSave));
  } catch { /* ignore quota errors */ }
}

function loadSavedGame(): SolitaireGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as SolitaireGameState;
    // Only restore if game was in progress
    if (saved.phase === SolitairePhase.PLAYING || saved.phase === SolitairePhase.AUTO_COMPLETING) {
      saved.phase = SolitairePhase.PLAYING; // reset auto-completing
      saved.moveHistory = [];
      saved.hintHighlight = null;
      saved.hintTarget = null;
      saved.hintMessage = null;
      saved.hintIndex = -1;
      saved.showStuckDialog = false;
      return saved;
    }
  } catch { /* ignore parse errors */ }
  return null;
}

function clearSavedGame(): void {
  localStorage.removeItem(SAVE_KEY);
}

export interface UseSolitaireGameReturn {
  gameState: SolitaireGameState | null;
  startGame: (settings: SolitaireGameSettings) => void;
  drawFromStock: () => void;
  recycleWaste: () => void;
  moveToTableau: (source: MoveSource, cardIndex: number, destColumn: number) => void;
  moveToFoundation: (source: MoveSource, destFoundation: number) => void;
  undo: () => void;
  hint: () => void;
  startAutoComplete: () => void;
  newGame: () => void;
  restartSameCards: () => void;
}

export function useSolitaireGame(): UseSolitaireGameReturn {
  const [gameState, setGameState] = useState<SolitaireGameState | null>(null);
  const gameRef = useRef<SolitaireGameState | null>(null);
  const autoCompleteTimerRef = useRef<number | null>(null);

  // Save game state whenever it changes
  useEffect(() => {
    if (gameState && gameState.phase !== SolitairePhase.DEALING) {
      if (gameState.phase === SolitairePhase.WON) {
        clearSavedGame();
      } else {
        saveGame(gameState);
      }
    }
  }, [gameState]);

  const safeDispatch = useCallback((action: SolitaireAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = solitaireReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Solitaire reducer error:', e);
        return prev;
      }
    });
  }, []);

  // Auto-complete animation loop
  useEffect(() => {
    if (!gameState || gameState.phase !== SolitairePhase.AUTO_COMPLETING) return;

    autoCompleteTimerRef.current = window.setTimeout(() => {
      safeDispatch({ type: 'AUTO_COMPLETE_STEP' });
    }, AUTO_COMPLETE_DELAY);

    return () => {
      if (autoCompleteTimerRef.current) {
        clearTimeout(autoCompleteTimerRef.current);
      }
    };
  }, [gameState, safeDispatch]);

  const startGame = useCallback((settings: SolitaireGameSettings) => {
    // Try to restore a saved game first
    const saved = loadSavedGame();
    if (saved) {
      gameRef.current = saved;
      setGameState(saved);
      return;
    }
    const initial = createInitialSolitaireState(settings);
    const dealt = solitaireReducer(initial, { type: 'DEAL', seed: randomSeed() });
    gameRef.current = dealt;
    setGameState(dealt);
  }, []);

  const drawFromStock = useCallback(() => {
    safeDispatch({ type: 'DRAW_FROM_STOCK' });
  }, [safeDispatch]);

  const recycleWaste = useCallback(() => {
    safeDispatch({ type: 'RECYCLE_WASTE' });
  }, [safeDispatch]);

  const moveToTableau = useCallback(
    (source: MoveSource, cardIndex: number, destColumn: number) => {
      safeDispatch({ type: 'MOVE_TO_TABLEAU', source, cardIndex, destColumn });
    },
    [safeDispatch],
  );

  const moveToFoundation = useCallback(
    (source: MoveSource, destFoundation: number) => {
      safeDispatch({ type: 'MOVE_TO_FOUNDATION', source, destFoundation });
    },
    [safeDispatch],
  );

  const undo = useCallback(() => {
    safeDispatch({ type: 'UNDO' });
  }, [safeDispatch]);

  const hint = useCallback(() => {
    safeDispatch({ type: 'HINT' });
  }, [safeDispatch]);

  const startAutoComplete = useCallback(() => {
    setGameState((prev) => {
      if (!prev) return prev;
      const next = { ...prev, phase: SolitairePhase.AUTO_COMPLETING };
      gameRef.current = next;
      return next;
    });
  }, []);

  const newGame = useCallback(() => {
    if (!gameRef.current) return;
    clearSavedGame();
    const settings = gameRef.current.settings;
    const initial = createInitialSolitaireState(settings);
    const dealt = solitaireReducer(initial, { type: 'DEAL', seed: randomSeed() });
    gameRef.current = dealt;
    setGameState(dealt);
  }, []);

  const restartSameCards = useCallback(() => {
    safeDispatch({ type: 'RESTART_SAME_CARDS' });
  }, [safeDispatch]);

  return {
    gameState,
    startGame,
    drawFromStock,
    recycleWaste,
    moveToTableau,
    moveToFoundation,
    undo,
    hint,
    startAutoComplete,
    newGame,
    restartSameCards,
  };
}
