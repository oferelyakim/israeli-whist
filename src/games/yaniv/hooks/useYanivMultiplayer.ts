import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardKey } from '../../../types/card';
import { PlayerType } from '../../../types/game-common';
import type { YanivGameState, YanivGameSettings, YanivAction } from '../types';
import { YanivPhase } from '../types';
import { yanivReducer, createInitialYanivState } from '../engine/game-reducer';
import { getYanivAIAction } from '../ai/ai-player';
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

let nonceCounter = 0;
function generateNonce(): string {
  nonceCounter += 1;
  return `y_${Date.now().toString(36)}_${nonceCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

interface UseYanivMultiplayerReturn {
  gameState: YanivGameState | null;
  syncError: string | null;
  retrySync: () => void;
  startGame: () => void;
  discardAndDraw: (discardCards: CardKey[], drawSource: 'pile' | 'discard', drawCardKey?: CardKey) => void;
  declareYaniv: () => void;
  quickStick: (cardKey: CardKey) => void;
  skipQuickStick: () => void;
  nextRound: () => void;
  endGame: () => void;
  humanSeat: number;
}

export function useYanivMultiplayer(
  roomId: string,
  humanSeat: number,
  isHost: boolean
): UseYanivMultiplayerReturn {
  const [gameState, setGameState] = useState<YanivGameState | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const gameRef = useRef<YanivGameState | null>(null);
  const seqRef = useRef(0);
  const aiTimerRef = useRef<number | null>(null);

  // Track nonces of actions we applied locally to prevent double-apply from Firebase subscription
  const localNonces = useRef(new Set<string>());

  const applyAction = useCallback((action: YanivAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = yanivReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Yaniv multiplayer reducer error:', e, action);
        return prev;
      }
    });
  }, []);

  // Publish an action: apply locally first, then push to Firebase with retry.
  const publish = useCallback(
    async (action: YanivAction) => {
      seqRef.current += 1;
      const seq = seqRef.current;
      const nonce = generateNonce();

      // 1. Register nonce BEFORE applying
      localNonces.current.add(nonce);

      // 2. Apply locally immediately
      applyAction(action);

      // 3. Push to Firebase with retry
      try {
        await publishActionWithRetry(roomId, action, seq, nonce);
        setSyncError(null);
      } catch (e) {
        console.error('Failed to publish Yaniv action after retries:', e);
        setSyncError(
          e instanceof Error && e.message.includes('PERMISSION_DENIED')
            ? 'Firebase permission denied. Check database rules (auth != null).'
            : 'Failed to sync action. Check your connection.'
        );
      }
    },
    [roomId, applyAction]
  );

  const retrySync = useCallback(() => {
    setSyncError(null);
    window.location.reload();
  }, []);

  // Initialize: fetch action log, replay, subscribe for new actions
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        // Re-mark connected (handles reconnection after page refresh)
        const uid = getUid();
        if (uid) {
          await markConnected(roomId, uid).catch(() => {});
        }

        const settings = await getRoomSettings<YanivGameSettings>(roomId);
        if (cancelled || !settings) return;

        const actionLog = await getActionLog<YanivAction>(roomId);
        if (cancelled) return;

        const state = replayActions(
          createInitialYanivState,
          yanivReducer,
          settings,
          actionLog
        );
        const maxSeq =
          actionLog.length > 0 ? actionLog[actionLog.length - 1].seq : 0;
        seqRef.current = maxSeq;
        gameRef.current = state;
        setGameState(state);

        unsubscribe = subscribeToActions<YanivAction>(
          roomId,
          maxSeq + 1,
          (synced) => {
            if (cancelled) return;

            // Skip actions we already applied locally (via publish())
            if (synced.nonce && localNonces.current.has(synced.nonce)) {
              localNonces.current.delete(synced.nonce);
              seqRef.current = Math.max(seqRef.current, synced.seq);
              return;
            }

            seqRef.current = Math.max(seqRef.current, synced.seq);
            applyAction(synced.action);
          }
        );
      } catch (e) {
        console.error('Failed to init Yaniv multiplayer game:', e);
        setSyncError('Failed to initialize game. Check your connection.');
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [roomId, applyAction]);

  // Host-only: schedule AI actions
  useEffect(() => {
    if (!isHost || !gameState) return;
    const round = gameState.currentRound;

    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    // Auto-deal when phase is DEALING
    if (round.phase === YanivPhase.DEALING) {
      aiTimerRef.current = window.setTimeout(() => {
        publish({ type: 'DEAL', seed: randomSeed() });
      }, 300);
      return () => {
        clearTimeout(aiTimerRef.current!);
      };
    }

    // Schedule AI for PLAYER_TURN and QUICK_STICK
    const scheduleAI = () => {
      const state = gameRef.current;
      if (!state) return;
      const r = state.currentRound;

      if (
        r.phase === YanivPhase.PLAYER_TURN ||
        r.phase === YanivPhase.QUICK_STICK
      ) {
        const currentPlayer = r.players[r.currentPlayer];
        if (currentPlayer?.type === PlayerType.AI && !currentPlayer.eliminated) {
          const action = getYanivAIAction(state, r.currentPlayer);
          if (action) publish(action);
        }
      }
    };

    if (
      round.phase === YanivPhase.PLAYER_TURN ||
      round.phase === YanivPhase.QUICK_STICK
    ) {
      const currentPlayer = round.players[round.currentPlayer];
      if (currentPlayer?.type === PlayerType.AI && !currentPlayer.eliminated) {
        aiTimerRef.current = window.setTimeout(scheduleAI, AI_DELAY);
      }
    }

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [gameState, isHost, publish]);

  // Human action callbacks — publish to Firebase
  const discardAndDraw = useCallback(
    (discardCards: CardKey[], drawSource: 'pile' | 'discard', drawCardKey?: CardKey) => {
      publish({
        type: 'DISCARD_AND_DRAW',
        seat: humanSeat,
        discardCards,
        drawSource,
        drawCardKey,
      });
    },
    [publish, humanSeat]
  );

  const declareYaniv = useCallback(() => {
    publish({ type: 'DECLARE_YANIV', seat: humanSeat });
  }, [publish, humanSeat]);

  const quickStick = useCallback(
    (cardKey: CardKey) => {
      publish({ type: 'QUICK_STICK', seat: humanSeat, discardCard: cardKey });
    },
    [publish, humanSeat]
  );

  const skipQuickStick = useCallback(() => {
    publish({ type: 'SKIP_QUICK_STICK', seat: humanSeat });
  }, [publish, humanSeat]);

  const nextRound = useCallback(() => {
    publish({ type: 'NEXT_ROUND', seed: randomSeed() });
  }, [publish]);

  const endGame = useCallback(() => {
    publish({ type: 'END_GAME' });
  }, [publish]);

  return {
    gameState,
    syncError,
    retrySync,
    startGame: useCallback(() => {}, []),
    discardAndDraw,
    declareYaniv,
    quickStick,
    skipQuickStick,
    nextRound,
    endGame,
    humanSeat,
  };
}
