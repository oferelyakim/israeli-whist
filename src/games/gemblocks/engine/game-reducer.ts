import { GemPhase } from '../types';
import type { GemBlocksAction, GemBlocksGameState, GemBlocksSettings } from '../types';
import {
  GEM_GOAL,
  OPENING_GEMS,
  canPlace,
  createEmptyGrid,
  hasAnyPlacement,
  makeOffer,
  placeAndClear,
  seedBoardGems,
} from './board';

export function createInitialGemState(
  settings: GemBlocksSettings,
  seed: number,
): GemBlocksGameState {
  const { offered, nextSeed, nextSerial } = makeOffer(seed, 0, GEM_GOAL, 0);
  return {
    settings,
    phase: GemPhase.PLAYING,
    board: createEmptyGrid(),
    gems: seedBoardGems(seed ^ 0x5bf03635, OPENING_GEMS),
    offered,
    selectedIndex: null,
    gemsCollected: 0,
    goal: GEM_GOAL,
    score: 0,
    moves: 0,
    elapsedSeconds: 0,
    seed: nextSeed,
    pieceSerial: nextSerial,
    lastClear: null,
  };
}

export function gemBlocksReducer(
  state: GemBlocksGameState,
  action: GemBlocksAction,
): GemBlocksGameState {
  switch (action.type) {
    case 'NEW_GAME':
      return createInitialGemState(state.settings, action.seed);

    case 'SELECT_PIECE': {
      if (state.phase !== GemPhase.PLAYING) return state;
      const { index } = action;
      if (index === null) return { ...state, selectedIndex: null };
      if (index < 0 || index >= state.offered.length) return state;
      if (!state.offered[index]) return state;
      return { ...state, selectedIndex: index };
    }

    case 'PLACE_PIECE': {
      if (state.phase !== GemPhase.PLAYING) return state;
      const offer = state.offered[action.index];
      if (!offer) return state;
      if (!canPlace(state.board, state.gems, offer.piece, action.row, action.col)) return state;

      const result = placeAndClear(state.board, state.gems, offer, action.row, action.col);

      let offered = state.offered.map((o, i) => (i === action.index ? null : o));
      let seed = state.seed;
      let pieceSerial = state.pieceSerial;
      const gemsCollected = state.gemsCollected + result.clear.gems;

      // A fresh set of three only arrives once all three have been used.
      if (offered.every((o) => o === null)) {
        const batch = makeOffer(seed, gemsCollected, state.goal, pieceSerial);
        offered = batch.offered;
        seed = batch.nextSeed;
        pieceSerial = batch.nextSerial;
      }

      const won = gemsCollected >= state.goal;
      const stuck = !won && !hasAnyPlacement(result.board, result.gems, offered);

      return {
        ...state,
        board: result.board,
        gems: result.gems,
        offered,
        selectedIndex: null,
        gemsCollected,
        score: state.score + result.score,
        moves: state.moves + 1,
        seed,
        pieceSerial,
        lastClear: result.clear.cells.length > 0 ? result.clear : null,
        phase: won ? GemPhase.WON : stuck ? GemPhase.GAME_OVER : GemPhase.PLAYING,
      };
    }

    case 'CLEAR_FLASH':
      return state.lastClear === null ? state : { ...state, lastClear: null };

    case 'TICK':
      if (state.phase !== GemPhase.PLAYING) return state;
      return { ...state, elapsedSeconds: state.elapsedSeconds + 1 };

    default:
      return state;
  }
}
