import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { PlayerType } from '../../../types/game-common';
import type { CheckersSettings, CheckersGameState, PieceColor } from '../types';
import { checkersReducer, createInitialCheckersState, getLegalMovesForSelected } from '../engine/game-reducer';
import { getCheckersAIAction } from '../ai/ai-player';

const AI_DELAY_MS = 700;

export function useCheckersGame(settings: CheckersSettings): {
  gameState: CheckersGameState;
  legalMoves: Array<[number, number]>;
  selectPiece: (row: number, col: number) => void;
  movePiece: (toRow: number, toCol: number) => void;
  newGame: () => void;
  humanColor: PieceColor;
} {
  const [gameState, dispatch] = useReducer(checkersReducer, settings, createInitialCheckersState);
  const [legalMoves, setLegalMoves] = useState<Array<[number, number]>>([]);
  const aiTimerRef = useRef<number | null>(null);
  const gameStateRef = useRef(gameState);
  gameStateRef.current = gameState;

  // Seat 0 = red, seat 1 = black
  const humanColor: PieceColor = settings.playerTypes[0] === PlayerType.HUMAN ? 'red' : 'black';

  const isHumanTurn = gameState.state.turn === humanColor;

  // Schedule AI move when it is the AI's turn
  useEffect(() => {
    if (aiTimerRef.current !== null) {
      clearTimeout(aiTimerRef.current);
      aiTimerRef.current = null;
    }

    if (gameState.state.phase === 'GAME_OVER') return;
    if (isHumanTurn) return;

    aiTimerRef.current = window.setTimeout(() => {
      const current = gameStateRef.current;
      if (current.state.phase === 'GAME_OVER') return;
      if (current.state.turn === humanColor) return;

      const aiAction = getCheckersAIAction(current, settings.difficulty ?? 2);
      if (!aiAction) return;

      if (aiAction.type === 'MOVE_PIECE') {
        // AI must select first so reducer knows fromRow/fromCol
        dispatch({ type: 'SELECT_PIECE', row: aiAction.fromRow, col: aiAction.fromCol });
        dispatch(aiAction);
        setLegalMoves([]);
      }
    }, AI_DELAY_MS);

    return () => {
      if (aiTimerRef.current !== null) clearTimeout(aiTimerRef.current);
    };
  }, [gameState, isHumanTurn, humanColor]);

  const selectPiece = useCallback(
    (row: number, col: number) => {
      if (!isHumanTurn) return;
      dispatch({ type: 'SELECT_PIECE', row, col });
      // Compute legal moves from the state after selection
      setLegalMoves((prev) => {
        void prev;
        // Re-derive from updated state in next render via useEffect
        return [];
      });
    },
    [isHumanTurn]
  );

  // Keep legalMoves in sync with the current selection in gameState
  useEffect(() => {
    setLegalMoves(getLegalMovesForSelected(gameState.state));
  }, [gameState]);

  const movePiece = useCallback(
    (toRow: number, toCol: number) => {
      if (!isHumanTurn) return;
      const { selectedRow, selectedCol } = gameStateRef.current.state;
      if (selectedRow === null || selectedCol === null) return;
      dispatch({
        type: 'MOVE_PIECE',
        fromRow: selectedRow,
        fromCol: selectedCol,
        toRow,
        toCol,
      });
    },
    [isHumanTurn]
  );

  const newGame = useCallback(() => {
    dispatch({ type: 'NEW_GAME' });
    setLegalMoves([]);
  }, []);

  return { gameState, legalMoves, selectPiece, movePiece, newGame, humanColor };
}
