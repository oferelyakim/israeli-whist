import { useCallback, useEffect, useRef, useState } from 'react';
import type { CardKey, StandardSuit } from '../types/card';
import type { GameState, GameAction, PlayerSeat } from '../types/game';
import { GamePhase, PlayerType } from '../types/game';
import { gameReducer } from '../engine/game-reducer';
import { getAIAction } from '../ai/ai-player';
import { randomSeed } from '../utils/random';
import {
  publishActionWithRetry,
  subscribeToActions,
  getActionLog,
  getRoomSettings,
  replayActions,
} from '../multiplayer/game-sync';
import { markConnected } from '../multiplayer/room-manager';
import { getUid } from '../multiplayer/firebase-config';
import { createInitialGameState } from '../engine/game-reducer';

const AI_DELAY = 700;
const TRICK_VIEW_DELAY = 1200;

let nonceCounter = 0;
function generateNonce(): string {
  nonceCounter += 1;
  return `${Date.now().toString(36)}_${nonceCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function useMultiplayerGame(
  roomId: string,
  humanSeat: PlayerSeat,
  isHost: boolean
) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const gameRef = useRef<GameState | null>(null);
  const seqRef = useRef(0);
  const aiTimerRef = useRef<number | null>(null);

  // Track nonces of actions we applied locally to prevent double-apply from Firebase subscription
  const localNonces = useRef(new Set<string>());

  const applyAction = useCallback((action: GameAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = gameReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Multiplayer reducer error:', e, action);
        return prev;
      }
    });
  }, []);

  // Publish an action: apply locally first, then push to Firebase with retry.
  // Uses a nonce to prevent the Firebase subscription from double-applying.
  const publish = useCallback(
    async (action: GameAction) => {
      seqRef.current += 1;
      const seq = seqRef.current;
      const nonce = generateNonce();

      // 1. Register nonce BEFORE applying (subscription might fire from optimistic write)
      localNonces.current.add(nonce);

      // 2. Apply locally immediately — host state is always up to date
      applyAction(action);

      // 3. Push to Firebase with retry (so remote clients receive the action)
      try {
        await publishActionWithRetry(roomId, action, seq, nonce);
        setSyncError(null);
      } catch (e) {
        console.error('Failed to publish action after retries:', e);
        setSyncError(
          e instanceof Error && e.message.includes('PERMISSION_DENIED')
            ? 'Firebase permission denied. Check database rules (auth != null).'
            : 'Failed to sync action. Check your connection.'
        );
        // Local state is correct; remote clients won't see this action.
        // The retry button in the UI will allow re-attempting.
      }
    },
    [roomId, applyAction]
  );

  const retrySync = useCallback(async () => {
    // Clear error and try to reconnect by refreshing game state from Firebase
    setSyncError(null);
    // Force re-initialize by reloading page (simplest recovery)
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

        const settings = await getRoomSettings(roomId);
        if (cancelled || !settings) return;

        const actionLog = await getActionLog(roomId);
        if (cancelled) return;

        const state = replayActions(createInitialGameState, gameReducer, settings, actionLog);
        const maxSeq =
          actionLog.length > 0 ? actionLog[actionLog.length - 1].seq : 0;
        seqRef.current = maxSeq;
        gameRef.current = state;
        setGameState(state);

        unsubscribe = subscribeToActions(roomId, maxSeq + 1, (synced) => {
          if (cancelled) return;

          // Skip actions we already applied locally (via publish())
          if (synced.nonce && localNonces.current.has(synced.nonce)) {
            localNonces.current.delete(synced.nonce);
            seqRef.current = Math.max(seqRef.current, synced.seq);
            return;
          }

          seqRef.current = Math.max(seqRef.current, synced.seq);
          applyAction(synced.action);
        });
      } catch (e) {
        console.error('Failed to init multiplayer game:', e);
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [roomId, applyAction]);

  // Host-only: schedule AI actions and auto-collect tricks
  useEffect(() => {
    if (!isHost || !gameState) return;
    const round = gameState.currentRound;

    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    // Auto-deal when phase is DEALING (e.g. re-deal after 3 failed exchanges)
    if (round.phase === GamePhase.DEALING) {
      aiTimerRef.current = window.setTimeout(() => {
        publish({ type: 'DEAL', seed: randomSeed() });
      }, 300);
      return () => {
        clearTimeout(aiTimerRef.current!);
      };
    }

    if (round.phase === GamePhase.TRICK_COMPLETE) {
      aiTimerRef.current = window.setTimeout(() => {
        publish({ type: 'COLLECT_TRICK' });
      }, TRICK_VIEW_DELAY);
      return () => {
        clearTimeout(aiTimerRef.current!);
      };
    }

    const scheduleAI = () => {
      const state = gameRef.current;
      if (!state) return;
      const r = state.currentRound;

      if (r.phase === GamePhase.EXCHANGING && r.exchange) {
        for (let seat = 0; seat < 4; seat++) {
          const player = r.players[seat];
          if (
            player.type === PlayerType.AI &&
            r.exchange.discards[seat] === null
          ) {
            const action = getAIAction(state, seat as PlayerSeat);
            if (action) {
              publish(action);
              return;
            }
          }
        }
        return;
      }

      if (r.phase === GamePhase.TRUMP_SELECTION && r.trumpCaller !== null) {
        if (r.players[r.trumpCaller].type === PlayerType.AI) {
          const action = getAIAction(state, r.trumpCaller);
          if (action) publish(action);
        }
        return;
      }

      if (r.phase === GamePhase.RAISE && r.trumpCaller !== null) {
        if (r.players[r.trumpCaller].type === PlayerType.AI) {
          const action = getAIAction(state, r.trumpCaller);
          if (action) publish(action);
        }
        return;
      }

      if (r.phase === GamePhase.DECLARING) {
        if (r.players[r.currentPlayer]?.type === PlayerType.AI) {
          const action = getAIAction(state, r.currentPlayer);
          if (action) publish(action);
        }
        return;
      }

      if (r.phase === GamePhase.BIDDING || r.phase === GamePhase.PLAYING) {
        if (r.players[r.currentPlayer]?.type === PlayerType.AI) {
          const action = getAIAction(state, r.currentPlayer);
          if (action) publish(action);
        }
      }
    };

    const aiPhases = [
      GamePhase.BIDDING,
      GamePhase.EXCHANGING,
      GamePhase.TRUMP_SELECTION,
      GamePhase.RAISE,
      GamePhase.DECLARING,
      GamePhase.PLAYING,
    ];

    if (aiPhases.includes(round.phase)) {
      let needsAI = false;

      if (round.phase === GamePhase.EXCHANGING) {
        needsAI = round.players.some(
          (p, i) =>
            p.type === PlayerType.AI && round.exchange?.discards[i] === null
        );
      } else if (
        round.phase === GamePhase.TRUMP_SELECTION ||
        round.phase === GamePhase.RAISE
      ) {
        needsAI =
          round.trumpCaller !== null &&
          round.players[round.trumpCaller].type === PlayerType.AI;
      } else if (round.phase === GamePhase.DECLARING) {
        needsAI = round.players[round.currentPlayer]?.type === PlayerType.AI;
      } else {
        needsAI = round.players[round.currentPlayer]?.type === PlayerType.AI;
      }

      if (needsAI) {
        aiTimerRef.current = window.setTimeout(scheduleAI, AI_DELAY);
      }
    }

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [gameState, isHost, publish]);

  // Human action callbacks — publish to Firebase
  const bid = useCallback(
    (amount: number, suit?: StandardSuit) => {
      publish({ type: 'BID', seat: humanSeat, amount, suit });
    },
    [publish, humanSeat]
  );

  const selectDiscards = useCallback(
    (cards: CardKey[]) => {
      publish({ type: 'SELECT_DISCARDS', seat: humanSeat, cards });
    },
    [publish, humanSeat]
  );

  const chooseTrump = useCallback(
    (suit: StandardSuit) => {
      publish({ type: 'CHOOSE_TRUMP', seat: humanSeat, suit });
    },
    [publish, humanSeat]
  );

  const raiseBid = useCallback(
    (amount: number) => {
      publish({ type: 'RAISE_BID', seat: humanSeat, amount });
    },
    [publish, humanSeat]
  );

  const declareBid = useCallback(
    (amount: number) => {
      publish({ type: 'DECLARE', seat: humanSeat, amount });
    },
    [publish, humanSeat]
  );

  const playCard = useCallback(
    (cardKey: CardKey) => {
      publish({ type: 'PLAY_CARD', seat: humanSeat, card: cardKey });
    },
    [publish, humanSeat]
  );

  const collectTrick = useCallback(() => {
    if (isHost) publish({ type: 'COLLECT_TRICK' });
  }, [isHost, publish]);

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
    bid,
    selectDiscards,
    chooseTrump,
    raiseBid,
    declare: declareBid,
    playCard,
    collectTrick,
    nextRound,
    endGame,
    humanSeat,
  };
}
