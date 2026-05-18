import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardKey } from '../../../types/card';
import { PlayerType } from '../../../types/game-common';
import type { GinRummyGameState, GinRummyGameSettings, GinRummyAction } from '../types';
import { GinRummyPhase, TurnStep } from '../types';
import { ginRummyReducer, createInitialGinRummyState } from '../engine/game-reducer';
import { getGinRummyAIAction } from '../ai/ai-player';
import { randomSeed } from '../../../utils/random';

interface UseGinRummyGameReturn {
  gameState: GinRummyGameState | null;
  startGame: (settings: GinRummyGameSettings) => void;
  newGame: () => void;
  drawFromStock: () => void;
  drawFromDiscard: () => void;
  discard: (cardKey: CardKey, knock?: boolean) => void;
  layOffOnKnock: (cardKey: CardKey, meldIndex: number) => void;
  doneLayingOff: () => void;
  humanSeat: number;
}

const HUMAN_SEAT = 0;
const AI_DELAY = 1000;
const AI_LAYOFF_DELAY = 600;
const SAVE_KEY = 'gin-rummy-saved-game';

function saveGame(state: GinRummyGameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch { /* ignore quota errors */ }
}

function loadSavedGame(): GinRummyGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as GinRummyGameState;
    if (saved.phase === GinRummyPhase.PLAYING || saved.phase === GinRummyPhase.LAYING_OFF) {
      return saved;
    }
  } catch { /* ignore parse errors */ }
  return null;
}

function clearSavedGame(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function useGinRummyGame(): UseGinRummyGameReturn {
  const [gameState, setGameState] = useState<GinRummyGameState | null>(null);
  const gameRef = useRef<GinRummyGameState | null>(null);
  const aiTimerRef = useRef<number | null>(null);

  const safeDispatch = useCallback((action: GinRummyAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = ginRummyReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Gin Rummy reducer error:', e);
        return prev;
      }
    });
  }, []);

  // Save game state on every change
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === GinRummyPhase.PLAYING || gameState.phase === GinRummyPhase.LAYING_OFF) {
      saveGame(gameState);
    } else if (gameState.phase === GinRummyPhase.ROUND_END) {
      clearSavedGame();
    }
  }, [gameState]);

  // AI scheduling effect
  useEffect(() => {
    if (!gameState) return;

    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    // Auto-deal when phase is DEALING
    if (gameState.phase === GinRummyPhase.DEALING) {
      aiTimerRef.current = window.setTimeout(() => {
        safeDispatch({ type: 'DEAL', seed: randomSeed() });
      }, 300);
      return () => { clearTimeout(aiTimerRef.current!); };
    }

    // Schedule AI for PLAYING phase
    if (gameState.phase === GinRummyPhase.PLAYING) {
      const currentPlayer = gameState.players[gameState.currentPlayer];
      if (currentPlayer?.type === PlayerType.AI) {
        const delay = gameState.turnStep === TurnStep.DRAW ? AI_DELAY : AI_DELAY;

        aiTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          const action = getGinRummyAIAction(state, state.currentPlayer);
          if (action) safeDispatch(action);
        }, delay);
      }
    }

    // Schedule AI for LAYING_OFF phase
    if (gameState.phase === GinRummyPhase.LAYING_OFF) {
      const currentPlayer = gameState.players[gameState.currentPlayer];
      if (currentPlayer?.type === PlayerType.AI) {
        aiTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          const action = getGinRummyAIAction(state, state.currentPlayer);
          if (action) safeDispatch(action);
        }, AI_LAYOFF_DELAY);
      }
    }

    return () => {
      if (aiTimerRef.current) {
        clearTimeout(aiTimerRef.current);
      }
    };
  }, [gameState, safeDispatch]);

  const startGame = useCallback((settings: GinRummyGameSettings) => {
    const saved = loadSavedGame();
    if (saved) {
      gameRef.current = saved;
      setGameState(saved);
      return;
    }
    const initial = createInitialGinRummyState(settings);
    gameRef.current = initial;
    setGameState(initial);
  }, []);

  const drawFromStock = useCallback(() => {
    safeDispatch({ type: 'DRAW_FROM_STOCK' });
  }, [safeDispatch]);

  const drawFromDiscard = useCallback(() => {
    safeDispatch({ type: 'DRAW_FROM_DISCARD' });
  }, [safeDispatch]);

  const discard = useCallback(
    (ck: CardKey, knock?: boolean) => {
      safeDispatch({ type: 'DISCARD', cardKey: ck, knock });
    },
    [safeDispatch]
  );

  const layOffOnKnock = useCallback(
    (ck: CardKey, meldIndex: number) => {
      safeDispatch({ type: 'LAY_OFF_ON_KNOCK', cardKey: ck, meldIndex });
    },
    [safeDispatch]
  );

  const doneLayingOff = useCallback(() => {
    safeDispatch({ type: 'DONE_LAYING_OFF' });
  }, [safeDispatch]);

  const newGame = useCallback(() => {
    clearSavedGame();
    safeDispatch({ type: 'NEW_GAME', seed: randomSeed() });
  }, [safeDispatch]);

  return {
    gameState,
    startGame,
    newGame,
    drawFromStock,
    drawFromDiscard,
    discard,
    layOffOnKnock,
    doneLayingOff,
    humanSeat: HUMAN_SEAT,
  };
}
