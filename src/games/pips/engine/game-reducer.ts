import { PipsPhase } from '../types';
import type {
  CellKey,
  Orientation,
  PipsAction,
  PipsGameState,
  PipsPlacement,
  PipsPuzzle,
  PipsSettings,
} from '../types';
import { canPlace, isSolved, occupiedCells, orientationOf, placementCells } from './board';

export function createInitialPipsState(
  settings: PipsSettings,
  levelIndex: number,
  puzzle: PipsPuzzle,
): PipsGameState {
  return {
    settings,
    phase: PipsPhase.PLAYING,
    levelIndex,
    puzzle,
    placements: [],
    selectedId: null,
    orientation: 0,
    moves: 0,
    hintsUsed: 0,
    elapsedSeconds: 0,
  };
}

/** Re-checks the win condition after anything that moves a tile. */
function settle(state: PipsGameState, placements: PipsPlacement[]): PipsGameState {
  const solved = isSolved(state.puzzle, placements);
  return {
    ...state,
    placements,
    phase: solved ? PipsPhase.SOLVED : PipsPhase.PLAYING,
    selectedId: null,
  };
}

export function pipsReducer(state: PipsGameState, action: PipsAction): PipsGameState {
  switch (action.type) {
    case 'LOAD_LEVEL':
      return createInitialPipsState(state.settings, action.levelIndex, action.puzzle);

    case 'SELECT_DOMINO': {
      if (state.phase !== PipsPhase.PLAYING) return state;
      if (action.id === null) return { ...state, selectedId: null };
      if (!state.puzzle.dominoes.some((d) => d.id === action.id)) return state;
      // Re-picking the held tile turns it instead, so one tap does both jobs.
      if (state.selectedId === action.id) {
        return { ...state, orientation: ((state.orientation + 1) % 4) as Orientation };
      }
      return { ...state, selectedId: action.id, orientation: 0 };
    }

    case 'ROTATE': {
      if (state.phase !== PipsPhase.PLAYING || !state.selectedId) return state;
      return { ...state, orientation: ((state.orientation + 1) % 4) as Orientation };
    }

    case 'PLACE': {
      if (state.phase !== PipsPhase.PLAYING) return state;
      const domino = state.puzzle.dominoes.find((d) => d.id === action.dominoId);
      if (!domino) return state;

      // Moving a tile already on the board is the same action as playing one
      // from the tray, so its old square is freed before the fit is checked.
      const others = state.placements.filter((p) => p.dominoId !== action.dominoId);
      const boardCells = new Set(state.puzzle.cells);
      if (!canPlace(boardCells, occupiedCells(others), action.anchor, action.orientation)) {
        return state;
      }

      const next: PipsPlacement = {
        dominoId: action.dominoId,
        cells: placementCells(action.anchor, action.orientation),
      };
      return { ...settle(state, [...others, next]), moves: state.moves + 1 };
    }

    case 'LIFT': {
      if (state.phase !== PipsPhase.PLAYING) return state;
      const target: CellKey = action.cell;
      const hit = state.placements.find((p) => p.cells[0] === target || p.cells[1] === target);
      if (!hit) return state;
      const rest = state.placements.filter((p) => p.dominoId !== hit.dominoId);
      return {
        ...settle(state, rest),
        moves: state.moves + 1,
        selectedId: hit.dominoId,
        // Hand it back the way it was lying, so putting it down again elsewhere
        // does not silently turn it.
        orientation: orientationOf(hit.cells),
      };
    }

    case 'CLEAR_BOARD': {
      if (state.phase !== PipsPhase.PLAYING) return state;
      if (state.placements.length === 0) return state;
      return { ...settle(state, []), moves: state.moves + 1 };
    }

    case 'HINT': {
      if (state.phase !== PipsPhase.PLAYING) return state;
      const wanted = state.puzzle.solution.find(
        (sol) => !state.placements.some(
          (p) => p.dominoId === sol.dominoId
            && p.cells[0] === sol.cells[0]
            && p.cells[1] === sol.cells[1],
        ),
      );
      if (!wanted) return state;

      // Clear the way: the tile itself wherever it is, plus anything sitting
      // on the two squares it belongs on.
      const blocked = new Set<CellKey>(wanted.cells);
      const kept = state.placements.filter(
        (p) => p.dominoId !== wanted.dominoId
          && !blocked.has(p.cells[0])
          && !blocked.has(p.cells[1]),
      );
      return {
        ...settle(state, [...kept, { dominoId: wanted.dominoId, cells: [...wanted.cells] }]),
        hintsUsed: state.hintsUsed + 1,
        moves: state.moves + 1,
      };
    }

    case 'TICK':
      if (state.phase !== PipsPhase.PLAYING) return state;
      return { ...state, elapsedSeconds: state.elapsedSeconds + 1 };

    default:
      return state;
  }
}
