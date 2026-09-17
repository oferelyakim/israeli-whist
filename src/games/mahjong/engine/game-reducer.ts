import { MahjongLayoutId, MahjongPhase } from '../types';
import type { MahjongAction, MahjongGameSettings, MahjongGameState, PlacedTile } from '../types';
import { MAHJONG_LAYOUTS } from './layouts';
import { availableMatches, freeTileIds } from './board';
import { generateSolvableBoard, reshuffleRemaining } from './deal';
import { tilesMatch } from './tiles';

const MAX_HISTORY = 200;

export function createInitialMahjongState(
  settings: MahjongGameSettings,
  layoutId: MahjongLayoutId = MahjongLayoutId.TURTLE,
): MahjongGameState {
  return {
    settings,
    phase: MahjongPhase.PLAYING,
    seed: 0,
    layoutId,
    tiles: [],
    selectedId: null,
    history: [],
    moves: 0,
    hintPair: null,
    shufflesUsed: 0,
    elapsedSeconds: 0,
    stuck: false,
  };
}

function pushHistory(state: MahjongGameState): PlacedTile[][] {
  const next = [...state.history, state.tiles];
  return next.length > MAX_HISTORY ? next.slice(next.length - MAX_HISTORY) : next;
}

function withBoard(state: MahjongGameState, tiles: PlacedTile[], patch: Partial<MahjongGameState>): MahjongGameState {
  const layout = MAHJONG_LAYOUTS[state.layoutId];
  const won = tiles.length === 0;
  return {
    ...state,
    ...patch,
    tiles,
    phase: won ? MahjongPhase.WON : MahjongPhase.PLAYING,
    stuck: !won && availableMatches(layout, tiles).length === 0,
  };
}

export function mahjongReducer(state: MahjongGameState, action: MahjongAction): MahjongGameState {
  const layout = MAHJONG_LAYOUTS[state.layoutId];

  switch (action.type) {
    case 'DEAL': {
      const nextLayout = MAHJONG_LAYOUTS[action.layoutId];
      const tiles = generateSolvableBoard(nextLayout, action.seed);
      return withBoard(
        { ...state, layoutId: action.layoutId },
        tiles,
        {
          seed: action.seed,
          selectedId: null,
          history: [],
          moves: 0,
          hintPair: null,
          shufflesUsed: 0,
          elapsedSeconds: 0,
        },
      );
    }

    case 'RESTART_SAME_TILES': {
      const tiles = generateSolvableBoard(layout, state.seed);
      return withBoard(state, tiles, {
        selectedId: null,
        history: [],
        moves: 0,
        hintPair: null,
        shufflesUsed: 0,
        elapsedSeconds: 0,
      });
    }

    case 'TAP_TILE': {
      if (state.phase !== MahjongPhase.PLAYING) return state;

      const free = freeTileIds(layout, state.tiles);
      if (!free.has(action.tileId)) return state;

      if (state.selectedId === action.tileId) {
        return { ...state, selectedId: null };
      }

      const selected = state.tiles.find((p) => p.tile.id === state.selectedId);
      const tapped = state.tiles.find((p) => p.tile.id === action.tileId);
      if (!tapped) return state;

      // Keep the hint visible while the player taps the pair it pointed at.
      const keepHint = state.hintPair?.includes(action.tileId) ? state.hintPair : null;

      // No selection yet, or the selected tile no longer matches: select this one.
      if (!selected || !tilesMatch(selected.tile, tapped.tile)) {
        return { ...state, selectedId: action.tileId, hintPair: keepHint };
      }

      const removedIds = new Set([selected.tile.id, tapped.tile.id]);
      const tiles = state.tiles.filter((p) => !removedIds.has(p.tile.id));
      return withBoard(state, tiles, {
        selectedId: null,
        hintPair: null,
        history: pushHistory(state),
        moves: state.moves + 1,
      });
    }

    case 'CLEAR_SELECTION':
      return state.selectedId === null ? state : { ...state, selectedId: null, hintPair: null };

    case 'UNDO': {
      if (state.history.length === 0) return state;
      const tiles = state.history[state.history.length - 1];
      return withBoard(state, tiles, {
        selectedId: null,
        hintPair: null,
        history: state.history.slice(0, -1),
        moves: Math.max(0, state.moves - 1),
      });
    }

    case 'HINT': {
      const matches = availableMatches(layout, state.tiles);
      if (matches.length === 0) return { ...state, hintPair: null };
      // Cycle through the available matches on repeated presses.
      const current = state.hintPair;
      const currentIndex = current
        ? matches.findIndex(([a, b]) => a === current[0] && b === current[1])
        : -1;
      const next = matches[(currentIndex + 1) % matches.length];
      return { ...state, hintPair: next, selectedId: null };
    }

    case 'SHUFFLE': {
      if (state.phase !== MahjongPhase.PLAYING || state.tiles.length === 0) return state;
      const seed = state.seed + (state.shufflesUsed + 1) * 104729 + state.moves;
      const tiles = reshuffleRemaining(layout, state.tiles, seed);
      return withBoard(state, tiles, {
        selectedId: null,
        hintPair: null,
        history: pushHistory(state),
        shufflesUsed: state.shufflesUsed + 1,
      });
    }

    case 'TICK':
      if (state.phase !== MahjongPhase.PLAYING) return state;
      return { ...state, elapsedSeconds: state.elapsedSeconds + 1 };

    default:
      return state;
  }
}
