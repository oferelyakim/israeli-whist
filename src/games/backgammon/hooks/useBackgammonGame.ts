import { useCallback, useEffect, useRef, useState } from 'react';
import type { BackgammonGameState, BackgammonSettings, BgColor, BgMove } from '../types';
import { createInitialBgState, backgammonReducer } from '../engine/game-reducer';
import { getLegalMoves } from '../engine/board';
import { getBgAIAction } from '../ai/ai-player';
import { randomSeed } from '../../../utils/random';

const SAVED_GAME_KEY = 'backgammon-saved-game';
const AI_DELAY = 700;

function loadSavedGame(): BackgammonGameState | null {
  try {
    const raw = localStorage.getItem(SAVED_GAME_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as BackgammonGameState;
  } catch {
    return null;
  }
}

function saveGame(state: BackgammonGameState): void {
  try {
    localStorage.setItem(SAVED_GAME_KEY, JSON.stringify(state));
  } catch {
    // Storage quota exceeded — silently ignore
  }
}

export interface UseBackgammonGameReturn {
  gameState: BackgammonGameState;
  legalMoves: BgMove[];
  allLegalSources: Array<number | 'bar'>;
  selectedFrom: number | 'bar' | null;
  rollDice: () => void;
  selectChecker: (from: number | 'bar') => void;
  moveChecker: (to: number) => void;
  newGame: () => void;
  undo: () => void;
  canUndo: boolean;
  humanColor: BgColor;
}

export function useBackgammonGame(settings: BackgammonSettings): UseBackgammonGameReturn {
  const humanColor: BgColor = settings.playerColor ?? 'white';

  const initialState = loadSavedGame() ?? createInitialBgState(settings, randomSeed());

  const [gameState, setGameState] = useState<BackgammonGameState>(initialState);
  const [selectedFrom, setSelectedFrom] = useState<number | 'bar' | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const gameRef = useRef<BackgammonGameState>(initialState);
  const aiTimerRef = useRef<number | null>(null);
  // History stores snapshots taken BEFORE each human action.
  // AI actions are not pushed so undoing always lands on a human-controlled state.
  const historyRef = useRef<BackgammonGameState[]>([]);

  /** Apply a human-initiated action, pushing the current state to history first. */
  const dispatch = useCallback((action: Parameters<typeof backgammonReducer>[1]) => {
    // Snapshot before applying so we can restore it on undo
    historyRef.current.push(gameRef.current);
    setCanUndo(true);

    setGameState((prev) => {
      const next = backgammonReducer(prev, action);
      gameRef.current = next;
      saveGame(next);
      return next;
    });
  }, []);

  const bgState = gameState.state;
  const isHumanTurn = bgState.turn === humanColor;
  const isAITurn = !isHumanTurn && bgState.phase !== 'GAME_OVER';

  useEffect(() => {
    if (!isAITurn) return;

    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
    }

    aiTimerRef.current = window.setTimeout(() => {
      const current = gameRef.current;
      const action = getBgAIAction(current, settings.difficulty ?? 2);
      if (action) {
        // AI actions do NOT push to history — the user undoes human moves, not AI responses
        setGameState((prev) => {
          const next = backgammonReducer(prev, action);
          gameRef.current = next;
          saveGame(next);
          return next;
        });
      }
    }, AI_DELAY);

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [isAITurn, gameState.state.phase, gameState.state.dice.length, gameState.state.turn]);

  const allLegalMoves = bgState.phase === 'MOVING' && isHumanTurn
    ? getLegalMoves(bgState, humanColor)
    : [];

  // Only surface targets after the user has selected a source checker.
  const legalMoves = selectedFrom !== null
    ? allLegalMoves.filter((m) => m.from === selectedFrom)
    : [];

  const allLegalSources: Array<number | 'bar'> = bgState.phase === 'MOVING' && isHumanTurn
    ? [...new Set(allLegalMoves.map((m) => m.from))]
    : [];

  const rollDice = useCallback(() => {
    if (bgState.phase !== 'ROLLING' || !isHumanTurn) return;
    dispatch({ type: 'ROLL_DICE', seed: randomSeed() });
  }, [bgState.phase, isHumanTurn, dispatch]);

  const selectChecker = useCallback((from: number | 'bar') => {
    if (bgState.phase !== 'MOVING' || !isHumanTurn) return;

    const board = bgState.board;
    const bar = bgState.bar;

    if (from === 'bar') {
      if (bar[humanColor] <= 0) return;
    } else {
      if (board[from].color !== humanColor || board[from].count <= 0) return;
    }

    const movesFromHere = allLegalMoves.filter((m) => m.from === from);
    if (movesFromHere.length === 0) return;

    setSelectedFrom((prev) => (prev === from ? null : from));
  }, [bgState, isHumanTurn, humanColor, allLegalMoves]);

  const moveChecker = useCallback((to: number) => {
    if (selectedFrom === null) return;
    const move = legalMoves.find((m) => m.from === selectedFrom && m.to === to);
    if (move?.via !== undefined) {
      dispatch({ type: 'COMBINED_MOVE', from: move.from, via: move.via, to: move.to });
    } else {
      dispatch({ type: 'MOVE_CHECKER', from: selectedFrom, to });
    }
    setSelectedFrom(null);
  }, [selectedFrom, legalMoves, dispatch]);

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;

    setCanUndo(historyRef.current.length > 0);

    // Cancel any pending AI timer so it doesn't fire on the restored state
    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    gameRef.current = prev;
    setGameState(prev);
    setSelectedFrom(null);
    saveGame(prev);
  }, []);

  const newGame = useCallback(() => {
    localStorage.removeItem(SAVED_GAME_KEY);
    historyRef.current = [];
    setCanUndo(false);
    const newState = createInitialBgState(settings, randomSeed());
    newState.state.scores = gameState.state.scores;
    gameRef.current = newState;
    setGameState(newState);
    setSelectedFrom(null);
  }, [settings, gameState.state.scores]);

  return {
    gameState,
    legalMoves,
    allLegalSources,
    selectedFrom,
    rollDice,
    selectChecker,
    moveChecker,
    newGame,
    undo,
    canUndo,
    humanColor,
  };
}
