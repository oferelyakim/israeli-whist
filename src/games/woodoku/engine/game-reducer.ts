import { GameType } from '../../../types/game-common';
import type { WoodokuSettings, WoodokuState, WoodokuGameState, WoodokuAction } from '../types';
import { getRandomPieces } from './pieces';
import { canPlace, placePieceAndClear, hasAnyPlacement } from './board';
import { randomSeed } from '../../../utils/random';

const SAVE_KEY_HIGHSCORE = 'woodoku-highscore';
const BOARD_SIZE = 9;

function emptyBoard(): boolean[][] {
  return Array.from({ length: BOARD_SIZE }, () => Array(BOARD_SIZE).fill(false));
}

function loadHighScore(): number {
  try {
    const raw = localStorage.getItem(SAVE_KEY_HIGHSCORE);
    if (!raw) return 0;
    const parsed = parseInt(raw, 10);
    return isNaN(parsed) ? 0 : parsed;
  } catch {
    return 0;
  }
}

function saveHighScore(score: number): void {
  try {
    localStorage.setItem(SAVE_KEY_HIGHSCORE, String(score));
  } catch { /* ignore quota errors */ }
}

export function createInitialWoodokuState(
  settings: WoodokuSettings,
  seed: number,
): WoodokuGameState {
  const { pieces, nextSeed } = getRandomPieces(seed, 3);
  const state: WoodokuState = {
    board: emptyBoard(),
    offered: pieces,
    score: 0,
    phase: 'PLAYING',
    selectedIndex: null,
    lastCleared: 0,
    seed: nextSeed,
  };
  return {
    gameId: `woodoku-${seed}`,
    state,
    settings,
    highScore: loadHighScore(),
  };
}

function makeSettings(): WoodokuSettings {
  return {
    gameType: GameType.WOODOKU,
    playerNames: ['Player'],
    playerTypes: [],
    numPlayers: 1,
  };
}

export function woodokuReducer(
  gameState: WoodokuGameState,
  action: WoodokuAction,
): WoodokuGameState {
  const { state } = gameState;

  switch (action.type) {
    case 'NEW_GAME': {
      const seed = action.seed;
      const settings = gameState.settings ?? makeSettings();
      return createInitialWoodokuState(settings, seed);
    }

    case 'SELECT_PIECE': {
      const { index } = action;
      if (index < 0 || index > 2) return gameState;
      if (state.offered[index] === null) return gameState;
      if (state.phase !== 'PLAYING') return gameState;
      return {
        ...gameState,
        state: { ...state, selectedIndex: index },
      };
    }

    case 'PLACE_PIECE': {
      if (state.phase !== 'PLAYING') return gameState;
      if (state.selectedIndex === null) return gameState;

      const piece = state.offered[state.selectedIndex];
      if (!piece) return gameState;

      const { row, col } = action;
      if (!canPlace(state.board, piece, row, col)) return gameState;

      const { board: newBoard, clearedCells, score: scoreDelta } =
        placePieceAndClear(state.board, piece, row, col);

      const newScore = state.score + scoreDelta;
      const newOffered = [...state.offered] as (typeof state.offered);
      newOffered[state.selectedIndex] = null;

      let nextSeed = state.seed;
      let finalOffered = newOffered;

      // If all 3 slots are now empty, generate a fresh batch
      if (finalOffered.every(p => p === null)) {
        const { pieces, nextSeed: s2 } = getRandomPieces(nextSeed, 3);
        finalOffered = pieces;
        nextSeed = s2;
      }

      const allEmpty = finalOffered.every(p => p === null);
      const noMoves = !allEmpty && !hasAnyPlacement(newBoard, finalOffered);

      let newHighScore = gameState.highScore;
      if (newScore > newHighScore) {
        newHighScore = newScore;
        saveHighScore(newHighScore);
      }

      const newState: WoodokuState = {
        board: newBoard,
        offered: finalOffered,
        score: newScore,
        phase: noMoves ? 'GAME_OVER' : 'PLAYING',
        selectedIndex: null,
        lastCleared: clearedCells,
        seed: nextSeed,
      };

      return { ...gameState, state: newState, highScore: newHighScore };
    }

    default:
      return gameState;
  }
}

export { randomSeed };
