import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardKey } from '../../../types/card';
import { PlayerType } from '../../../types/game-common';
import type { RummyGameState, RummyGameSettings, RummyAction } from '../types';
import { RummyPhase, TurnStep } from '../types';
import { rummyReducer, createInitialRummyState } from '../engine/game-reducer';
import { getRummyAIAction } from '../ai/ai-player';
import { randomSeed } from '../../../utils/random';

interface UseRummyGameReturn {
  gameState: RummyGameState | null;
  startGame: (settings: RummyGameSettings) => void;
  newGame: () => void;
  drawFromStock: () => void;
  drawFromDiscard: () => void;
  meldCards: (cardKeys: CardKey[]) => void;
  layOff: (cardKey: CardKey, meldId: string) => void;
  discard: (cardKey: CardKey) => void;
  passTurn: () => void;
  humanSeat: number;
}

const HUMAN_SEAT = 0;
const AI_DELAY = 1000;
const AI_MELD_DELAY = 600;
const SAVE_KEY = 'rummy-saved-game';

function saveRummyGame(state: RummyGameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch { /* ignore quota errors */ }
}

function loadRummySavedGame(): RummyGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as RummyGameState;
    if (saved.phase === RummyPhase.PLAYING) {
      return saved;
    }
  } catch { /* ignore parse errors */ }
  return null;
}

function clearRummySavedGame(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function useRummyGame(): UseRummyGameReturn {
  const [gameState, setGameState] = useState<RummyGameState | null>(null);
  const gameRef = useRef<RummyGameState | null>(null);
  const aiTimerRef = useRef<number | null>(null);

  const safeDispatch = useCallback((action: RummyAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = rummyReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Rummy reducer error:', e);
        return prev;
      }
    });
  }, []);

  // Save game state on every change
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === RummyPhase.PLAYING) {
      saveRummyGame(gameState);
    } else if (gameState.phase === RummyPhase.ROUND_END) {
      clearRummySavedGame();
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

    // Schedule AI for PLAYING phase
    if (gameState.phase === RummyPhase.PLAYING) {
      const currentPlayer = gameState.players[gameState.currentPlayer];
      if (currentPlayer?.type === PlayerType.AI) {
        // Use shorter delay for meld/layoff actions, longer for draw and discard
        const delay = gameState.turnStep === TurnStep.DRAW ? AI_DELAY :
                      AI_MELD_DELAY;

        aiTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          const action = getRummyAIAction(state, state.currentPlayer);
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
    const saved = loadRummySavedGame();
    if (saved) {
      gameRef.current = saved;
      setGameState(saved);
      return;
    }
    const initial = createInitialRummyState(settings);
    gameRef.current = initial;
    setGameState(initial);
  }, []);

  const drawFromStock = useCallback(() => {
    safeDispatch({ type: 'DRAW_FROM_STOCK' });
  }, [safeDispatch]);

  const drawFromDiscard = useCallback(() => {
    safeDispatch({ type: 'DRAW_FROM_DISCARD' });
  }, [safeDispatch]);

  const meldCards = useCallback(
    (cardKeys: CardKey[]) => {
      safeDispatch({ type: 'MELD_CARDS', cardKeys });
    },
    [safeDispatch]
  );

  const layOff = useCallback(
    (cardKey: CardKey, meldId: string) => {
      safeDispatch({ type: 'LAY_OFF', cardKey, meldId });
    },
    [safeDispatch]
  );

  const discard = useCallback(
    (cardKey: CardKey) => {
      safeDispatch({ type: 'DISCARD', cardKey });
    },
    [safeDispatch]
  );

  const passTurn = useCallback(() => {
    safeDispatch({ type: 'PASS_TURN' });
  }, [safeDispatch]);

  const newGame = useCallback(() => {
    clearRummySavedGame();
    safeDispatch({ type: 'NEW_GAME', seed: randomSeed() });
  }, [safeDispatch]);

  return {
    gameState,
    startGame,
    newGame,
    drawFromStock,
    drawFromDiscard,
    meldCards,
    layOff,
    discard,
    passTurn,
    humanSeat: HUMAN_SEAT,
  };
}
