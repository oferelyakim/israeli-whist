import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayerType } from '../../../types/game-common';
import type { QuartetCategory, QuartetsGameState, QuartetsGameSettings, QuartetsAction } from '../types';
import { QuartetColor, QuartetsPhase } from '../types';
import { quartetsReducer, createInitialQuartetsState } from '../engine/game-reducer';
import { getQuartetsAIAction, getQuartetsAIColorChoice } from '../ai/ai-player';
import { randomSeed } from '../../../utils/random';

interface UseQuartetsGameReturn {
  gameState: QuartetsGameState | null;
  startGame: (settings: QuartetsGameSettings) => void;
  askForCard: (targetSeat: number, category: QuartetCategory) => void;
  chooseColor: (color: QuartetColor) => void;
  acknowledgeResult: () => void;
  endGame: () => void;
  newGame: () => void;
  humanSeat: number;
  resolveRequest: () => void;
}

const HUMAN_SEAT = 0;
const AI_DELAY = 700;
const AI_AI_DELAY = 2500;
const AFTER_RESPONSE_DELAY = 1200;

export function useQuartetsGame(): UseQuartetsGameReturn {
  const [gameState, setGameState] = useState<QuartetsGameState | null>(null);
  const gameRef = useRef<QuartetsGameState | null>(null);
  const aiTimerRef = useRef<number | null>(null);

  const safeDispatch = useCallback((action: QuartetsAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = quartetsReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Quartets reducer error:', e);
        return prev;
      }
    });
  }, []);

  // AI scheduling effect
  useEffect(() => {
    if (!gameState) return;
    const round = gameState.round;

    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    // Auto-deal when phase is DEALING
    if (round.phase === QuartetsPhase.DEALING) {
      aiTimerRef.current = window.setTimeout(() => {
        safeDispatch({ type: 'DEAL', seed: randomSeed() });
      }, 300);
      return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
    }

    // AI turn: schedule action
    if (round.phase === QuartetsPhase.PLAYER_TURN) {
      const currentPlayer = round.players[round.currentPlayer];
      if (currentPlayer?.type === PlayerType.AI) {
        aiTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          const action = getQuartetsAIAction(state, state.round.currentPlayer);
          if (action) {
            safeDispatch(action);
          }
        }, AI_DELAY);
      }
    }

    // Awaiting response: auto-resolve if target is AI
    if (round.phase === QuartetsPhase.AWAITING_RESPONSE) {
      const req = round.pendingRequest;
      if (req) {
        const targetPlayer = round.players[req.targetSeat];
        if (targetPlayer.type === PlayerType.AI) {
          const bothAI = req.askerSeat !== HUMAN_SEAT;
          aiTimerRef.current = window.setTimeout(() => {
            safeDispatch({ type: 'RESOLVE_REQUEST', seat: req.targetSeat });
          }, bothAI ? AI_AI_DELAY : AI_DELAY);
        }
        // If target is HUMAN, wait for user click
      }
    }

    // Choosing color: auto-choose if AI is the asker
    if (round.phase === QuartetsPhase.CHOOSING_COLOR) {
      const req = round.pendingRequest;
      if (req && req.askerSeat !== HUMAN_SEAT) {
        const bothAI = round.players[req.targetSeat].type === PlayerType.AI;
        aiTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          const color = getQuartetsAIColorChoice(state, req.askerSeat);
          if (color) {
            safeDispatch({ type: 'CHOOSE_COLOR', seat: req.askerSeat, color });
          }
        }, bothAI ? AI_AI_DELAY : AI_DELAY);
      }
      // If human is asker — wait for UI click
    }

    // Turn result: auto-acknowledge for pure AI, or when human was just the target
    if (round.phase === QuartetsPhase.TURN_RESULT) {
      const lastAsk = round.lastAsk;
      const humanIsAsker = lastAsk?.askerSeat === HUMAN_SEAT;
      const humanIsTarget = lastAsk?.targetSeat === HUMAN_SEAT;

      if (!humanIsAsker && !humanIsTarget) {
        // Pure AI turn — auto-acknowledge after longer delay so human can read
        aiTimerRef.current = window.setTimeout(() => {
          safeDispatch({ type: 'ACKNOWLEDGE_RESULT', seat: round.currentPlayer });
        }, AI_AI_DELAY);
      } else if (humanIsTarget && !humanIsAsker) {
        // Human was target — they already interacted via the "being asked" dialog
        aiTimerRef.current = window.setTimeout(() => {
          safeDispatch({ type: 'ACKNOWLEDGE_RESULT', seat: round.currentPlayer });
        }, AFTER_RESPONSE_DELAY);
      }
      // else: human was asker — wait for click on result toast
    }

    return () => {
      if (aiTimerRef.current) {
        clearTimeout(aiTimerRef.current);
      }
    };
  }, [gameState, safeDispatch]);

  const settingsRef = useRef<QuartetsGameSettings | null>(null);

  const startGame = useCallback((settings: QuartetsGameSettings) => {
    settingsRef.current = settings;
    const initial = createInitialQuartetsState(settings);
    const dealt = quartetsReducer(initial, { type: 'DEAL', seed: randomSeed() });
    gameRef.current = dealt;
    setGameState(dealt);
  }, []);

  const askForCard = useCallback(
    (targetSeat: number, category: QuartetCategory) => {
      safeDispatch({
        type: 'ASK_FOR_CARD',
        seat: HUMAN_SEAT,
        targetSeat,
        category,
      });
    },
    [safeDispatch],
  );

  const chooseColor = useCallback(
    (color: QuartetColor) => {
      safeDispatch({ type: 'CHOOSE_COLOR', seat: HUMAN_SEAT, color });
    },
    [safeDispatch],
  );

  const acknowledgeResult = useCallback(() => {
    safeDispatch({ type: 'ACKNOWLEDGE_RESULT', seat: HUMAN_SEAT });
  }, [safeDispatch]);

  const resolveRequest = useCallback(() => {
    safeDispatch({ type: 'RESOLVE_REQUEST', seat: HUMAN_SEAT });
  }, [safeDispatch]);

  const endGame = useCallback(() => {
    safeDispatch({ type: 'END_GAME' });
  }, [safeDispatch]);

  const newGame = useCallback(() => {
    if (!settingsRef.current) return;
    const initial = createInitialQuartetsState(settingsRef.current);
    const dealt = quartetsReducer(initial, { type: 'DEAL', seed: randomSeed() });
    gameRef.current = dealt;
    setGameState(dealt);
  }, []);

  return {
    gameState,
    startGame,
    askForCard,
    chooseColor,
    acknowledgeResult,
    endGame,
    newGame,
    humanSeat: HUMAN_SEAT,
    resolveRequest,
  };
}
