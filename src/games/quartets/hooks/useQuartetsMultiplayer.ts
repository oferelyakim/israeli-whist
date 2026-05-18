import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayerType } from '../../../types/game-common';
import type { QuartetCategory, QuartetsGameState, QuartetsGameSettings, QuartetsAction } from '../types';
import { QuartetColor, QuartetsPhase } from '../types';
import { quartetsReducer, createInitialQuartetsState } from '../engine/game-reducer';
import { getQuartetsAIAction, getQuartetsAIColorChoice } from '../ai/ai-player';
import { randomSeed } from '../../../utils/random';
import {
  publishActionWithRetry,
  subscribeToActions,
  getActionLog,
  getRoomSettings,
  replayActions,
} from '../../../multiplayer/game-sync';
import { markConnected } from '../../../multiplayer/room-manager';
import { getUid } from '../../../multiplayer/firebase-config';

const AI_DELAY = 700;
const AI_AI_DELAY = 2500;
const AFTER_RESPONSE_DELAY = 1200;

let nonceCounter = 0;
function generateNonce(): string {
  nonceCounter += 1;
  return `q_${Date.now().toString(36)}_${nonceCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

interface UseQuartetsMultiplayerReturn {
  gameState: QuartetsGameState | null;
  syncError: string | null;
  retrySync: () => void;
  askForCard: (targetSeat: number, category: QuartetCategory) => void;
  chooseColor: (color: QuartetColor) => void;
  acknowledgeResult: () => void;
  endGame: () => void;
  humanSeat: number;
  resolveRequest: () => void;
}

export function useQuartetsMultiplayer(
  roomId: string,
  humanSeat: number,
  isHost: boolean,
): UseQuartetsMultiplayerReturn {
  const [gameState, setGameState] = useState<QuartetsGameState | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const gameRef = useRef<QuartetsGameState | null>(null);
  const seqRef = useRef(0);
  const aiTimerRef = useRef<number | null>(null);
  const localNonces = useRef(new Set<string>());

  const applyAction = useCallback((action: QuartetsAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = quartetsReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Quartets multiplayer reducer error:', e, action);
        return prev;
      }
    });
  }, []);

  const publish = useCallback(
    async (action: QuartetsAction) => {
      seqRef.current += 1;
      const seq = seqRef.current;
      const nonce = generateNonce();

      localNonces.current.add(nonce);
      applyAction(action);

      try {
        await publishActionWithRetry(roomId, action, seq, nonce);
        setSyncError(null);
      } catch (e) {
        console.error('Failed to publish Quartets action after retries:', e);
        setSyncError(
          e instanceof Error && e.message.includes('PERMISSION_DENIED')
            ? 'Firebase permission denied. Check database rules.'
            : 'Failed to sync action. Check your connection.',
        );
      }
    },
    [roomId, applyAction],
  );

  const retrySync = useCallback(() => {
    setSyncError(null);
    window.location.reload();
  }, []);

  // Initialize: fetch action log, replay, subscribe
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const uid = getUid();
        if (uid) {
          await markConnected(roomId, uid).catch(() => {});
        }

        const settings = await getRoomSettings<QuartetsGameSettings>(roomId);
        if (cancelled || !settings) return;

        const actionLog = await getActionLog<QuartetsAction>(roomId);
        if (cancelled) return;

        const state = replayActions(
          createInitialQuartetsState,
          quartetsReducer,
          settings,
          actionLog,
        );
        const maxSeq =
          actionLog.length > 0 ? actionLog[actionLog.length - 1].seq : 0;
        seqRef.current = maxSeq;
        gameRef.current = state;
        setGameState(state);

        unsubscribe = subscribeToActions<QuartetsAction>(
          roomId,
          maxSeq + 1,
          (synced) => {
            if (cancelled) return;

            if (synced.nonce && localNonces.current.has(synced.nonce)) {
              localNonces.current.delete(synced.nonce);
              seqRef.current = Math.max(seqRef.current, synced.seq);
              return;
            }

            seqRef.current = Math.max(seqRef.current, synced.seq);
            applyAction(synced.action);
          },
        );
      } catch (e) {
        console.error('Failed to init Quartets multiplayer game:', e);
        setSyncError('Failed to initialize game. Check your connection.');
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [roomId, applyAction]);

  // Host-only: AI scheduling + auto-acknowledge
  useEffect(() => {
    if (!isHost || !gameState) return;
    const round = gameState.round;

    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    // Auto-deal
    if (round.phase === QuartetsPhase.DEALING) {
      aiTimerRef.current = window.setTimeout(() => {
        publish({ type: 'DEAL', seed: randomSeed() });
      }, 300);
      return () => { if (aiTimerRef.current) clearTimeout(aiTimerRef.current); };
    }

    // AI turn
    if (round.phase === QuartetsPhase.PLAYER_TURN) {
      const currentPlayer = round.players[round.currentPlayer];
      if (currentPlayer?.type === PlayerType.AI) {
        aiTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          const action = getQuartetsAIAction(state, state.round.currentPlayer);
          if (action) {
            publish(action);
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
          const bothAI = round.players[req.askerSeat].type === PlayerType.AI;
          aiTimerRef.current = window.setTimeout(() => {
            publish({ type: 'RESOLVE_REQUEST', seat: req.targetSeat });
          }, bothAI ? AI_AI_DELAY : AI_DELAY);
        }
        // If target is HUMAN/REMOTE, that player's client will publish RESOLVE_REQUEST
      }
    }

    // Choosing color: auto-choose if AI is the asker
    if (round.phase === QuartetsPhase.CHOOSING_COLOR) {
      const req = round.pendingRequest;
      if (req) {
        const askerPlayer = round.players[req.askerSeat];
        if (askerPlayer.type === PlayerType.AI) {
          const bothAI = round.players[req.targetSeat].type === PlayerType.AI;
          aiTimerRef.current = window.setTimeout(() => {
            const state = gameRef.current;
            if (!state) return;
            const color = getQuartetsAIColorChoice(state, req.askerSeat);
            if (color) {
              publish({ type: 'CHOOSE_COLOR', seat: req.askerSeat, color });
            }
          }, bothAI ? AI_AI_DELAY : AI_DELAY);
        }
        // If asker is HUMAN/REMOTE, that player's client will publish CHOOSE_COLOR
      }
    }

    // Auto-acknowledge turn results
    if (round.phase === QuartetsPhase.TURN_RESULT) {
      const lastAsk = round.lastAsk;
      const humanIsAsker = lastAsk?.askerSeat === humanSeat;
      const humanIsTarget = lastAsk?.targetSeat === humanSeat;

      if (!humanIsAsker && !humanIsTarget) {
        // Pure AI turn — auto-acknowledge after longer delay so human can read
        aiTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          publish({
            type: 'ACKNOWLEDGE_RESULT',
            seat: state.round.currentPlayer,
          });
        }, AI_AI_DELAY);
      } else if (humanIsTarget && !humanIsAsker) {
        // Human was target — they already interacted via the response dialog
        aiTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          publish({
            type: 'ACKNOWLEDGE_RESULT',
            seat: state.round.currentPlayer,
          });
        }, AFTER_RESPONSE_DELAY);
      }
      // else: human was asker — wait for click on result toast
    }

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [gameState, isHost, publish, humanSeat]);

  // Human action callbacks
  const askForCard = useCallback(
    (targetSeat: number, category: QuartetCategory) => {
      publish({
        type: 'ASK_FOR_CARD',
        seat: humanSeat,
        targetSeat,
        category,
      });
    },
    [publish, humanSeat],
  );

  const chooseColor = useCallback(
    (color: QuartetColor) => {
      publish({ type: 'CHOOSE_COLOR', seat: humanSeat, color });
    },
    [publish, humanSeat],
  );

  const acknowledgeResult = useCallback(() => {
    publish({ type: 'ACKNOWLEDGE_RESULT', seat: humanSeat });
  }, [publish, humanSeat]);

  const resolveRequest = useCallback(() => {
    publish({ type: 'RESOLVE_REQUEST', seat: humanSeat });
  }, [publish, humanSeat]);

  const endGame = useCallback(() => {
    publish({ type: 'END_GAME' });
  }, [publish]);

  return {
    gameState,
    syncError,
    retrySync,
    askForCard,
    chooseColor,
    acknowledgeResult,
    endGame,
    humanSeat,
    resolveRequest,
  };
}
