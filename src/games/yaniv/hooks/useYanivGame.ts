import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardKey } from '../../../types/card';
import { PlayerType } from '../../../types/game-common';
import type { YanivGameState, YanivGameSettings, YanivAction } from '../types';
import { YanivPhase } from '../types';
import { yanivReducer, createInitialYanivState } from '../engine/game-reducer';
import { getYanivAIAction } from '../ai/ai-player';
import { randomSeed } from '../../../utils/random';

interface UseYanivGameReturn {
  gameState: YanivGameState | null;
  startGame: (settings: YanivGameSettings) => void;
  discardAndDraw: (discardCards: CardKey[], drawSource: 'pile' | 'discard', drawCardKey?: CardKey) => void;
  declareYaniv: () => void;
  quickStick: (cardKey: CardKey) => void;
  skipQuickStick: () => void;
  nextRound: () => void;
  endGame: () => void;
  newGame: () => void;
  humanSeat: number;
}

const HUMAN_SEAT = 0;
const AI_DELAY = 1200;

export function useYanivGame(): UseYanivGameReturn {
  const [gameState, setGameState] = useState<YanivGameState | null>(null);
  const gameRef = useRef<YanivGameState | null>(null);
  const aiTimerRef = useRef<number | null>(null);

  const safeDispatch = useCallback((action: YanivAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = yanivReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Yaniv reducer error:', e);
        return prev;
      }
    });
  }, []);

  // AI scheduling effect
  useEffect(() => {
    if (!gameState) return;
    const round = gameState.currentRound;

    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    // Auto-deal when phase is DEALING
    if (round.phase === YanivPhase.DEALING) {
      aiTimerRef.current = window.setTimeout(() => {
        safeDispatch({ type: 'DEAL', seed: randomSeed() });
      }, 300);
      return () => { clearTimeout(aiTimerRef.current!); };
    }

    // Schedule AI for PLAYER_TURN and QUICK_STICK
    if (
      round.phase === YanivPhase.PLAYER_TURN ||
      round.phase === YanivPhase.QUICK_STICK
    ) {
      const currentPlayer = round.players[round.currentPlayer];
      if (currentPlayer?.type === PlayerType.AI && !currentPlayer.eliminated) {
        aiTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          const action = getYanivAIAction(state, state.currentRound.currentPlayer);
          if (action) safeDispatch(action);
        }, AI_DELAY);
      }
    }

    return () => {
      if (aiTimerRef.current) {
        clearTimeout(aiTimerRef.current);
      }
    };
  }, [gameState, safeDispatch]);

  const discardAndDraw = useCallback(
    (discardCards: CardKey[], drawSource: 'pile' | 'discard', drawCardKey?: CardKey) => {
      safeDispatch({
        type: 'DISCARD_AND_DRAW',
        seat: HUMAN_SEAT,
        discardCards,
        drawSource,
        drawCardKey,
      });
    },
    [safeDispatch]
  );

  const declareYaniv = useCallback(() => {
    safeDispatch({ type: 'DECLARE_YANIV', seat: HUMAN_SEAT });
  }, [safeDispatch]);

  const quickStick = useCallback(
    (cardKey: CardKey) => {
      safeDispatch({ type: 'QUICK_STICK', seat: HUMAN_SEAT, discardCard: cardKey });
    },
    [safeDispatch]
  );

  const skipQuickStick = useCallback(() => {
    safeDispatch({ type: 'SKIP_QUICK_STICK', seat: HUMAN_SEAT });
  }, [safeDispatch]);

  const nextRound = useCallback(() => {
    safeDispatch({ type: 'NEXT_ROUND', seed: randomSeed() });
  }, [safeDispatch]);

  const endGame = useCallback(() => {
    safeDispatch({ type: 'END_GAME' });
  }, [safeDispatch]);

  const settingsRef = useRef<YanivGameSettings | null>(null);

  const startGameWrapped = useCallback((settings: YanivGameSettings) => {
    settingsRef.current = settings;
    const initial = createInitialYanivState(settings);
    const seed = randomSeed();
    const dealt = yanivReducer(initial, { type: 'DEAL', seed });
    gameRef.current = dealt;
    setGameState(dealt);
  }, []);

  const newGame = useCallback(() => {
    if (!settingsRef.current) return;
    const initial = createInitialYanivState(settingsRef.current);
    const seed = randomSeed();
    const dealt = yanivReducer(initial, { type: 'DEAL', seed });
    gameRef.current = dealt;
    setGameState(dealt);
  }, []);

  return {
    gameState,
    startGame: startGameWrapped,
    discardAndDraw,
    declareYaniv,
    quickStick,
    skipQuickStick,
    nextRound,
    endGame,
    newGame,
    humanSeat: HUMAN_SEAT,
  };
}
