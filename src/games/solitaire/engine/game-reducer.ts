import type {
  SolitaireGameState, SolitaireAction, SolitaireGameSettings,
  SolitaireGameStateSnapshot, TableauColumn,
} from '../types';
import { SolitairePhase } from '../types';
import { dealSolitaire } from './deck';
import { canPlaceOnTableau, canPlaceOnFoundation, isWon } from './validation';
import { findHint } from './hint';
import { isJoker, Suit, Rank } from '../../../types/card';
import type { Card } from '../../../types/card';

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function snapshot(state: SolitaireGameState): SolitaireGameStateSnapshot {
  return deepClone({
    tableau: state.tableau,
    foundations: state.foundations,
    stock: state.stock,
    waste: state.waste,
    jokerLocation: state.jokerLocation,
    phase: state.phase,
    moveCount: state.moveCount,
  });
}

/** Flip top faceDown card to faceUp if column's faceUp is empty. */
function autoFlip(col: TableauColumn): void {
  if (col.faceUp.length === 0 && col.faceDown.length > 0) {
    col.faceUp.push(col.faceDown.pop()!);
  }
}

export function createInitialSolitaireState(settings: SolitaireGameSettings): SolitaireGameState {
  return {
    settings,
    phase: SolitairePhase.DEALING,
    seed: 0,
    tableau: Array.from({ length: 7 }, () => ({ faceDown: [], faceUp: [] })),
    foundations: Array.from({ length: 4 }, () => ({ cards: [] })),
    stock: [],
    waste: [],
    jokerLocation: { type: 'available' },
    moveCount: 0,
    moveHistory: [],
    hintHighlight: null,
    hintTarget: null,
    hintMessage: null,
    hintIndex: -1,
    showStuckDialog: false,
  };
}

export function solitaireReducer(
  state: SolitaireGameState,
  action: SolitaireAction,
): SolitaireGameState {
  const s = deepClone(state);

  // Clear hint highlight on any action except HINT
  if (action.type !== 'HINT') {
    s.hintHighlight = null;
    s.hintTarget = null;
    s.hintMessage = null;
    s.showStuckDialog = false;
    // Reset hint cycle index when player makes a move
    s.hintIndex = -1;
  }

  switch (action.type) {
    case 'DEAL': {
      const { tableau, stock } = dealSolitaire(action.seed);
      s.tableau = tableau;
      s.stock = stock;
      s.waste = [];
      s.foundations = Array.from({ length: 4 }, () => ({ cards: [] }));
      s.moveCount = 0;
      s.moveHistory = [];
      s.hintHighlight = null;
      s.hintTarget = null;
      s.hintMessage = null;
      s.hintIndex = -1;
      s.seed = action.seed;
      s.jokerLocation = { type: 'available' };
      s.showStuckDialog = false;
      s.phase = SolitairePhase.PLAYING;
      return s;
    }

    case 'DRAW_FROM_STOCK': {
      if (s.stock.length === 0) return s;
      s.moveHistory.push(snapshot(state));
      const card = s.stock.pop()!;
      s.waste.push(card);
      s.moveCount++;
      return s;
    }

    case 'RECYCLE_WASTE': {
      if (s.waste.length === 0 || s.stock.length > 0) return s;
      s.moveHistory.push(snapshot(state));
      s.stock = s.waste.reverse();
      s.waste = [];
      s.moveCount++;
      return s;
    }

    case 'MOVE_TO_TABLEAU': {
      const { source, cardIndex, destColumn } = action;
      const destCol = s.tableau[destColumn];
      const destTop = destCol.faceUp.length > 0
        ? destCol.faceUp[destCol.faceUp.length - 1]
        : null;

      let cardsToMove: Card[] = [];

      if (source.type === 'waste') {
        if (s.waste.length === 0) return s;
        const card = s.waste[s.waste.length - 1];
        if (!canPlaceOnTableau(card, destTop)) return s;
        cardsToMove = [s.waste.pop()!];
      } else if (source.type === 'tableau') {
        const srcCol = s.tableau[source.columnIndex];
        if (source.columnIndex === destColumn) return s;
        if (cardIndex < 0 || cardIndex >= srcCol.faceUp.length) return s;
        const bottomCard = srcCol.faceUp[cardIndex];
        if (!canPlaceOnTableau(bottomCard, destTop)) return s;
        cardsToMove = srcCol.faceUp.splice(cardIndex);
      } else if (source.type === 'foundation') {
        const pile = s.foundations[source.pileIndex];
        if (pile.cards.length === 0) return s;
        const card = pile.cards[pile.cards.length - 1];
        if (!canPlaceOnTableau(card, destTop)) return s;
        cardsToMove = [pile.cards.pop()!];
      } else if (source.type === 'joker') {
        if (s.jokerLocation.type !== 'available') return s;
        const jokerCard: Card = { suit: Suit.JOKER_RED, rank: Rank.JOKER };
        if (!canPlaceOnTableau(jokerCard, destTop)) return s;
        cardsToMove = [jokerCard];
      }

      if (cardsToMove.length === 0) return s;

      s.moveHistory.push(snapshot(state));
      destCol.faceUp.push(...cardsToMove);

      // Auto-flip source column
      if (source.type === 'tableau') {
        autoFlip(s.tableau[source.columnIndex]);
      }

      // Update joker location
      const movedJoker = cardsToMove.some(c => isJoker(c));
      if (movedJoker || source.type === 'joker') {
        s.jokerLocation = { type: 'tableau', columnIndex: destColumn };
      }
      // Check if joker was freed (source tableau column now empty of joker)
      if (source.type === 'tableau' && state.jokerLocation.type === 'tableau'
          && state.jokerLocation.columnIndex === source.columnIndex) {
        // Check if joker is still in the source column
        const srcCol = s.tableau[source.columnIndex];
        const jokerStillThere = srcCol.faceUp.some(c => isJoker(c))
          || srcCol.faceDown.some(c => isJoker(c));
        if (!jokerStillThere) {
          // Joker moved to dest or was freed
          if (!cardsToMove.some(c => isJoker(c))) {
            // Joker wasn't in moved cards — it shouldn't exist anywhere then
            s.jokerLocation = { type: 'available' };
          }
        }
      }

      s.moveCount++;
      if (isWon(s)) s.phase = SolitairePhase.WON;
      return s;
    }

    case 'MOVE_TO_FOUNDATION': {
      const { source, destFoundation } = action;
      const pile = s.foundations[destFoundation];

      let card: Card | null = null;

      if (source.type === 'waste') {
        if (s.waste.length === 0) return s;
        card = s.waste[s.waste.length - 1];
        if (!canPlaceOnFoundation(card, pile)) return s;
        s.moveHistory.push(snapshot(state));
        s.waste.pop();
      } else if (source.type === 'tableau') {
        const col = s.tableau[source.columnIndex];
        if (col.faceUp.length === 0) return s;
        card = col.faceUp[col.faceUp.length - 1];
        if (!canPlaceOnFoundation(card, pile)) return s;
        s.moveHistory.push(snapshot(state));
        col.faceUp.pop();
        autoFlip(col);
        // Check if joker was freed
        if (state.jokerLocation.type === 'tableau'
            && state.jokerLocation.columnIndex === source.columnIndex) {
          const jokerStillThere = col.faceUp.some(c => isJoker(c))
            || col.faceDown.some(c => isJoker(c));
          if (!jokerStillThere) {
            s.jokerLocation = { type: 'available' };
          }
        }
      } else {
        return s; // Can't move from foundation to foundation, or joker to foundation
      }

      if (!card) return s;
      pile.cards.push(card);

      s.moveCount++;
      if (isWon(s)) s.phase = SolitairePhase.WON;
      return s;
    }

    case 'UNDO': {
      if (s.moveHistory.length === 0) return s;
      const prev = s.moveHistory.pop()!;
      s.tableau = prev.tableau;
      s.foundations = prev.foundations;
      s.stock = prev.stock;
      s.waste = prev.waste;
      s.jokerLocation = prev.jokerLocation;
      s.phase = prev.phase;
      s.moveCount = prev.moveCount;
      return s;
    }

    case 'HINT': {
      const result = findHint(s, s.hintIndex);
      if (result) {
        s.hintHighlight = result.hint.sourceCards;
        s.hintTarget = result.hint.target;
        s.hintMessage = result.hint.descriptionKey;
        s.hintIndex = result.index;
      } else {
        s.hintHighlight = null;
        s.hintTarget = null;
        s.hintMessage = null;
        // No useful moves — suggest joker if available, otherwise show stuck dialog
        if (s.jokerLocation.type === 'available') {
          s.hintMessage = 'solitaire.hintJoker';
        } else {
          s.showStuckDialog = true;
        }
      }
      return s;
    }

    case 'AUTO_COMPLETE_STEP': {
      // Find the lowest-value card that can go to a foundation
      let bestCard: Card | null = null;
      let bestSource: { type: 'tableau'; columnIndex: number } | { type: 'waste' } | null = null;
      let bestFoundation = -1;
      let bestValue = Infinity;

      // Check tableau tops
      for (let ci = 0; ci < 7; ci++) {
        const col = s.tableau[ci];
        if (col.faceUp.length === 0) continue;
        const top = col.faceUp[col.faceUp.length - 1];
        if (isJoker(top)) continue;
        for (let fi = 0; fi < 4; fi++) {
          if (canPlaceOnFoundation(top, s.foundations[fi])) {
            const val = top.rank === 14 ? 1 : top.rank; // ACE=14 → 1
            if (val < bestValue) {
              bestValue = val;
              bestCard = top;
              bestSource = { type: 'tableau', columnIndex: ci };
              bestFoundation = fi;
            }
          }
        }
      }

      // Check waste top
      if (s.waste.length > 0) {
        const top = s.waste[s.waste.length - 1];
        if (!isJoker(top)) {
          for (let fi = 0; fi < 4; fi++) {
            if (canPlaceOnFoundation(top, s.foundations[fi])) {
              const val = top.rank === 14 ? 1 : top.rank;
              if (val < bestValue) {
                bestValue = val;
                bestCard = top;
                bestSource = { type: 'waste' };
                bestFoundation = fi;
              }
            }
          }
        }
      }

      if (!bestCard || !bestSource || bestFoundation < 0) {
        // No more moves — check win
        if (isWon(s)) s.phase = SolitairePhase.WON;
        else s.phase = SolitairePhase.PLAYING; // Stop auto-complete
        return s;
      }

      // Move the card
      if (bestSource.type === 'waste') {
        s.waste.pop();
      } else {
        const col = s.tableau[bestSource.columnIndex];
        col.faceUp.pop();
        autoFlip(col);
        // Check joker freed
        if (s.jokerLocation.type === 'tableau'
            && s.jokerLocation.columnIndex === bestSource.columnIndex) {
          const jokerStillThere = col.faceUp.some(c => isJoker(c))
            || col.faceDown.some(c => isJoker(c));
          if (!jokerStillThere) {
            s.jokerLocation = { type: 'available' };
          }
        }
      }
      s.foundations[bestFoundation].cards.push(bestCard);
      s.moveCount++;

      if (isWon(s)) s.phase = SolitairePhase.WON;
      return s;
    }

    case 'RESTART_SAME_CARDS': {
      const { tableau, stock } = dealSolitaire(state.seed);
      s.tableau = tableau;
      s.stock = stock;
      s.waste = [];
      s.foundations = Array.from({ length: 4 }, () => ({ cards: [] }));
      s.moveCount = 0;
      s.moveHistory = [];
      s.hintHighlight = null;
      s.hintTarget = null;
      s.hintMessage = null;
      s.hintIndex = -1;
      s.jokerLocation = { type: 'available' };
      s.showStuckDialog = false;
      s.phase = SolitairePhase.PLAYING;
      return s;
    }

    default:
      return s;
  }
}
