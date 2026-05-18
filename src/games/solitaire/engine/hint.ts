import type { SolitaireGameState } from '../types';
import type { Card, CardKey } from '../../../types/card';
import { cardKey, isJoker, Rank } from '../../../types/card';
import { canPlaceOnTableau, canPlaceOnFoundation } from './validation';

export type HintTarget =
  | { type: 'foundation'; pileIndex: number }
  | { type: 'tableau'; columnIndex: number }
  | { type: 'stock' }
  | null;

export interface HintResult {
  sourceCards: CardKey[];
  descriptionKey: string;
  target: HintTarget;
  priority: number;
}

/** Serializes a hint to a string for dedup / back-and-forth detection. */
function hintSignature(h: HintResult): string {
  const src = h.sourceCards.slice().sort().join(',');
  const tgt = h.target
    ? `${h.target.type}${'pileIndex' in h.target ? h.target.pileIndex : ''}${'columnIndex' in h.target ? h.target.columnIndex : ''}`
    : 'null';
  return `${src}->${tgt}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Check whether any of the currently visible waste/stock cards could be
 * played somewhere useful (foundation or tableau). "Visible" means the
 * top of the waste pile plus the cards that would become visible by
 * drawing through the stock (every card in the stock, since Klondike
 * draw-1 reveals them one at a time).
 */
function stockHasUsefulCards(state: SolitaireGameState): boolean {
  const candidateCards: Card[] = [];

  // Top of waste is already visible
  if (state.waste.length > 0) {
    candidateCards.push(state.waste[state.waste.length - 1]);
  }
  // Every card in the stock will become the top of waste when drawn
  for (const card of state.stock) {
    candidateCards.push(card);
  }

  for (const card of candidateCards) {
    if (isJoker(card)) continue;

    // Could it go to a foundation?
    for (let fi = 0; fi < 4; fi++) {
      if (canPlaceOnFoundation(card, state.foundations[fi])) return true;
    }
    // Could it go to a tableau column?
    for (let ci = 0; ci < 7; ci++) {
      const col = state.tableau[ci];
      const top = col.faceUp.length > 0 ? col.faceUp[col.faceUp.length - 1] : null;
      if (canPlaceOnTableau(card, top)) return true;
    }
  }
  return false;
}

/**
 * Check if moving the bottom face-up card(s) from `srcCol` to `destCol`
 * would enable a foundation move that isn't currently possible.
 */
function moveEnablesFoundation(
  state: SolitaireGameState,
  srcColIndex: number,
  _destColIndex: number,
  _cardIndex: number,
): boolean {
  const srcCol = state.tableau[srcColIndex];

  // After moving, the card that was underneath becomes the new top of src
  // If srcCol has face-down cards, we can't predict what flips, but that's
  // handled by the "reveals face-down" priority. Here we check if any card
  // in the destination stack or the newly exposed card enables a foundation move.

  // Check: would the destination top (the card below what we're moving onto)
  // become accessible after receiving the stack? No -- the moved cards go ON TOP.

  // Check: if srcCol has remaining faceUp cards after removing from cardIndex,
  // the new top card of srcCol might go to foundation.
  if (srcCol.faceUp.length > 1) {
    // The card below the one we're moving
    const newSrcTop = srcCol.faceUp[srcCol.faceUp.length - 1];
    if (!isJoker(newSrcTop)) {
      for (let fi = 0; fi < 4; fi++) {
        if (canPlaceOnFoundation(newSrcTop, state.foundations[fi])) return true;
      }
    }
  }

  // Check: does moving a stack onto destCol allow destCol's buried cards
  // to eventually reach foundation? Hard to predict, but check if the
  // moved bottom card going to destCol creates a longer descending sequence
  // that ends with a foundation-ready card.
  // For simplicity, just check if destCol top can go to foundation after
  // receiving the cards... it can't since cards go on top. So skip this.

  // Check: would an empty column be created that a King from waste could use?
  if (srcCol.faceDown.length === 0 && srcCol.faceUp.length > 0) {
    // Moving entire faceUp stack away creates empty column
    // Check if there's a King in the waste that needs a home
    if (state.waste.length > 0) {
      const wasteTop = state.waste[state.waste.length - 1];
      if (wasteTop.rank === Rank.KING) return true;
    }
  }

  return false;
}

// ─── Main hint finder ────────────────────────────────────────────────

/**
 * Find ALL useful moves, scored by priority. Returns them sorted best-first.
 *
 * Priority 1: Moves to foundation (Aces first, then building)
 * Priority 2: Moves that reveal face-down cards
 * Priority 3: Moves that create empty spaces (for Kings to fill)
 * Priority 4: Moves from waste pile to tableau
 * Priority 5: Drawing from deck (only if useful cards remain)
 */
export function findAllHints(state: SolitaireGameState): HintResult[] {
  const hints: HintResult[] = [];

  // ── Priority 1: Foundation moves ──────────────────────────────────

  // Check waste top -> foundation
  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1];
    if (!isJoker(top)) {
      for (let fi = 0; fi < 4; fi++) {
        if (canPlaceOnFoundation(top, state.foundations[fi])) {
          hints.push({
            sourceCards: [cardKey(top)],
            descriptionKey: 'solitaire.hintFoundation',
            target: { type: 'foundation', pileIndex: fi },
            priority: 1,
          });
        }
      }
    }
  }

  // Check each tableau column top -> foundation
  for (let ci = 0; ci < 7; ci++) {
    const col = state.tableau[ci];
    if (col.faceUp.length === 0) continue;
    const top = col.faceUp[col.faceUp.length - 1];
    if (isJoker(top)) continue;
    for (let fi = 0; fi < 4; fi++) {
      if (canPlaceOnFoundation(top, state.foundations[fi])) {
        hints.push({
          sourceCards: [cardKey(top)],
          descriptionKey: 'solitaire.hintFoundation',
          target: { type: 'foundation', pileIndex: fi },
          priority: 1,
        });
      }
    }
  }

  // ── Priority 2: Tableau moves that reveal face-down cards ─────────

  for (let ci = 0; ci < 7; ci++) {
    const col = state.tableau[ci];
    if (col.faceDown.length === 0 || col.faceUp.length === 0) continue;
    // Move the entire faceUp stack (from bottom) to reveal hidden cards
    const bottomCard = col.faceUp[0];
    for (let di = 0; di < 7; di++) {
      if (di === ci) continue;
      const destCol = state.tableau[di];
      const destTop = destCol.faceUp.length > 0
        ? destCol.faceUp[destCol.faceUp.length - 1]
        : null;
      if (canPlaceOnTableau(bottomCard, destTop)) {
        // Skip: moving King to empty column doesn't reveal anything new
        // if the King is already at the bottom with face-down cards
        // Actually this DOES reveal: King moves, face-down flips. Allow it.
        hints.push({
          sourceCards: col.faceUp.map(c => cardKey(c)),
          descriptionKey: 'solitaire.hintReveal',
          target: { type: 'tableau', columnIndex: di },
          priority: 2,
        });
      }
    }
  }

  // ── Priority 3: Moves that create empty spaces for Kings ──────────

  for (let ci = 0; ci < 7; ci++) {
    const col = state.tableau[ci];
    // Only useful if column has no face-down cards (moving away creates empty slot)
    if (col.faceDown.length !== 0 || col.faceUp.length === 0) continue;
    const bottomCard = col.faceUp[0];
    // If bottom card is a King, moving it only makes sense if another King needs the empty space
    if (bottomCard.rank === Rank.KING) {
      const hasKingNeedingHome = hasStrandedKing(state, ci);
      if (!hasKingNeedingHome) continue;
    }
    for (let di = 0; di < 7; di++) {
      if (di === ci) continue;
      const destCol = state.tableau[di];
      const destTop = destCol.faceUp.length > 0
        ? destCol.faceUp[destCol.faceUp.length - 1]
        : null;
      if (canPlaceOnTableau(bottomCard, destTop)) {
        // Skip: moving King to empty column from another empty column (pointless)
        if (bottomCard.rank === Rank.KING && destTop === null) continue;
        // Check that this move actually enables something useful
        if (moveEnablesFoundation(state, ci, di, 0)) {
          hints.push({
            sourceCards: col.faceUp.map(c => cardKey(c)),
            descriptionKey: 'solitaire.hintTableau',
            target: { type: 'tableau', columnIndex: di },
            priority: 3,
          });
        }
      }
    }
  }

  // ── Priority 4: Waste to tableau ──────────────────────────────────

  if (state.waste.length > 0) {
    const top = state.waste[state.waste.length - 1];
    for (let di = 0; di < 7; di++) {
      const destCol = state.tableau[di];
      const destTop = destCol.faceUp.length > 0
        ? destCol.faceUp[destCol.faceUp.length - 1]
        : null;
      if (canPlaceOnTableau(top, destTop)) {
        hints.push({
          sourceCards: [cardKey(top)],
          descriptionKey: 'solitaire.hintTableau',
          target: { type: 'tableau', columnIndex: di },
          priority: 4,
        });
      }
    }
  }

  // ── Priority 5: Draw from stock (only if useful cards remain) ─────

  if (state.stock.length > 0 && stockHasUsefulCards(state)) {
    hints.push({
      sourceCards: [],
      descriptionKey: 'solitaire.hintDraw',
      target: { type: 'stock' },
      priority: 5,
    });
  }

  // Also suggest recycling waste if stock is empty but waste has useful cards
  if (state.stock.length === 0 && state.waste.length > 0 && stockHasUsefulCards(state)) {
    hints.push({
      sourceCards: [],
      descriptionKey: 'solitaire.hintRecycle',
      target: { type: 'stock' },
      priority: 5,
    });
  }

  // ── De-duplicate and filter back-and-forth ────────────────────────

  const seen = new Set<string>();
  const unique: HintResult[] = [];
  for (const h of hints) {
    const sig = hintSignature(h);
    if (!seen.has(sig)) {
      seen.add(sig);
      unique.push(h);
    }
  }

  // Sort by priority (lower = better)
  unique.sort((a, b) => a.priority - b.priority);

  return unique;
}

/**
 * Check if there is a King not already at the bottom of a column that
 * could benefit from an empty column being created. Excludes the column
 * at `excludeCol` since that's the one we'd be emptying.
 */
function hasStrandedKing(state: SolitaireGameState, excludeCol: number): boolean {
  // King in waste
  if (state.waste.length > 0 && state.waste[state.waste.length - 1].rank === Rank.KING) {
    return true;
  }
  // King not at position 0 in a tableau column's faceUp (buried under other cards)
  for (let ci = 0; ci < 7; ci++) {
    if (ci === excludeCol) continue;
    const col = state.tableau[ci];
    for (let i = 1; i < col.faceUp.length; i++) {
      if (col.faceUp[i].rank === Rank.KING) return true;
    }
    // King as the bottom faceUp but with faceDown cards above it -- that means
    // it's already at the bottom, which is fine. But if there are faceDown cards,
    // the column isn't "stranded". Skip.
  }
  // King in stock
  for (const card of state.stock) {
    if (card.rank === Rank.KING) return true;
  }
  return false;
}

/**
 * Public API used by the reducer. Finds the next useful hint, cycling
 * through available hints to avoid repeating the same suggestion.
 *
 * @param state - current game state
 * @param lastHintIndex - index of the last hint shown (-1 if none)
 * @returns the hint result to display and the new hint index, or null
 */
export function findHint(
  state: SolitaireGameState,
  lastHintIndex: number,
): { hint: HintResult; index: number } | null {
  const all = findAllHints(state);
  if (all.length === 0) return null;

  // Cycle to next hint
  const nextIndex = (lastHintIndex + 1) % all.length;
  return { hint: all[nextIndex], index: nextIndex };
}
