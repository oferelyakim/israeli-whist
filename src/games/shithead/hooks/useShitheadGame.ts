import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardKey } from '../../../types/card';
import { PlayerType } from '../../../types/game-common';
import type { ShitheadGameState, ShitheadGameSettings, ShitheadAction } from '../types';
import { ShitheadPhase } from '../types';
import { shitheadReducer, createInitialShitheadState } from '../engine/game-reducer';
import { getShitheadAIAction } from '../ai/ai-player';
import { randomSeed } from '../../../utils/random';

interface UseShitheadGameReturn {
  gameState: ShitheadGameState | null;
  startGame: (settings: ShitheadGameSettings) => void;
  playCards: (cardKeys: CardKey[]) => void;
  pickUpPile: () => void;
  playBlind: (cardIndex: number) => void;
  swapCards: (handCardKey: CardKey, faceUpCardKey: CardKey) => void;
  doneSwapping: () => void;
  newGame: () => void;
  endGame: () => void;
  humanSeat: number;
  fastForward: boolean;
  toggleFastForward: () => void;
}

const HUMAN_SEAT = 0;
const AI_DELAY = 1200;
const SAVE_KEY = 'shithead-saved-game';

function saveShitheadGame(state: ShitheadGameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch { /* ignore quota errors */ }
}

function loadShitheadSavedGame(): ShitheadGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as ShitheadGameState;
    if (saved.phase === ShitheadPhase.PLAYING || saved.phase === ShitheadPhase.SWAPPING) {
      return saved;
    }
  } catch { /* ignore parse errors */ }
  return null;
}

function clearShitheadSavedGame(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function useShitheadGame(): UseShitheadGameReturn {
  const [gameState, setGameState] = useState<ShitheadGameState | null>(null);
  const [fastForward, setFastForward] = useState(false);
  const gameRef = useRef<ShitheadGameState | null>(null);
  const aiTimerRef = useRef<number | null>(null);

  const safeDispatch = useCallback((action: ShitheadAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = shitheadReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Shithead reducer error:', e);
        return prev;
      }
    });
  }, []);

  // Save game state on every change
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === ShitheadPhase.PLAYING || gameState.phase === ShitheadPhase.SWAPPING) {
      saveShitheadGame(gameState);
    } else if (gameState.phase === ShitheadPhase.ROUND_END) {
      clearShitheadSavedGame();
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
    if (gameState.phase === ShitheadPhase.DEALING) {
      aiTimerRef.current = window.setTimeout(() => {
        safeDispatch({ type: 'DEAL', seed: randomSeed() });
      }, 300);
      return () => { clearTimeout(aiTimerRef.current!); };
    }

    // AI does DONE_SWAPPING immediately in SWAPPING phase
    if (gameState.phase === ShitheadPhase.SWAPPING) {
      const currentPlayer = gameState.players[gameState.currentPlayer];
      if (currentPlayer?.type === PlayerType.AI) {
        aiTimerRef.current = window.setTimeout(() => {
          safeDispatch({ type: 'DONE_SWAPPING', seat: gameState.currentPlayer });
        }, 500);
      }
      return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
    }

    // Schedule AI for PLAYING phase
    if (gameState.phase === ShitheadPhase.PLAYING) {
      const currentPlayer = gameState.players[gameState.currentPlayer];
      if (currentPlayer?.type === PlayerType.AI && !currentPlayer.finished) {
        aiTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          const action = getShitheadAIAction(state, state.currentPlayer);
          if (action) safeDispatch(action);
        }, fastForward ? 50 : AI_DELAY);
      }
    }

    return () => {
      if (aiTimerRef.current) {
        clearTimeout(aiTimerRef.current);
      }
    };
  }, [gameState, safeDispatch, fastForward]);

  const startGame = useCallback((settings: ShitheadGameSettings) => {
    const saved = loadShitheadSavedGame();
    if (saved) {
      gameRef.current = saved;
      setGameState(saved);
      return;
    }
    const initial = createInitialShitheadState(settings);
    const seed = randomSeed();
    const dealt = shitheadReducer(initial, { type: 'DEAL', seed });
    gameRef.current = dealt;
    setGameState(dealt);
  }, []);

  const playCards = useCallback(
    (cardKeys: CardKey[]) => {
      safeDispatch({ type: 'PLAY_CARDS', seat: HUMAN_SEAT, cardKeys });
    },
    [safeDispatch]
  );

  const pickUpPile = useCallback(() => {
    safeDispatch({ type: 'PICK_UP_PILE', seat: HUMAN_SEAT });
  }, [safeDispatch]);

  const playBlind = useCallback(
    (cardIndex: number) => {
      safeDispatch({ type: 'PLAY_BLIND', seat: HUMAN_SEAT, cardIndex });
    },
    [safeDispatch]
  );

  const swapCards = useCallback(
    (handCardKey: CardKey, faceUpCardKey: CardKey) => {
      safeDispatch({ type: 'SWAP_CARDS', seat: HUMAN_SEAT, handCardKey, faceUpCardKey });
    },
    [safeDispatch]
  );

  const doneSwapping = useCallback(() => {
    safeDispatch({ type: 'DONE_SWAPPING', seat: HUMAN_SEAT });
  }, [safeDispatch]);

  const toggleFastForward = useCallback(() => setFastForward(f => !f), []);

  const newGame = useCallback(() => {
    clearShitheadSavedGame();
    setFastForward(false);
    safeDispatch({ type: 'NEW_GAME', seed: randomSeed() });
  }, [safeDispatch]);

  const endGame = useCallback(() => {
    clearShitheadSavedGame();
  }, []);

  return {
    gameState,
    startGame,
    playCards,
    pickUpPile,
    playBlind,
    swapCards,
    doneSwapping,
    newGame,
    endGame,
    humanSeat: HUMAN_SEAT,
    fastForward,
    toggleFastForward,
  };
}
