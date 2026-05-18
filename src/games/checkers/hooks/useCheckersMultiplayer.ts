import { useCallback, useEffect, useRef, useState } from 'react';
import { PlayerType } from '../../../types/game-common';
import type { CheckersSettings, CheckersGameState, CheckersAction, PieceColor } from '../types';
import { checkersReducer, createInitialCheckersState, getLegalMovesForSelected } from '../engine/game-reducer';
import { getCheckersAIAction } from '../ai/ai-player';
import {
  publishActionWithRetry,
  subscribeToActions,
  getActionLog,
  getRoomSettings,
  replayActions,
} from '../../../multiplayer/game-sync';
import { markConnected } from '../../../multiplayer/room-manager';
import { getUid } from '../../../multiplayer/firebase-config';

const AI_DELAY_MS = 700;

let nonceCounter = 0;
function generateNonce(): string {
  nonceCounter += 1;
  return `ck_${Date.now().toString(36)}_${nonceCounter.toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export function useCheckersMultiplayer(
  roomId: string,
  humanSeat: number,
  isHost: boolean
): {
  gameState: CheckersGameState | null;
  syncError: string | null;
  retrySync: () => void;
  legalMoves: Array<[number, number]>;
  selectPiece: (row: number, col: number) => void;
  movePiece: (toRow: number, toCol: number) => void;
  newGame: () => void;
  humanColor: PieceColor;
} {
  const [gameState, setGameState] = useState<CheckersGameState | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [legalMoves, setLegalMoves] = useState<Array<[number, number]>>([]);
  const gameRef = useRef<CheckersGameState | null>(null);
  const seqRef = useRef(0);
  const aiTimerRef = useRef<number | null>(null);
  const localNonces = useRef(new Set<string>());

  // Seat 0 = red, seat 1 = black
  const humanColor: PieceColor = humanSeat === 0 ? 'red' : 'black';

  const applyAction = useCallback((action: CheckersAction) => {
    setGameState((prev) => {
      if (!prev) return prev;
      try {
        const next = checkersReducer(prev, action);
        gameRef.current = next;
        return next;
      } catch (e) {
        console.error('Checkers multiplayer reducer error:', e, action);
        return prev;
      }
    });
  }, []);

  const publish = useCallback(
    async (action: CheckersAction) => {
      seqRef.current += 1;
      const seq = seqRef.current;
      const nonce = generateNonce();

      localNonces.current.add(nonce);
      applyAction(action);

      try {
        await publishActionWithRetry(roomId, action, seq, nonce);
        setSyncError(null);
      } catch (e) {
        console.error('Failed to publish Checkers action after retries:', e);
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

        const settings = await getRoomSettings<CheckersSettings>(roomId);
        if (cancelled || !settings) return;

        const actionLog = await getActionLog<CheckersAction>(roomId);
        if (cancelled) return;

        const state = replayActions(
          createInitialCheckersState,
          checkersReducer,
          settings,
          actionLog
        );
        const maxSeq = actionLog.length > 0 ? actionLog[actionLog.length - 1].seq : 0;
        seqRef.current = maxSeq;
        gameRef.current = state;
        setGameState(state);

        unsubscribe = subscribeToActions<CheckersAction>(
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
        console.error('Failed to init Checkers multiplayer game:', e);
        setSyncError('Failed to initialize game. Check your connection.');
      }
    })();

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [roomId, applyAction]);

  // Host-only: schedule AI moves
  useEffect(() => {
    if (!isHost || !gameState) return;

    if (aiTimerRef.current !== null) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    if (gameState.state.phase === 'GAME_OVER') return;

    const currentTurnColor: PieceColor = gameState.state.turn;
    const currentSeat = currentTurnColor === 'red' ? 0 : 1;
    const currentPlayerType = gameState.settings.playerTypes[currentSeat];

    if (currentPlayerType !== PlayerType.AI) return;

    aiTimerRef.current = window.setTimeout(() => {
      const current = gameRef.current;
      if (!current || current.state.phase === 'GAME_OVER') return;

      const aiAction = getCheckersAIAction(current);
      if (!aiAction || aiAction.type !== 'MOVE_PIECE') return;

      const selectAction: CheckersAction = {
        type: 'SELECT_PIECE',
        row: aiAction.fromRow,
        col: aiAction.fromCol,
      };
      void publish(selectAction).then(() => publish(aiAction));
    }, AI_DELAY_MS);

    return () => {
      if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current);
    };
  }, [gameState, isHost, publish]);

  // Keep legalMoves in sync with selection
  useEffect(() => {
    if (!gameState) { setLegalMoves([]); return; }
    const { state } = gameState;
    if (state.turn !== humanColor) { setLegalMoves([]); return; }
    setLegalMoves(getLegalMovesForSelected(state));
  }, [gameState, humanColor]);

  const selectPiece = useCallback(
    (row: number, col: number) => {
      const current = gameRef.current;
      if (!current) return;
      if (current.state.turn !== humanColor) return;
      void publish({ type: 'SELECT_PIECE', row, col });
    },
    [publish, humanColor]
  );

  const movePiece = useCallback(
    (toRow: number, toCol: number) => {
      const current = gameRef.current;
      if (!current) return;
      if (current.state.turn !== humanColor) return;
      const { selectedRow, selectedCol } = current.state;
      if (selectedRow === null || selectedCol === null) return;
      void publish({
        type: 'MOVE_PIECE',
        fromRow: selectedRow,
        fromCol: selectedCol,
        toRow,
        toCol,
      });
    },
    [publish, humanColor]
  );

  const newGame = useCallback(() => {
    void publish({ type: 'NEW_GAME' });
  }, [publish]);

  return { gameState, syncError, retrySync, legalMoves, selectPiece, movePiece, newGame, humanColor };
}
