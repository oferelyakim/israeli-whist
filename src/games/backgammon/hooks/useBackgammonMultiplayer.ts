import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayerType } from '../../../types/game-common';
import type { BackgammonAction, BackgammonGameState, BackgammonSettings, BgColor, BgMove } from '../types';
import { createInitialBgState, backgammonReducer } from '../engine/game-reducer';
import { getLegalMoves } from '../engine/board';
import { getBgAIAction } from '../ai/ai-player';
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
  return `bg_${Date.now().toString(36)}_${nonceCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export interface UseBackgammonMultiplayerReturn {
  gameState: BackgammonGameState | null;
  syncError: string | null;
  retrySync: () => void;
  legalMoves: BgMove[];
  selectedFrom: number | 'bar' | null;
  rollDice: () => void;
  selectChecker: (from: number | 'bar') => void;
  moveChecker: (to: number) => void;
  newGame: () => void;
  humanColor: BgColor;
}

export function useBackgammonMultiplayer(
  roomId: string,
  humanSeat: number,
  isHost: boolean
): UseBackgammonMultiplayerReturn {
  // seat 0 = white, seat 1 = black
  const humanColor: BgColor = humanSeat === 0 ? 'white' : 'black';

  const [gameState, setGameState] = useState<BackgammonGameState | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [selectedFrom, setSelectedFrom] = useState<number | 'bar' | null>(null);
  const gameRef = useRef<BackgammonGameState | null>(null);
  const seqRef = useRef(0);
  const aiTimerRef = useRef<number | null>(null);
  const localNonces = useRef(new Set<string>());

  const applyAction = useCallback((action: BackgammonAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = backgammonReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Backgammon multiplayer reducer error:', e, action);
        return prev;
      }
    });
  }, []);

  const publish = useCallback(async (action: BackgammonAction) => {
    seqRef.current += 1;
    const seq = seqRef.current;
    const nonce = generateNonce();

    localNonces.current.add(nonce);
    applyAction(action);

    try {
      await publishActionWithRetry(roomId, action, seq, nonce);
      setSyncError(null);
    } catch (e) {
      console.error('Failed to publish Backgammon action after retries:', e);
      setSyncError(
        e instanceof Error && e.message.includes('PERMISSION_DENIED')
          ? 'Firebase permission denied. Check database rules (auth != null).'
          : 'Failed to sync action. Check your connection.'
      );
    }
  }, [roomId, applyAction]);

  const retrySync = useCallback(() => {
    setSyncError(null);
    window.location.reload();
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const uid = getUid();
        if (uid) {
          await markConnected(roomId, uid).catch(() => {});
        }

        const settings = await getRoomSettings<BackgammonSettings>(roomId);
        if (cancelled || !settings) return;

        const actionLog = await getActionLog<BackgammonAction>(roomId);
        if (cancelled) return;

        const state = replayActions(
          (s: BackgammonSettings) => createInitialBgState(s, randomSeed()),
          backgammonReducer,
          settings,
          actionLog
        );

        const maxSeq = actionLog.length > 0 ? actionLog[actionLog.length - 1].seq : 0;
        seqRef.current = maxSeq;
        gameRef.current = state;
        setGameState(state);

        unsubscribe = subscribeToActions<BackgammonAction>(
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
          }
        );
      } catch (e) {
        console.error('Failed to init Backgammon multiplayer game:', e);
        setSyncError('Failed to initialize game. Check your connection.');
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [roomId, applyAction]);

  // Host drives AI turns
  useEffect(() => {
    if (!isHost || !gameState) return;
    const bgState = gameState.state;
    if (bgState.phase === 'GAME_OVER') return;

    const turnSeat = bgState.turn === 'white' ? 0 : 1;
    const turnPlayer = gameState.players[turnSeat];
    if (!turnPlayer || turnPlayer.type !== PlayerType.AI) return;

    if (aiTimerRef.current) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    aiTimerRef.current = window.setTimeout(() => {
      const current = gameRef.current;
      if (!current) return;
      const action = getBgAIAction(current, 2);
      if (action) publish(action);
    }, AI_DELAY);

    return () => {
      if (aiTimerRef.current) clearTimeout(aiTimerRef.current);
    };
  }, [gameState, isHost, publish]);

  const bgState = gameState?.state ?? null;
  const isHumanTurn = bgState?.turn === humanColor;

  const allLegalMoves =
    bgState?.phase === 'MOVING' && isHumanTurn
      ? getLegalMoves(bgState, humanColor)
      : [];

  const legalMoves = selectedFrom !== null
    ? allLegalMoves.filter((m) => m.from === selectedFrom)
    : [];

  const rollDice = useCallback(() => {
    if (!bgState || bgState.phase !== 'ROLLING' || !isHumanTurn) return;
    publish({ type: 'ROLL_DICE', seed: randomSeed() });
  }, [bgState, isHumanTurn, publish]);

  const selectChecker = useCallback((from: number | 'bar') => {
    if (!bgState || bgState.phase !== 'MOVING' || !isHumanTurn) return;

    if (from === 'bar') {
      if (bgState.bar[humanColor] <= 0) return;
    } else {
      if (bgState.board[from].color !== humanColor || bgState.board[from].count <= 0) return;
    }

    const movesFromHere = allLegalMoves.filter((m) => m.from === from);
    if (movesFromHere.length === 0) return;

    setSelectedFrom((prev) => (prev === from ? null : from));
  }, [bgState, isHumanTurn, humanColor, allLegalMoves]);

  const moveChecker = useCallback((to: number) => {
    if (selectedFrom === null) return;
    const move = allLegalMoves.find((m) => m.from === selectedFrom && m.to === to);
    if (move?.via !== undefined) {
      publish({ type: 'COMBINED_MOVE', from: move.from, via: move.via, to: move.to });
    } else {
      publish({ type: 'MOVE_CHECKER', from: selectedFrom, to });
    }
    setSelectedFrom(null);
  }, [selectedFrom, allLegalMoves, publish]);

  const newGame = useCallback(() => {
    publish({ type: 'NEW_GAME', seed: randomSeed() });
  }, [publish]);

  return {
    gameState,
    syncError,
    retrySync,
    legalMoves,
    selectedFrom,
    rollDice,
    selectChecker,
    moveChecker,
    newGame,
    humanColor,
  };
}
