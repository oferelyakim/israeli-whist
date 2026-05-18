import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card } from '../../../types/card';
import { PlayerType } from '../../../types/game-common';
import type { IsraeliRummyGameState, IsraeliRummyGameSettings, IsraeliRummyAction, Meld } from '../types';
import { IsraeliRummyPhase, TurnAction } from '../types';
import { israeliRummyReducer, createInitialIsraeliRummyState } from '../engine/game-reducer';
import { sortBySuit, sortBySequence } from '../engine/validation';
import { getIsraeliRummyAIAction } from '../ai/ai-player';
import { randomSeed } from '../../../utils/random';

interface UseIsraeliRummyGameReturn {
  gameState: IsraeliRummyGameState | null;
  startGame: (settings: IsraeliRummyGameSettings) => void;
  newGame: () => void;
  endGame: () => void;
  drawCard: () => void;
  startRearrange: () => void;
  commitMelds: (melds: Meld[], hand: Card[]) => void;
  revertRearrange: () => void;
  passTurn: () => void;
  sortHandBy: (mode: 'suit' | 'sequence') => void;
  reorderHand: (newHand: Card[]) => void;
  humanSeat: number;
}

const HUMAN_SEAT = 0;
const AI_DELAY = 1000;
const AI_REARRANGE_DELAY = 600;
const AI_STUCK_TIMEOUT = 5000; // If AI hasn't progressed in 5s, force recovery
const SAVE_KEY = 'israeli-rummy-saved-game';

/**
 * Normalize a game state before persisting: never save a mid-rearrange state,
 * because the working melds/hand live in React local state in the table
 * component and would be lost on reload — leaving the reducer stuck in
 * REARRANGING (rejects DRAW_CARD / PASS_TURN) with no UI to recover.
 * Belt-and-suspenders with the beforeunload/visibilitychange handler.
 */
function normalizeForSave(state: IsraeliRummyGameState): IsraeliRummyGameState {
  if (state.turnAction === TurnAction.REARRANGING && state.boardSnapshot) {
    // Restore current player's hand from snapshot and clear snapshot
    const newPlayers = [...state.players];
    newPlayers[state.currentPlayer] = {
      ...state.players[state.currentPlayer],
      hand: [...state.boardSnapshot.hand],
    };
    return {
      ...state,
      players: newPlayers,
      melds: state.boardSnapshot.melds.map(m => ({ ...m, cards: [...m.cards] })),
      turnAction: TurnAction.CHOOSE,
      boardSnapshot: null,
    };
  }
  return state;
}

function saveGame(state: IsraeliRummyGameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(normalizeForSave(state)));
  } catch { /* ignore quota errors */ }
}

function loadSavedGame(): IsraeliRummyGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as IsraeliRummyGameState;
    if (saved.phase === IsraeliRummyPhase.PLAYING) {
      // If the saved state is stale-REARRANGING (e.g. written by an older
      // build before normalizeForSave existed), auto-revert here so we
      // return a CHOOSE state with the pre-rearrange board restored.
      return normalizeForSave(saved);
    }
  } catch { /* ignore parse errors */ }
  return null;
}

function clearSavedGame(): void {
  localStorage.removeItem(SAVE_KEY);
}

export function useIsraeliRummyGame(): UseIsraeliRummyGameReturn {
  const [gameState, setGameState] = useState<IsraeliRummyGameState | null>(null);
  const gameRef = useRef<IsraeliRummyGameState | null>(null);
  const aiTimerRef = useRef<number | null>(null);
  const aiStuckTimerRef = useRef<number | null>(null);
  const lastAiMoveCountRef = useRef<number>(-1);
  /** Track when AI reverted rearrangement so we don't loop START_REARRANGE → REVERT */
  const aiRevertedForTurnRef = useRef<string>('');

  const safeDispatch = useCallback((action: IsraeliRummyAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = israeliRummyReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Israeli Rummy reducer error:', e);
        return prev;
      }
    });
  }, []);

  // Save game state on every change
  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === IsraeliRummyPhase.PLAYING) {
      saveGame(gameState);
    } else if (gameState.phase === IsraeliRummyPhase.ROUND_END) {
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
    if (aiStuckTimerRef.current) {
      clearTimeout(aiStuckTimerRef.current);
      aiStuckTimerRef.current = null;
    }

    // Auto-deal when phase is DEALING
    if (gameState.phase === IsraeliRummyPhase.DEALING) {
      aiTimerRef.current = window.setTimeout(() => {
        safeDispatch({ type: 'DEAL', seed: randomSeed() });
      }, 300);
      return () => { clearTimeout(aiTimerRef.current!); };
    }

    // Schedule AI for PLAYING phase
    if (gameState.phase === IsraeliRummyPhase.PLAYING) {
      const currentPlayer = gameState.players[gameState.currentPlayer];
      if (currentPlayer?.type === PlayerType.AI) {
        const delay = gameState.turnAction === TurnAction.CHOOSE ? AI_DELAY : AI_REARRANGE_DELAY;

        aiTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          // Track moveCount before action to detect if reducer accepted it
          lastAiMoveCountRef.current = state.moveCount;
          let action = getIsraeliRummyAIAction(state, state.currentPlayer);

          // Break the START_REARRANGE → REVERT_REARRANGE cycle:
          // If AI wants to rearrange but already tried+reverted this turn, skip to draw/pass.
          const turnKey = `${state.currentPlayer}_${state.moveCount}`;
          if (action?.type === 'START_REARRANGE' && aiRevertedForTurnRef.current === turnKey) {
            action = state.drawPile.length > 0
              ? { type: 'DRAW_CARD' }
              : { type: 'PASS_TURN' };
          }
          // Track if AI reverted during rearrangement
          if (action?.type === 'REVERT_REARRANGE') {
            aiRevertedForTurnRef.current = turnKey;
          }
          // Reset tracking when turn advances
          if (action?.type === 'DRAW_CARD' || action?.type === 'PASS_TURN' || action?.type === 'COMMIT_MELDS') {
            aiRevertedForTurnRef.current = '';
          }

          if (action) safeDispatch(action);
        }, delay);

        // Watchdog: if AI is stuck (state doesn't progress), force recovery
        aiStuckTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          if (state.phase !== IsraeliRummyPhase.PLAYING) return;
          const cp = state.players[state.currentPlayer];
          if (cp?.type !== PlayerType.AI) return;

          console.warn('Israeli Rummy AI stuck detected — forcing recovery');
          if (state.turnAction === TurnAction.REARRANGING) {
            safeDispatch({ type: 'REVERT_REARRANGE' });
            // After revert, draw or pass on next tick
            window.setTimeout(() => {
              const s2 = gameRef.current;
              if (s2 && s2.phase === IsraeliRummyPhase.PLAYING &&
                  s2.players[s2.currentPlayer]?.type === PlayerType.AI &&
                  s2.turnAction === TurnAction.CHOOSE) {
                // Draw if possible, otherwise pass turn
                if (s2.drawPile.length > 0) {
                  safeDispatch({ type: 'DRAW_CARD' });
                } else {
                  safeDispatch({ type: 'PASS_TURN' });
                }
              }
            }, 100);
          } else if (state.turnAction === TurnAction.CHOOSE) {
            // Stuck at CHOOSE — draw if possible, otherwise pass
            if (state.drawPile.length > 0) {
              safeDispatch({ type: 'DRAW_CARD' });
            } else {
              safeDispatch({ type: 'PASS_TURN' });
            }
          }
        }, AI_STUCK_TIMEOUT);
      }
    }

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
      if (aiStuckTimerRef.current) clearTimeout(aiStuckTimerRef.current);
    };
  }, [gameState, safeDispatch]);

  const startGame = useCallback((settings: IsraeliRummyGameSettings) => {
    const saved = loadSavedGame();
    if (saved) {
      gameRef.current = saved;
      setGameState(saved);
      return;
    }
    const initial = createInitialIsraeliRummyState(settings);
    gameRef.current = initial;
    setGameState(initial);
  }, []);

  const drawCard = useCallback(() => {
    safeDispatch({ type: 'DRAW_CARD' });
  }, [safeDispatch]);

  const startRearrange = useCallback(() => {
    safeDispatch({ type: 'START_REARRANGE' });
  }, [safeDispatch]);

  const commitMelds = useCallback(
    (melds: Meld[], hand: Card[]) => {
      safeDispatch({ type: 'COMMIT_MELDS', melds, hand });
    },
    [safeDispatch]
  );

  const revertRearrange = useCallback(() => {
    safeDispatch({ type: 'REVERT_REARRANGE' });
  }, [safeDispatch]);

  const passTurn = useCallback(() => {
    safeDispatch({ type: 'PASS_TURN' });
  }, [safeDispatch]);

  const sortHandBy = useCallback((mode: 'suit' | 'sequence') => {
    setGameState((prev) => {
      if (!prev) return prev;
      const newPlayers = [...prev.players];
      const player = { ...newPlayers[HUMAN_SEAT] };
      player.hand = mode === 'suit' ? sortBySuit(player.hand) : sortBySequence(player.hand);
      newPlayers[HUMAN_SEAT] = player;
      const next = { ...prev, players: newPlayers };
      gameRef.current = next;
      return next;
    });
  }, []);

  const reorderHand = useCallback((newHand: Card[]) => {
    setGameState((prev) => {
      if (!prev) return prev;
      const newPlayers = [...prev.players];
      const player = { ...newPlayers[HUMAN_SEAT] };
      player.hand = newHand;
      newPlayers[HUMAN_SEAT] = player;
      const next = { ...prev, players: newPlayers };
      gameRef.current = next;
      return next;
    });
  }, []);

  const newGame = useCallback(() => {
    clearSavedGame();
    safeDispatch({ type: 'NEW_GAME', seed: randomSeed() });
  }, [safeDispatch]);

  const endGame = useCallback(() => {
    clearSavedGame();
  }, []);

  return {
    gameState,
    startGame,
    newGame,
    endGame,
    drawCard,
    startRearrange,
    commitMelds,
    revertRearrange,
    passTurn,
    sortHandBy,
    reorderHand,
    humanSeat: HUMAN_SEAT,
  };
}
