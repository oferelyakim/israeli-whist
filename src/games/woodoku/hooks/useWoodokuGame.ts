import { useCallback, useEffect, useReducer, useState } from 'react';
import type { WoodokuSettings, WoodokuGameState } from '../types';
import { woodokuReducer, createInitialWoodokuState } from '../engine/game-reducer';
import { canPlace } from '../engine/board';
import { randomSeed } from '../../../utils/random';

const SAVE_KEY = 'woodoku-saved-game';

function saveGame(gs: WoodokuGameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(gs));
  } catch { /* ignore quota errors */ }
}

function loadSavedGame(): WoodokuGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WoodokuGameState;
    // Basic shape validation
    if (
      !parsed.state ||
      !Array.isArray(parsed.state.board) ||
      parsed.state.board.length !== 9 ||
      !Array.isArray(parsed.state.offered) ||
      parsed.state.offered.length !== 3
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface UseWoodokuGameReturn {
  gameState: WoodokuGameState;
  previewCells: Array<[number, number]> | null;
  hoveredAnchor: [number, number] | null;
  setHoveredAnchor: (anchor: [number, number] | null) => void;
  selectPiece: (index: number) => void;
  placePiece: (row: number, col: number) => void;
  newGame: () => void;
}

export function useWoodokuGame(settings: WoodokuSettings): UseWoodokuGameReturn {
  const [gameState, dispatch] = useReducer(
    woodokuReducer,
    null,
    () => {
      const saved = loadSavedGame();
      if (saved) return saved;
      return createInitialWoodokuState(settings, randomSeed());
    },
  );

  const [hoveredAnchor, setHoveredAnchor] = useState<[number, number] | null>(null);

  // Persist state after every change
  useEffect(() => {
    saveGame(gameState);
  }, [gameState]);

  const selectPiece = useCallback((index: number) => {
    dispatch({ type: 'SELECT_PIECE', index });
  }, []);

  const placePiece = useCallback((row: number, col: number) => {
    dispatch({ type: 'PLACE_PIECE', row, col });
    setHoveredAnchor(null);
  }, []);

  const newGame = useCallback(() => {
    dispatch({ type: 'NEW_GAME', seed: randomSeed() });
    setHoveredAnchor(null);
  }, []);

  // Compute preview cells when a piece is selected and hoveredAnchor is set
  const previewCells: Array<[number, number]> | null = (() => {
    const { selectedIndex, offered, board } = gameState.state;
    if (selectedIndex === null || hoveredAnchor === null) return null;
    const piece = offered[selectedIndex];
    if (!piece) return null;
    const [anchorRow, anchorCol] = hoveredAnchor;
    if (!canPlace(board, piece, anchorRow, anchorCol)) return null;
    return piece.cells.map(([dr, dc]) => [anchorRow + dr, anchorCol + dc]);
  })();

  return {
    gameState,
    previewCells,
    hoveredAnchor,
    setHoveredAnchor,
    selectPiece,
    placePiece,
    newGame,
  };
}
