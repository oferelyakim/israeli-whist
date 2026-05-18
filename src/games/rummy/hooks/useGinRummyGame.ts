import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardKey } from '../../../types/card';
import { PlayerType } from '../../../types/game-common';
import type { RummyGameState, RummyGameSettings, RummyAction } from '../types';
import { RummyPhase, TurnStep } from '../types';
import { ginReducer, createInitialGinState } from '../engine/gin-reducer';
import { getGinAIAction } from '../ai/gin-ai';
import { randomSeed } from '../../../utils/random';

interface UseGinRummyGameReturn {
  gameState: RummyGameState | null;
  startGame: (settings: RummyGameSettings) => void;
  newGame: () => void;
  drawFromStock: () => void;
  drawFromDiscard: () => void;
  discard: (cardKey: CardKey) => void;
  knock: (melds: CardKey[][]) => void;
  gin: (melds: CardKey[][]) => void;
  defenderLayoff: (cardKey: CardKey, meldIndex: number) => void;
  defenderDone: () => void;
  humanSeat: number;
}

const HUMAN_SEAT = 0;
const AI_DELAY = 1000;
const AI_MELD_DELAY = 600;
const SAVE_KEY = 'gin-rummy-saved-game';

function saveGinGame(state: RummyGameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch { /* ignore quota errors */ }
}

function loadGinSavedGame(): RummyGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as RummyGameState;
    if (saved.phase === RummyPhase.PLAYING || saved.phase === RummyPhase.KNOCK_REVEAL) {
      return saved;
    }
  } catch { /* ignore parse errors */ }
  return null;
}

function clearGinSavedGame(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function useGinRummyGame(): UseGinRummyGameReturn {
  const [gameState, setGameState] = useState<RummyGameState | null>(null);
  const gameRef = useRef<RummyGameState | null>(null);
  const aiTimerRef = useRef<number | null>(null);

  const safeDispatch = useCallback((action: RummyAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = ginReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Gin reducer error:', e);
        return prev;
      }
    });
  }, []);

  // Save game state on every change
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === RummyPhase.PLAYING || gameState.phase === RummyPhase.KNOCK_REVEAL) {
      saveGinGame(gameState);
    } else if (gameState.phase === RummyPhase.ROUND_END) {
      clearGinSavedGame();
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
    if (gameState.phase === RummyPhase.DEALING) {
      aiTimerRef.current = window.setTimeout(() => {
        safeDispatch({ type: 'DEAL', seed: randomSeed() });
      }, 300);
      return () => { clearTimeout(aiTimerRef.current!); };
    }

    // Schedule AI for PLAYING or KNOCK_REVEAL phase
    if (gameState.phase === RummyPhase.PLAYING || gameState.phase === RummyPhase.KNOCK_REVEAL) {
      const currentPlayer = gameState.players[gameState.currentPlayer];
      if (currentPlayer?.type === PlayerType.AI) {
        const delay = gameState.turnStep === TurnStep.DRAW ? AI_DELAY : AI_MELD_DELAY;

        aiTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          const action = getGinAIAction(state, state.currentPlayer);
          if (action) safeDispatch(action);
        }, delay);
      }
    }

    return () => {
      if (aiTimerRef.current) {
        clearTimeout(aiTimerRef.current);
      }
    };
  }, [gameState, safeDispatch]);

  const startGame = useCallback((settings: RummyGameSettings) => {
    const saved = loadGinSavedGame();
    if (saved) {
      gameRef.current = saved;
      setGameState(saved);
      return;
    }
    const initial = createInitialGinState(settings);
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
    (ck: CardKey) => {
      safeDispatch({ type: 'DISCARD', cardKey: ck });
    },
    [safeDispatch]
  );

  const knock = useCallback(
    (melds: CardKey[][]) => {
      safeDispatch({ type: 'KNOCK', melds });
    },
    [safeDispatch]
  );

  const gin = useCallback(
    (melds: CardKey[][]) => {
      safeDispatch({ type: 'GIN', melds });
    },
    [safeDispatch]
  );

  const defenderLayoff = useCallback(
    (ck: CardKey, meldIndex: number) => {
      safeDispatch({ type: 'DEFENDER_LAYOFF', cardKey: ck, meldIndex });
    },
    [safeDispatch]
  );

  const defenderDone = useCallback(() => {
    safeDispatch({ type: 'DEFENDER_DONE' });
  }, [safeDispatch]);

  const newGame = useCallback(() => {
    clearGinSavedGame();
    safeDispatch({ type: 'NEW_GAME', seed: randomSeed() });
  }, [safeDispatch]);

  return {
    gameState,
    startGame,
    newGame,
    drawFromStock,
    drawFromDiscard,
    discard,
    knock,
    gin,
    defenderLayoff,
    defenderDone,
    humanSeat: HUMAN_SEAT,
  };
}
