import { useCallback, useEffect, useRef, useState } from 'react';
import type { Card } from '../../../types/card';
import { PlayerType } from '../../../types/game-common';
import type {
  IsraeliRummyGameState,
  IsraeliRummyGameSettings,
  IsraeliRummyAction,
  Meld,
} from '../types';
import { IsraeliRummyPhase, TurnAction } from '../types';
import { israeliRummyReducer, createInitialIsraeliRummyState } from '../engine/game-reducer';
import { sortBySuit, sortBySequence } from '../engine/validation';
import { getIsraeliRummyAIAction } from '../ai/ai-player';
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

const AI_DELAY = 1000;
const AI_REARRANGE_DELAY = 600;
const AI_STUCK_TIMEOUT = 5000; // If AI hasn't progressed in 5s, force recovery

let nonceCounter = 0;
function generateNonce(): string {
  nonceCounter += 1;
  return `ir_${Date.now().toString(36)}_${nonceCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

interface UseIsraeliRummyMultiplayerReturn {
  gameState: IsraeliRummyGameState | null;
  syncError: string | null;
  retrySync: () => void;
  drawCard: () => void;
  startRearrange: () => void;
  commitMelds: (melds: Meld[], hand: Card[]) => void;
  revertRearrange: () => void;
  passTurn: () => void;
  sortHand: (mode: 'suit' | 'sequence') => void;
  reorderHand: (newHand: Card[]) => void;
  newGame: () => void;
  endGame: () => void;
  humanSeat: number;
}

export function useIsraeliRummyMultiplayer(
  roomId: string,
  humanSeat: number,
  isHost: boolean
): UseIsraeliRummyMultiplayerReturn {
  const [gameState, setGameState] = useState<IsraeliRummyGameState | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const gameRef = useRef<IsraeliRummyGameState | null>(null);
  const seqRef = useRef(0);
  const aiTimerRef = useRef<number | null>(null);
  const aiStuckTimerRef = useRef<number | null>(null);
  const lastAiMoveCountRef = useRef<number>(-1);
  /** Track when AI reverted rearrangement so we don't loop START_REARRANGE → REVERT */
  const aiRevertedForTurnRef = useRef<string>('');

  // Track nonces of actions we applied locally to prevent double-apply from Firebase subscription
  const localNonces = useRef(new Set<string>());

  const applyAction = useCallback((action: IsraeliRummyAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = israeliRummyReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Israeli Rummy multiplayer reducer error:', e, action);
        return prev;
      }
    });
  }, []);

  // Publish an action: apply locally first (optimistic), then push to Firebase with retry.
  const publish = useCallback(
    async (action: IsraeliRummyAction) => {
      seqRef.current += 1;
      const seq = seqRef.current;
      const nonce = generateNonce();

      // 1. Register nonce BEFORE applying so the echo from the subscription is suppressed
      localNonces.current.add(nonce);

      // 2. Apply locally immediately for instant UI feedback
      applyAction(action);

      // 3. Push to Firebase with retry
      try {
        await publishActionWithRetry(roomId, action, seq, nonce);
        setSyncError(null);
      } catch (e) {
        console.error('Failed to publish Israeli Rummy action after retries:', e);
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

        const settings = await getRoomSettings<IsraeliRummyGameSettings>(roomId);
        if (cancelled || !settings) return;

        const actionLog = await getActionLog<IsraeliRummyAction>(roomId);
        if (cancelled) return;

        const state = replayActions(
          createInitialIsraeliRummyState,
          israeliRummyReducer,
          settings,
          actionLog
        );
        const maxSeq =
          actionLog.length > 0 ? actionLog[actionLog.length - 1].seq : 0;
        seqRef.current = maxSeq;
        gameRef.current = state;
        setGameState(state);

        unsubscribe = subscribeToActions<IsraeliRummyAction>(
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
        console.error('Failed to init Israeli Rummy multiplayer game:', e);
        setSyncError('Failed to initialize game. Check your connection.');
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [roomId, applyAction]);

  // Host-only: drive DEAL + all AI seats (and the stuck-recovery watchdog).
  useEffect(() => {
    if (!isHost || !gameState) return;

    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }
    if (aiStuckTimerRef.current) {
      clearTimeout(aiStuckTimerRef.current);
      aiStuckTimerRef.current = null;
    }

    // Auto-deal when phase is DEALING (defense in depth; RoomLobby publishes the
    // initial DEAL at seq 1, but if the log is empty the host bootstraps it).
    if (gameState.phase === IsraeliRummyPhase.DEALING) {
      aiTimerRef.current = window.setTimeout(() => {
        publish({ type: 'DEAL', seed: randomSeed() });
      }, 300);
      return () => {
        clearTimeout(aiTimerRef.current!);
      };
    }

    // Schedule AI for PLAYING phase — only when the current seat is a bot.
    if (gameState.phase === IsraeliRummyPhase.PLAYING) {
      const currentPlayer = gameState.players[gameState.currentPlayer];
      if (currentPlayer?.type === PlayerType.AI) {
        const delay =
          gameState.turnAction === TurnAction.CHOOSE ? AI_DELAY : AI_REARRANGE_DELAY;

        aiTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          // Track moveCount before action to detect if reducer accepted it
          lastAiMoveCountRef.current = state.moveCount;
          let action = getIsraeliRummyAIAction(state, state.currentPlayer);

          // Break the START_REARRANGE → REVERT_REARRANGE cycle:
          // If AI wants to rearrange but already tried+reverted this turn, skip to draw/pass.
          const turnKey = `${state.currentPlayer}_${state.moveCount}`;
          if (
            action?.type === 'START_REARRANGE' &&
            aiRevertedForTurnRef.current === turnKey
          ) {
            action =
              state.drawPile.length > 0
                ? { type: 'DRAW_CARD' }
                : { type: 'PASS_TURN' };
          }
          // Track if AI reverted during rearrangement
          if (action?.type === 'REVERT_REARRANGE') {
            aiRevertedForTurnRef.current = turnKey;
          }
          // Reset tracking when turn advances
          if (
            action?.type === 'DRAW_CARD' ||
            action?.type === 'PASS_TURN' ||
            action?.type === 'COMMIT_MELDS'
          ) {
            aiRevertedForTurnRef.current = '';
          }

          if (action) publish(action);
        }, delay);

        // Watchdog: if AI is stuck (state doesn't progress), force recovery.
        aiStuckTimerRef.current = window.setTimeout(() => {
          const state = gameRef.current;
          if (!state) return;
          if (state.phase !== IsraeliRummyPhase.PLAYING) return;
          const cp = state.players[state.currentPlayer];
          if (cp?.type !== PlayerType.AI) return;

          console.warn('Israeli Rummy AI stuck detected — forcing recovery');
          if (state.turnAction === TurnAction.REARRANGING) {
            publish({ type: 'REVERT_REARRANGE' });
            // After revert, draw or pass on next tick
            window.setTimeout(() => {
              const s2 = gameRef.current;
              if (
                s2 &&
                s2.phase === IsraeliRummyPhase.PLAYING &&
                s2.players[s2.currentPlayer]?.type === PlayerType.AI &&
                s2.turnAction === TurnAction.CHOOSE
              ) {
                if (s2.drawPile.length > 0) {
                  publish({ type: 'DRAW_CARD' });
                } else {
                  publish({ type: 'PASS_TURN' });
                }
              }
            }, 100);
          } else if (state.turnAction === TurnAction.CHOOSE) {
            // Stuck at CHOOSE — draw if possible, otherwise pass
            if (state.drawPile.length > 0) {
              publish({ type: 'DRAW_CARD' });
            } else {
              publish({ type: 'PASS_TURN' });
            }
          }
        }, AI_STUCK_TIMEOUT);
      }
    }

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
      if (aiStuckTimerRef.current) clearTimeout(aiStuckTimerRef.current);
    };
  }, [gameState, isHost, publish]);

  // ─── Human action callbacks (gated on it being our turn — defense in depth) ──

  const drawCard = useCallback(() => {
    if (gameRef.current?.currentPlayer !== humanSeat) return;
    publish({ type: 'DRAW_CARD' });
  }, [publish, humanSeat]);

  const startRearrange = useCallback(() => {
    if (gameRef.current?.currentPlayer !== humanSeat) return;
    publish({ type: 'START_REARRANGE' });
  }, [publish, humanSeat]);

  const commitMelds = useCallback(
    (melds: Meld[], hand: Card[]) => {
      if (gameRef.current?.currentPlayer !== humanSeat) return;
      publish({ type: 'COMMIT_MELDS', melds, hand });
    },
    [publish, humanSeat]
  );

  const revertRearrange = useCallback(() => {
    if (gameRef.current?.currentPlayer !== humanSeat) return;
    publish({ type: 'REVERT_REARRANGE' });
  }, [publish, humanSeat]);

  const passTurn = useCallback(() => {
    if (gameRef.current?.currentPlayer !== humanSeat) return;
    publish({ type: 'PASS_TURN' });
  }, [publish, humanSeat]);

  // sortHand / reorderHand are LOCAL-ONLY and cosmetic — they only reorder the
  // local seat's hand, which no other client renders. Never published.
  const sortHand = useCallback(
    (mode: 'suit' | 'sequence') => {
      setGameState((prev) => {
        if (!prev) return prev;
        const newPlayers = [...prev.players];
        const player = { ...newPlayers[humanSeat] };
        player.hand = mode === 'suit' ? sortBySuit(player.hand) : sortBySequence(player.hand);
        newPlayers[humanSeat] = player;
        const next = { ...prev, players: newPlayers };
        gameRef.current = next;
        return next;
      });
    },
    [humanSeat]
  );

  const reorderHand = useCallback(
    (newHand: Card[]) => {
      setGameState((prev) => {
        if (!prev) return prev;
        const newPlayers = [...prev.players];
        const player = { ...newPlayers[humanSeat] };
        player.hand = newHand;
        newPlayers[humanSeat] = player;
        const next = { ...prev, players: newPlayers };
        gameRef.current = next;
        return next;
      });
    },
    [humanSeat]
  );

  const newGame = useCallback(() => {
    publish({ type: 'NEW_GAME', seed: randomSeed() });
  }, [publish]);

  const endGame = useCallback(() => {
    // No-op for multiplayer: exiting is handled by the screen (onBack).
  }, []);

  return {
    gameState,
    syncError,
    retrySync,
    drawCard,
    startRearrange,
    commitMelds,
    revertRearrange,
    passTurn,
    sortHand,
    reorderHand,
    newGame,
    endGame,
    humanSeat,
  };
}
