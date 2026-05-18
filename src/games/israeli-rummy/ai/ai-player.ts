import type { IsraeliRummyGameState, IsraeliRummyAction, Meld } from '../types';
import { TurnAction, IsraeliRummyPhase } from '../types';
import type { Card } from '../../../types/card';
import { Rank, STANDARD_SUITS, cardKey } from '../../../types/card';
import { isValidMeld, isValidRun, findPossibleMelds, allMeldsValid, meldPointValue, canLayOff, isJokerCard, cardPointValue } from '../engine/validation';

// ─── Performance budget ─────────────────────────────────────────────────────

/** Max melds to consider from findPossibleMelds. Scales with hand size. */
const MAX_MELDS_BASE = 40;
const MAX_MELDS_PER_HAND_CARD = 2;
const MAX_MELDS_HARD_CAP = 120;

function meldBudgetForHand(handSize: number): number {
  return Math.min(MAX_MELDS_HARD_CAP, MAX_MELDS_BASE + handSize * MAX_MELDS_PER_HAND_CARD);
}

/** Max combinations to evaluate in findFirstMeldCombos */
const MAX_COMBO_ITERATIONS = 2000;

/** Max table melds to attempt rearrangement on */
const MAX_TABLE_REARRANGE_MELDS = 24;

/** Hard time limit for the entire AI turn (ms) */
const AI_TIME_BUDGET_MS = 1500;

/** Shared deadline timestamp — set at entry, checked throughout */
let aiDeadline = Infinity;

/** Hand size above which the bot treats itself as "behind" — drops mistake rate to 0. */
const STUCK_HAND_THRESHOLD = 16;

/**
 * Chance the bot "misses" an optimal move — simulates a good-plus player
 * rather than a perfect one. Low enough that the bot still plays well,
 * high enough that it occasionally skips a subtle layoff or forgoes a
 * cross-meld rearrange. Applied only to mid-game strategic choices; never
 * to first-meld commits or endgame plays (those stay deterministic), and
 * never when the hand is large enough to count as "stuck".
 */
const AI_MISTAKE_RATE = 0.08;

let currentMistakeRate = AI_MISTAKE_RATE;

function rollMistake(): boolean {
  return Math.random() < currentMistakeRate;
}

/** Check if we've exceeded the time budget */
function overBudget(): boolean {
  return performance.now() > aiDeadline;
}

/** Wrapper around findPossibleMelds that caps results based on hand size. */
function findPossibleMeldsCapped(hand: Card[]): Card[][] {
  const melds = findPossibleMelds(hand);
  const cap = meldBudgetForHand(hand.length);
  if (melds.length <= cap) return melds;
  // Prioritize longer melds (they place more cards)
  melds.sort((a, b) => b.length - a.length);
  return melds.slice(0, cap);
}

// ─── Card utility ───────────────────────────────────────────────────────────

function rankOrder(rank: Rank): number {
  if (rank === Rank.ACE) return 1;
  return rank;
}

// ─── Main entry point ───────────────────────────────────────────────────────

export function getIsraeliRummyAIAction(state: IsraeliRummyGameState, seat: number): IsraeliRummyAction | null {
  if (state.phase !== IsraeliRummyPhase.PLAYING) return null;
  if (state.currentPlayer !== seat) return null;

  // Set hard time budget for entire AI computation
  aiDeadline = performance.now() + AI_TIME_BUDGET_MS;

  const player = state.players[seat];

  // "Stuck mode": when the hand has grown unusually large the bot is behind
  // and should play deterministically — no random mistake rolls.
  currentMistakeRate = player.hand.length >= STUCK_HAND_THRESHOLD
    ? 0
    : AI_MISTAKE_RATE;

  if (state.turnAction === TurnAction.CHOOSE) {
    return chooseAction(state, player.hand, player.hasMetFirstMeld, state.firstMeldThreshold, state.melds, state.drawPile.length);
  }

  if (state.turnAction === TurnAction.REARRANGING) {
    return computeRearrangement(state, player.hand, state.melds, player.hasMetFirstMeld, state.firstMeldThreshold);
  }

  return null;
}

// ─── CHOOSE phase: decide whether to meld or draw ─────────────────────────

function chooseAction(
  _state: IsraeliRummyGameState,
  hand: Card[],
  hasMetFirstMeld: boolean,
  threshold: number,
  melds: Meld[],
  drawPileSize: number,
): IsraeliRummyAction {
  const canDraw = drawPileSize > 0;
  const possibleMelds = findPossibleMeldsCapped(hand);
  const handSize = hand.length;

  if (!hasMetFirstMeld) {
    // Check if we can meet first meld requirement
    if (!overBudget()) {
      const qualifyingCombos = findFirstMeldCombos(possibleMelds, threshold);
      if (qualifyingCombos.length > 0) {
        const bestCombo = pickBestFirstMeldCombo(qualifyingCombos, hand);
        const cardsUsed = bestCombo.flat().length;
        if (cardsUsed >= 3 || handSize >= 14) {
          return { type: 'START_REARRANGE' };
        }
      }
    }
    // Draw to improve hand (or pass if pile empty)
    return canDraw ? { type: 'DRAW_CARD' } : { type: 'PASS_TURN' };
  }

  // Already met first meld — decide strategically whether to meld or draw.
  // When the draw pile is empty, treat the whole turn as endgame: the only
  // way to progress the round is to place SOMETHING, so throw protection
  // rules out and chase every legal placement.
  const deckEmpty = drawPileSize === 0;
  const isEndgame = handSize <= 5 || deckEmpty;
  const meldableCards = countMeldableCards(hand, possibleMelds, melds);

  if (isEndgame && meldableCards > 0) {
    return { type: 'START_REARRANGE' };
  }

  // Check if rearranging table melds could free useful cards
  if (!overBudget()) {
    const rearrangeOpportunity = findRearrangeOpportunity(hand, melds);
    if (rearrangeOpportunity) {
      return { type: 'START_REARRANGE' };
    }
  }

  if (meldableCards >= 3) {
    return { type: 'START_REARRANGE' };
  }

  // "Above average plus" tactics: a good Rummikub player lays off every
  // chance they get — free value, every tile on the table is one fewer in
  // hand at scoring time. Any placeable card triggers a rearrange. No
  // mistake roll here — a good player never "forgets" a free layoff; the
  // imperfection lives in marginal meld selection (selectStrategicMelds).
  if (meldableCards >= 1) {
    return { type: 'START_REARRANGE' };
  }

  if (possibleMelds.length > 0 && !isEndgame && !overBudget()) {
    const netBenefit = evaluateMeldBenefit(hand, possibleMelds, melds);
    if (netBenefit > 0) {
      return { type: 'START_REARRANGE' };
    }
  }

  // If can't draw, must try to meld anything or pass
  if (!canDraw) {
    if (meldableCards > 0 || possibleMelds.length > 0) {
      return { type: 'START_REARRANGE' };
    }
    return { type: 'PASS_TURN' };
  }

  return { type: 'DRAW_CARD' };
}

// ─── Count how many cards from hand we can place ─────────────────────────

function countMeldableCards(hand: Card[], possibleMelds: Card[][], tableMelds: Meld[]): number {
  const placed = new Set<string>();

  // Cards from new melds
  for (const meld of possibleMelds) {
    for (const card of meld) {
      placed.add(cardKey(card));
    }
  }

  // Cards that can lay off (cap table melds checked to avoid slow loops)
  const layoffMeldLimit = Math.min(tableMelds.length, MAX_TABLE_REARRANGE_MELDS);
  for (const card of hand) {
    if (!placed.has(cardKey(card))) {
      for (let mi = 0; mi < layoffMeldLimit; mi++) {
        if (canLayOff(card, tableMelds[mi])) {
          placed.add(cardKey(card));
          break;
        }
      }
    }
  }

  return placed.size;
}

// ─── Evaluate net benefit of melding ────────────────────────────────────────

/**
 * Score the benefit of melding now vs holding cards.
 * Positive = should meld, negative = better to hold.
 */
function evaluateMeldBenefit(hand: Card[], possibleMelds: Card[][], tableMelds: Meld[]): number {
  let score = 0;
  const handKeys = new Set(hand.map(c => cardKey(c)));

  // Find the best non-overlapping set of melds
  const selectedMelds = selectBestMelds(possibleMelds);

  const cardsToMeld = new Set<string>();
  for (const meld of selectedMelds) {
    for (const card of meld) {
      cardsToMeld.add(cardKey(card));
    }
  }

  // Benefit: reducing hand size
  score += cardsToMeld.size * 2;

  // Cost: losing near-meld potential
  const remainingHand = hand.filter(c => !cardsToMeld.has(cardKey(c)));
  const nearMeldsBefore = countNearMelds(hand);
  const nearMeldsAfter = countNearMelds(remainingHand);
  score -= (nearMeldsBefore - nearMeldsAfter) * 1.5;

  // Bonus for layoff opportunities with remaining cards
  for (const card of remainingHand) {
    for (const meld of tableMelds) {
      if (canLayOff(card, meld)) {
        score += 1;
        break;
      }
    }
  }

  // Bonus if melding gets us close to empty hand
  if (remainingHand.length <= 3) score += 5;
  if (remainingHand.length === 0) score += 20;

  // Ignore hand size - only check what's in handKeys
  void handKeys;

  return score;
}

// ─── Near-meld detection ────────────────────────────────────────────────────

/**
 * Count "near melds" — pairs of cards that are one card away from forming a meld.
 * This is used to evaluate the cost of breaking up potential melds.
 */
function countNearMelds(hand: Card[]): number {
  const nonJokers = hand.filter(c => !isJokerCard(c));
  let count = 0;

  // Near-sets: pairs of same rank, different suit
  const byRank = new Map<Rank, Card[]>();
  for (const c of nonJokers) {
    const group = byRank.get(c.rank) ?? [];
    group.push(c);
    byRank.set(c.rank, group);
  }
  for (const [_rank, cards] of byRank) {
    const uniqueSuits = new Set(cards.map(c => c.suit));
    if (uniqueSuits.size === 2) count++;
  }

  // Near-runs: consecutive or gap-of-1 same-suit cards
  for (const suit of STANDARD_SUITS) {
    const suitCards = nonJokers
      .filter(c => c.suit === suit)
      .sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));

    for (let i = 0; i < suitCards.length - 1; i++) {
      const diff = rankOrder(suitCards[i + 1].rank) - rankOrder(suitCards[i].rank);
      if (diff === 1 || diff === 2) count++;
    }
  }

  return count;
}

// ─── Check for rearrangement opportunities ──────────────────────────────────

/**
 * Check if rearranging table melds could help place hand cards.
 *
 * Returns true if ANY of these table-manipulation opportunities exist:
 *   1. Joker replacement: a meld has a joker AND we hold the real card it
 *      represents — swapping returns the joker to our hand for reuse.
 *   2. End extraction from long runs (4+): an end card helps complete a hand meld.
 *   3. Card extraction from 4-sets: any card helps complete a hand meld.
 *   4. Direct layoff: we hold a card that can extend an existing meld
 *      (set slot open, or run end). A good player recognizes this as a
 *      free play, not just a "rearrange".
 *
 * Broadened on 2026-04-23: the previous version only detected cases 2 & 3,
 * so bots often drew even when they had a joker-swap or simple layoff
 * available. This is the "bots only drop sets, never manipulate the table"
 * fix.
 */
function findRearrangeOpportunity(hand: Card[], melds: Meld[]): boolean {
  const nonJokerHand = hand.filter(c => !isJokerCard(c));
  const jokerCount = hand.filter(c => isJokerCard(c)).length;

  // 4. Direct layoff: any hand card that can extend an existing meld.
  // Cheapest check, do it first.
  for (const card of hand) {
    for (const meld of melds) {
      if (canLayOff(card, meld)) return true;
    }
  }

  for (const meld of melds) {
    // 1. Joker replacement — bot has the real card the joker represents.
    // Works on melds of any size (including the common 3-card meld).
    const jokerIdx = meld.cards.findIndex(c => isJokerCard(c));
    if (jokerIdx !== -1) {
      const replacement = findJokerReplacement(meld, jokerIdx);
      if (
        replacement
        && nonJokerHand.some(
          c => c.suit === replacement.suit && c.rank === replacement.rank,
        )
      ) {
        return true;
      }
    }

    if (meld.cards.length <= 3) continue; // Can't extract from minimum melds

    // 2. End extraction from runs of 4+
    if (meld.type === 'run') {
      const endCards = [meld.cards[0], meld.cards[meld.cards.length - 1]];
      for (const endCard of endCards) {
        if (isJokerCard(endCard)) continue;
        if (cardHelpsHand(endCard, nonJokerHand, jokerCount)) return true;
      }
    }

    // 3. Extraction from 4-card sets
    if (meld.type === 'set' && meld.cards.length === 4) {
      for (const card of meld.cards) {
        if (isJokerCard(card)) continue;
        if (cardHelpsHand(card, nonJokerHand, jokerCount)) return true;
      }
    }
  }

  return false;
}

/**
 * Check if adding `card` to hand cards would complete or nearly complete a meld.
 */
function cardHelpsHand(card: Card, handNonJokers: Card[], jokerCount: number): boolean {
  // Check if card + hand cards form a new set
  const sameRank = handNonJokers.filter(c => c.rank === card.rank && c.suit !== card.suit);
  const uniqueSuits = new Set([card.suit, ...sameRank.map(c => c.suit)]);
  if (uniqueSuits.size >= 3) return true;
  if (uniqueSuits.size === 2 && jokerCount > 0) return true;

  // Check if card + hand cards form a new run
  const sameSuit = handNonJokers.filter(c => c.suit === card.suit);
  for (const hc of sameSuit) {
    const diff = Math.abs(rankOrder(hc.rank) - rankOrder(card.rank));
    if (diff === 1) {
      // We have two consecutive — need one more
      // Check if there's a third or a joker
      const needed1 = rankOrder(card.rank) - 1;
      const needed2 = rankOrder(hc.rank) + (rankOrder(hc.rank) > rankOrder(card.rank) ? 1 : 0);
      const hasThird = sameSuit.some(c => {
        const ro = rankOrder(c.rank);
        return ro === needed1 || ro === needed2;
      });
      if (hasThird || jokerCount > 0) return true;
    }
  }

  return false;
}

// ─── Rearrangement logic ─────────────────────────────────────────────────────

function computeRearrangement(
  state: IsraeliRummyGameState,
  hand: Card[],
  existingMelds: Meld[],
  hasMetFirstMeld: boolean,
  threshold: number,
): IsraeliRummyAction {
  let currentHand = [...hand];
  let currentMelds = existingMelds.map(m => ({ ...m, cards: [...m.cards] }));
  let changed = false;
  // Empty draw pile also forces endgame mode: protect nothing, place
  // everything you legally can, otherwise the round is headed for the
  // deadlock-winner path (lowest points in hand).
  const isEndgame = hand.length <= 5 || state.drawPile.length === 0;

  if (!hasMetFirstMeld) {
    // Must place 30+ points with at least one run
    const possibleMelds = findPossibleMeldsCapped(currentHand);
    if (!overBudget()) {
      const combos = findFirstMeldCombos(possibleMelds, threshold);
      if (combos.length > 0) {
        const bestCombo = pickBestFirstMeldCombo(combos, currentHand);
        const newMelds = bestCombo.map(cards => createMeld(cards));
        currentHand = removeCardsFromHand(currentHand, bestCombo.flat());
        currentMelds = [...currentMelds, ...newMelds];
        changed = true;
      }
    }

    if (!changed) {
      return { type: 'REVERT_REARRANGE' };
    }
  } else {
    // Bail out early if over budget
    if (overBudget()) return { type: 'REVERT_REARRANGE' };

    // ── Step 1: Try table rearrangement to free useful cards ──
    const rearrangeResult = tryTableRearrangement(currentHand, currentMelds, state);
    if (rearrangeResult) {
      currentHand = rearrangeResult.hand;
      currentMelds = rearrangeResult.melds;
      changed = true;
    }

    if (overBudget() && !changed) return { type: 'REVERT_REARRANGE' };

    // ── Step 2: Place new melds from hand ──
    const possibleMelds = findPossibleMeldsCapped(currentHand);

    if (isEndgame) {
      // Endgame: meld everything possible to empty the hand
      const selected = selectBestMelds(possibleMelds);
      for (const meldCards of selected) {
        const tempHand = removeCardsFromHand(currentHand, meldCards);
        if (tempHand.length === currentHand.length - meldCards.length) {
          currentMelds = [...currentMelds, createMeld(meldCards)];
          currentHand = tempHand;
          changed = true;
        }
      }
    } else {
      // Mid-game: be selective about what to meld
      const selected = selectStrategicMelds(possibleMelds, currentHand, currentMelds);
      for (const meldCards of selected) {
        const tempHand = removeCardsFromHand(currentHand, meldCards);
        if (tempHand.length === currentHand.length - meldCards.length) {
          currentMelds = [...currentMelds, createMeld(meldCards)];
          currentHand = tempHand;
          changed = true;
        }
      }
    }

    // ── Step 3: Lay off single cards onto existing melds ──
    // Build the "reserved" set from any remaining possibleMelds that the
    // strategic selector chose not to play yet — we don't want to lay off
    // a tile that was part of a chosen new meld. (Once cards are actually
    // consumed into currentMelds at Step 2, they're no longer in currentHand,
    // so reservedCards really only covers melds the selector considered but
    // couldn't place due to overlaps.)
    let layoffMade = true;
    while (layoffMade && !overBudget()) {
      layoffMade = false;
      // In endgame, everything is layoff-eligible (no near-meld protection).
      // Mid-game: run the relaxed layoff filter — jokers, 3-card near-melds,
      // and complete melds are protected; pairs and loose neighbors are not.
      const layoffCandidates = isEndgame
        ? currentHand
        : getLayoffCandidates(currentHand);

      for (let ci = layoffCandidates.length - 1; ci >= 0; ci--) {
        const card = layoffCandidates[ci];
        const handIdx = currentHand.findIndex(c => cardKey(c) === cardKey(card));
        if (handIdx === -1) continue;

        for (let mi = 0; mi < currentMelds.length; mi++) {
          if (!canLayOff(card, currentMelds[mi])) continue;

          // canLayOff is true if EITHER append OR prepend yields a valid
          // meld. Sets only grow by append, but runs may extend at the low
          // end too (e.g. 10♣ joining [J♣,Q♣,K♣] becomes [10♣,J♣,Q♣,K♣]).
          // Always test both arrangements and pick the valid one — naively
          // appending a low-end run extension produces a positionally
          // invalid meld and self-validation would revert the whole turn.
          const appendCards = [...currentMelds[mi].cards, card];
          const prependCards = [card, ...currentMelds[mi].cards];
          const appendCheck = isValidMeld(appendCards);
          const prependCheck = isValidMeld(prependCards);

          let nextCards: Card[];
          let nextType: 'set' | 'run' | null;
          if (appendCheck.valid) {
            nextCards = appendCards;
            nextType = appendCheck.type;
          } else if (prependCheck.valid) {
            nextCards = prependCards;
            nextType = prependCheck.type;
          } else {
            continue; // canLayOff disagreed with isValidMeld — defensive skip
          }

          currentMelds[mi] = {
            ...currentMelds[mi],
            cards: nextCards,
            type: nextType ?? currentMelds[mi].type,
          };
          currentHand = [...currentHand.slice(0, handIdx), ...currentHand.slice(handIdx + 1)];
          changed = true;
          layoffMade = true;
          break;
        }
        if (layoffMade) break;
      }
    }
  }

  if (!changed) {
    return { type: 'REVERT_REARRANGE' };
  }

  // ── Self-validation: verify our proposal would pass reducer checks ──
  // This prevents the "stuck" scenario where AI returns COMMIT_MELDS
  // that the reducer silently rejects (returning unchanged state).
  if (!selfValidateCommit(existingMelds, hand, currentMelds, currentHand)) {
    console.warn('AI self-validation failed — retrying with layoff-only fallback');
    // Fallback: a Step-1 strategy may have corrupted the working state.
    // Throw away every speculative move and try a pure layoff sweep from
    // the original snapshot. This is the simplest legal action that almost
    // always succeeds when the bot has any layoff at all — it stops the
    // hand from growing unbounded turn after turn.
    const fallback = layoffOnlyFallback(hand, existingMelds);
    if (fallback && selfValidateCommit(existingMelds, hand, fallback.melds, fallback.hand)) {
      return {
        type: 'COMMIT_MELDS',
        melds: fallback.melds,
        hand: fallback.hand,
      };
    }
    return { type: 'REVERT_REARRANGE' };
  }

  return {
    type: 'COMMIT_MELDS',
    melds: currentMelds,
    hand: currentHand,
  };
}

/**
 * Pure layoff sweep from the original snapshot. Tries to lay off every
 * possible single card from hand onto an existing meld, in order of
 * descending point value (dump expensive tiles first). Used as a
 * "guaranteed legal action" fallback when the speculative rearrangement
 * pipeline produces a state that fails self-validation.
 */
function layoffOnlyFallback(
  origHand: Card[],
  origMelds: Meld[],
): { hand: Card[]; melds: Meld[] } | null {
  let workingHand = [...origHand];
  let workingMelds = origMelds.map(m => ({ ...m, cards: [...m.cards] }));
  let placed = 0;

  // Sort hand by point value descending — dump high-value tiles first.
  const handByValue = [...origHand].sort(
    (a, b) => cardPointValue(b) - cardPointValue(a),
  );

  for (const card of handByValue) {
    if (overBudget()) break;
    if (isJokerCard(card)) continue; // never lay off jokers in fallback
    const handIdx = workingHand.findIndex(c => cardKey(c) === cardKey(card));
    if (handIdx === -1) continue;

    for (let mi = 0; mi < workingMelds.length; mi++) {
      if (!canLayOff(card, workingMelds[mi])) continue;

      const appendCards = [...workingMelds[mi].cards, card];
      const prependCards = [card, ...workingMelds[mi].cards];
      const appendCheck = isValidMeld(appendCards);
      const prependCheck = isValidMeld(prependCards);

      let nextCards: Card[];
      let nextType: 'set' | 'run' | null;
      if (appendCheck.valid) {
        nextCards = appendCards;
        nextType = appendCheck.type;
      } else if (prependCheck.valid) {
        nextCards = prependCards;
        nextType = prependCheck.type;
      } else {
        continue;
      }

      workingMelds[mi] = {
        ...workingMelds[mi],
        cards: nextCards,
        type: nextType ?? workingMelds[mi].type,
      };
      workingHand = [
        ...workingHand.slice(0, handIdx),
        ...workingHand.slice(handIdx + 1),
      ];
      placed++;
      break;
    }
  }

  if (placed === 0) return null;
  return { hand: workingHand, melds: workingMelds };
}

/**
 * Simulate the reducer's COMMIT_MELDS validation.
 * Returns true if the proposed state would be accepted.
 */
function selfValidateCommit(
  snapshotMelds: Meld[],
  snapshotHand: Card[],
  proposedMelds: Meld[],
  proposedHand: Card[],
): boolean {
  // 1. All proposed melds must be valid
  if (!allMeldsValid(proposedMelds)) return false;

  // 2. All original table cards must still be on the table
  const snapshotTableCards = snapshotMelds.flatMap(m => m.cards);
  const proposedTableCards = proposedMelds.flatMap(m => m.cards);

  const availCounts = new Map<string, number>();
  for (const c of proposedTableCards) {
    const key = cardKey(c);
    availCounts.set(key, (availCounts.get(key) ?? 0) + 1);
  }
  for (const c of snapshotTableCards) {
    const key = cardKey(c);
    const count = availCounts.get(key) ?? 0;
    if (count <= 0) return false;
    availCounts.set(key, count - 1);
  }

  // 3. Card conservation: total before == total after
  const totalBefore = [...snapshotTableCards, ...snapshotHand];
  const totalAfter = [...proposedTableCards, ...proposedHand];
  if (totalBefore.length !== totalAfter.length) return false;

  const counts = new Map<string, number>();
  for (const c of totalBefore) {
    const key = cardKey(c);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const c of totalAfter) {
    const key = cardKey(c);
    const count = counts.get(key) ?? 0;
    if (count <= 0) return false;
    counts.set(key, count - 1);
  }

  return true;
}

// ─── Strategic meld selection ───────────────────────────────────────────────

/**
 * Select melds to play from hand, considering near-meld potential.
 * Avoids breaking up promising card combinations.
 */
function selectStrategicMelds(possibleMelds: Card[][], hand: Card[], _tableMelds: Meld[]): Card[][] {
  if (possibleMelds.length === 0) return [];

  // Score each meld by net benefit
  const scored = possibleMelds.map(meld => {
    let score = 0;
    const meldKeys = new Set(meld.map(c => cardKey(c)));
    const remainingHand = hand.filter(c => !meldKeys.has(cardKey(c)));

    // Benefit: cards removed from hand
    score += meld.length * 3;

    // Bonus: larger melds are better (more efficient)
    if (meld.length >= 4) score += 2;

    // Cost: check if meld cards are part of other near-melds
    const nearBefore = countNearMelds(hand);
    const nearAfter = countNearMelds(remainingHand);
    score -= (nearBefore - nearAfter) * 2;

    // Big bonus if this empties hand or nearly empties it
    if (remainingHand.length === 0) score += 50;
    if (remainingHand.length <= 2) score += 10;

    return { meld, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Select non-overlapping melds with positive score
  const selected: Card[][] = [];
  const usedKeys = new Set<string>();

  for (const { meld, score } of scored) {
    if (score <= 0) continue;
    const keys = meld.map(c => cardKey(c));
    if (keys.some(k => usedKeys.has(k))) continue;
    // "Good plus" player flavor: occasionally pass on a marginally-positive
    // meld. Scores above 12 (clear wins — long melds, hand-emptying moves)
    // always play. Only the close calls are subject to a coin-flip miss.
    if (score < 12 && rollMistake()) continue;
    selected.push(meld);
    keys.forEach(k => usedKeys.add(k));
  }

  return selected;
}

/**
 * Select best non-overlapping melds (maximize cards placed).
 * Used in endgame or when we want to meld aggressively.
 */
function selectBestMelds(possibleMelds: Card[][]): Card[][] {
  // Sort by length descending
  const sorted = [...possibleMelds].sort((a, b) => b.length - a.length);
  const selected: Card[][] = [];
  const usedKeys = new Set<string>();

  for (const meld of sorted) {
    const keys = meld.map(c => cardKey(c));
    if (keys.some(k => usedKeys.has(k))) continue;
    selected.push(meld);
    keys.forEach(k => usedKeys.add(k));
  }

  return selected;
}

// ─── Layoff filtering ───────────────────────────────────────────────────────

/**
 * Filter hand cards to those safe to lay off.
 *
 * Previously over-protective: any pair or any two same-suit cards within
 * 2 ranks were locked up, which made the bot refuse to lay off perfectly
 * fine single tiles. A strong Rummikub player lays off freely and only
 * holds a tile when giving it up would kill a realistic completion path.
 *
 * New rule: a card is protected only when
 *   - it's a joker (always wild, always valuable), OR
 *   - it's currently part of a COMPLETE meld we could play this turn
 *     (caller passes `reservedCards` collected from selected `possibleMelds`), OR
 *   - it's part of a 3-card same-suit consecutive run-in-progress
 *     (a real near-meld, not just a loose pair), OR
 *   - it's part of a 3-way same-rank group (real near-set; a mere pair
 *     is fine to break up for a layoff).
 *
 * Everything else — pairs, diff-of-2 same-suit pairs, orphan cards — is
 * fair game. This matches how a plus-level player thinks: "can I lay this
 * off without killing a clear path to a new meld? If yes, lay off."
 */
function getLayoffCandidates(hand: Card[], reservedCards: Set<string> = new Set()): Card[] {
  const nonJokers = hand.filter(c => !isJokerCard(c));
  const protectedKeys = new Set<string>(reservedCards);

  // Protect 3-way same-rank groups (already a set once completed).
  const byRank = new Map<Rank, Card[]>();
  for (const c of nonJokers) {
    const group = byRank.get(c.rank) ?? [];
    group.push(c);
    byRank.set(c.rank, group);
  }
  for (const [_rank, cards] of byRank) {
    const uniqueSuits = new Set(cards.map(c => c.suit));
    if (uniqueSuits.size >= 3) {
      for (const c of cards) protectedKeys.add(cardKey(c));
    }
  }

  // Protect 3+ consecutive same-suit cards (real run near-melds).
  for (const suit of STANDARD_SUITS) {
    const suitCards = nonJokers
      .filter(c => c.suit === suit)
      .sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));

    let i = 0;
    while (i < suitCards.length) {
      let j = i + 1;
      while (
        j < suitCards.length
        && rankOrder(suitCards[j].rank) - rankOrder(suitCards[j - 1].rank) === 1
      ) j++;
      if (j - i >= 3) {
        for (let k = i; k < j; k++) protectedKeys.add(cardKey(suitCards[k]));
      }
      i = j;
    }
  }

  // Always protect jokers — they can complete any meld.
  for (const c of hand) {
    if (isJokerCard(c)) protectedKeys.add(cardKey(c));
  }

  // Return unprotected cards (safe to lay off)
  const candidates = hand.filter(c => !protectedKeys.has(cardKey(c)));

  // If all cards are protected, allow laying off the least valuable ones.
  if (candidates.length === 0 && hand.length > 0) {
    return [...hand]
      .filter(c => !isJokerCard(c))
      .sort((a, b) => cardPointValue(a) - cardPointValue(b))
      .slice(0, Math.ceil(hand.length / 3));
  }

  return candidates;
}

// ─── Table rearrangement ────────────────────────────────────────────────────

/**
 * Try to rearrange table melds to create new melds using a mix of table and
 * hand cards. This is what a real Rummikub player does — "manipulate the
 * bricks on the table".
 *
 * CRITICAL CORRECTNESS CONSTRAINT: the reducer requires every card that
 * was on the table at rearrange-start to STILL be on the table at commit
 * (`allCardsPresent` check in game-reducer.ts). This is the real Rummikub
 * rule — you cannot take a tile (including a joker) from the table back
 * to your hand. You can only relocate it to another table meld.
 *
 * So any "extraction" move MUST be paired with an immediate placement back
 * on the table (in a new meld or an extension of an existing one). The
 * previous implementation naively pushed the taken tile to `currentHand`
 * and hoped Step 2 would re-place it; when Step 2 didn't, self-validation
 * failed and the bot reverted silently — which is why players reported
 * "the bots never manipulate the table".
 */
function tryTableRearrangement(
  hand: Card[],
  melds: Meld[],
  _state: IsraeliRummyGameState,
): { hand: Card[]; melds: Meld[] } | null {
  let currentHand = [...hand];
  let currentMelds = melds.map(m => ({ ...m, cards: [...m.cards] }));
  let improved = false;

  const meldLimit = Math.min(currentMelds.length, MAX_TABLE_REARRANGE_MELDS);

  // ── Strategy A: Joker reclamation ──
  //
  // For each table meld that contains a joker, if the bot holds the real
  // card the joker represents, swap them — AND immediately use the freed
  // joker in a fresh meld on the table with 2+ more hand cards. The joker
  // never visits the hand (which would violate the reducer's conservation
  // rule). If no valid 3-card meld can be formed with the freed joker +
  // remaining hand cards, skip this meld (can't execute cleanly this turn).
  for (let mi = 0; mi < meldLimit && !overBudget(); mi++) {
    const meld = currentMelds[mi];
    const jokerIdx = meld.cards.findIndex(c => isJokerCard(c));
    if (jokerIdx === -1) continue;

    const replacementCard = findJokerReplacement(meld, jokerIdx);
    if (!replacementCard) continue;

    const handIdx = currentHand.findIndex(c =>
      c.suit === replacementCard.suit && c.rank === replacementCard.rank,
    );
    if (handIdx === -1) continue;

    const jokerCard = meld.cards[jokerIdx];
    const cardFromHand = currentHand[handIdx];
    const swappedMeld = [...meld.cards];
    swappedMeld[jokerIdx] = cardFromHand;
    if (!isValidMeld(swappedMeld).valid) continue;

    // Can we use the freed joker + remaining hand cards to form a new meld?
    //
    // CRITICAL (2-deck game): identify the table joker by REFERENCE, not by
    // cardKey. Two jokers of the same colour share their cardKey, so a
    // cardKey-based filter mis-assigns "this came from the hand" vs "this
    // came from the table" — breaking conservation and triggering a silent
    // selfValidateCommit revert. We put the table joker FIRST in the trial
    // hand so findPossibleMelds picks it as the "primary" joker for any new
    // meld it builds, then filter by `m.includes(jokerCard)` (===) to find
    // melds that actually use that exact tile.
    const handAfterSwap = [
      ...currentHand.slice(0, handIdx),
      ...currentHand.slice(handIdx + 1),
    ];
    const trialHand = [jokerCard, ...handAfterSwap];
    const newMelds = findPossibleMeldsCapped(trialHand);
    const meldsUsingTableJoker = newMelds.filter(m => m.includes(jokerCard));
    if (meldsUsingTableJoker.length === 0) continue;

    // Prefer the longest such meld — more cards placed, better hand reduction.
    meldsUsingTableJoker.sort((a, b) => b.length - a.length);
    const jokerUse = meldsUsingTableJoker[0];
    const { type: jokerUseType } = isValidMeld(jokerUse);
    const { type: swappedType } = isValidMeld(swappedMeld);

    // Apply both changes atomically.
    currentMelds[mi] = {
      ...meld,
      cards: swappedMeld,
      type: swappedType ?? meld.type,
    };
    currentMelds = [
      ...currentMelds,
      {
        id: `ai_meld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        cards: jokerUse,
        type: jokerUseType ?? 'set',
      },
    ];
    // Hand cards consumed = everything in jokerUse except the table joker.
    const handCardsConsumed = jokerUse.filter(c => c !== jokerCard);
    currentHand = removeCardsFromHand(handAfterSwap, handCardsConsumed);
    improved = true;
  }

  // ── Strategy B: End / spare extraction that lands in a NEW table meld ──
  //
  // For each run of 4+ cards: try taking an end tile IF combining it with
  // 2+ hand cards forms a valid new meld. For each set of 4 cards: try
  // taking one tile under the same condition. The taken tile goes straight
  // into the new table meld, never to the hand — conservation preserved.
  for (let mi = 0; mi < meldLimit && !overBudget(); mi++) {
    const meld = currentMelds[mi];
    if (meld.cards.length <= 3) continue;

    const tryExtract = (
      takenCard: Card,
      remainingCards: Card[],
    ): boolean => {
      if (isJokerCard(takenCard)) return false;
      if (remainingCards.length < 3) return false;
      const remCheck = isValidMeld(remainingCards);
      if (!remCheck.valid) return false;

      // Find a possible new meld that includes the taken card.
      // Same 2-deck identity issue as Strategy A: put takenCard first so it
      // wins any cardKey duplicate during findPossibleMelds construction,
      // then filter by reference (===) to avoid mistaking a hand twin for
      // the table tile.
      const trialHand = [takenCard, ...currentHand];
      const newMelds = findPossibleMeldsCapped(trialHand);
      const candidates = newMelds.filter(m => m.includes(takenCard));
      if (candidates.length === 0) return false;
      candidates.sort((a, b) => b.length - a.length);
      const newMeld = candidates[0];
      const { type: newMeldType } = isValidMeld(newMeld);
      if (!newMeldType) return false;

      // Apply atomically: shrink the source meld AND place the new meld.
      currentMelds[mi] = {
        ...meld,
        cards: remainingCards,
        type: remCheck.type ?? meld.type,
      };
      currentMelds = [
        ...currentMelds,
        {
          id: `ai_meld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          cards: newMeld,
          type: newMeldType,
        },
      ];
      const handCardsUsed = newMeld.filter(c => c !== takenCard);
      currentHand = removeCardsFromHand(currentHand, handCardsUsed);
      improved = true;
      return true;
    };

    if (meld.type === 'run') {
      // Try each end. Only one extraction per meld.
      const leftCard = meld.cards[0];
      const rightCard = meld.cards[meld.cards.length - 1];
      if (tryExtract(rightCard, meld.cards.slice(0, -1))) continue;
      tryExtract(leftCard, meld.cards.slice(1));
      continue;
    }

    if (meld.type === 'set' && meld.cards.length === 4) {
      for (let ci = 0; ci < meld.cards.length; ci++) {
        const remaining = [
          ...meld.cards.slice(0, ci),
          ...meld.cards.slice(ci + 1),
        ];
        if (tryExtract(meld.cards[ci], remaining)) break;
      }
    }
  }

  if (!improved) return null;
  return { hand: currentHand, melds: currentMelds };
}

/**
 * Figure out what real card a joker represents in a meld.
 */
function findJokerReplacement(meld: Meld, jokerIdx: number): Card | null {
  const cards = meld.cards;

  if (meld.type === 'set') {
    // All non-jokers have the same rank; joker needs a missing suit
    const nonJokers = cards.filter(c => !isJokerCard(c));
    if (nonJokers.length === 0) return null;
    const rank = nonJokers[0].rank;
    const usedSuits = new Set(nonJokers.map(c => c.suit));
    for (const suit of STANDARD_SUITS) {
      if (!usedSuits.has(suit)) {
        return { suit, rank };
      }
    }
    return null;
  }

  if (meld.type === 'run') {
    // Figure out the position of the joker in the sequence
    const nonJokers = cards.filter(c => !isJokerCard(c));
    if (nonJokers.length === 0) return null;
    const suit = nonJokers[0].suit;

    // Build the expected rank sequence
    const sortedNonJokers = [...nonJokers].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));
    const minRank = rankOrder(sortedNonJokers[0].rank);

    // The joker at position jokerIdx in the meld represents rank (minRank + position offset)
    // But we need to figure out the actual positions
    let expectedRank = minRank;
    let jokerCount = 0;
    for (let i = 0; i < cards.length; i++) {
      if (i === jokerIdx) {
        // This is our joker — expectedRank is what it represents
        const rank = expectedRank as Rank;
        if (rank >= 1 && rank <= 14 && rank !== 0) {
          // Map back to proper Rank enum
          const actualRank = expectedRank === 1 ? Rank.ACE : expectedRank as Rank;
          return { suit, rank: actualRank };
        }
        return null;
      }
      if (isJokerCard(cards[i])) {
        jokerCount++;
      }
      expectedRank++;
    }
    void jokerCount;
    return null;
  }

  return null;
}

// ─── First meld helpers ─────────────────────────────────────────────────────

/**
 * Pick the best first-meld combo: prefer combos that use more cards
 * and leave the most flexible remaining hand.
 */
function pickBestFirstMeldCombo(combos: Card[][][], hand: Card[]): Card[][] {
  let best = combos[0];
  let bestScore = -Infinity;

  // Cap the number of combos we evaluate
  const maxEval = Math.min(combos.length, 50);
  for (let ci = 0; ci < maxEval; ci++) {
    const combo = combos[ci];
    const usedCards = combo.flat();
    const remaining = removeCardsFromHand(hand, usedCards);
    let score = 0;

    // Prefer combos that use more cards
    score += usedCards.length * 2;

    // Prefer combos that leave near-melds intact
    score += countNearMelds(remaining);

    // Prefer combos that leave flexible cards
    const jokerCount = remaining.filter(c => isJokerCard(c)).length;
    score += jokerCount * 3;

    // Big bonus if remaining hand is very small
    if (remaining.length <= 3) score += 10;

    if (score > bestScore) {
      bestScore = score;
      best = combo;
    }
  }

  return best;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMeld(cards: Card[]): Meld {
  const { type } = isValidMeld(cards);
  return {
    id: `ai_meld_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    cards,
    type: type ?? 'set',
  };
}

function removeCardsFromHand(hand: Card[], cardsToRemove: Card[]): Card[] {
  const remaining = [...hand];
  for (const card of cardsToRemove) {
    const key = cardKey(card);
    const idx = remaining.findIndex(c => cardKey(c) === key);
    if (idx !== -1) remaining.splice(idx, 1);
  }
  return remaining;
}

/**
 * Find combinations of melds that meet the first-meld threshold (30+ points)
 * AND include at least one run.
 */
function findFirstMeldCombos(possibleMelds: Card[][], threshold: number): Card[][][] {
  const results: Card[][][] = [];
  let iterations = 0;

  // Pre-cap the input to avoid huge loops. Use a fixed cap here — first-meld
  // search is combinatorial in the number of input melds and we don't want
  // it ballooning even when a hand has many candidate melds.
  const FIRST_MELD_INPUT_CAP = 40;
  const melds = possibleMelds.length > FIRST_MELD_INPUT_CAP
    ? possibleMelds.slice(0, FIRST_MELD_INPUT_CAP)
    : possibleMelds;

  // Try single melds first
  for (const meld of melds) {
    const points = meldPointValue(meld);
    const hasRun = isValidRun(meld);
    if (points >= threshold && hasRun) {
      results.push([meld]);
    }
  }

  if (results.length > 0) return results;

  // Try pairs of melds (one must be a run)
  for (let i = 0; i < melds.length; i++) {
    for (let j = i + 1; j < melds.length; j++) {
      if (++iterations > MAX_COMBO_ITERATIONS) return results;

      const keys1 = new Set(melds[i].map(c => cardKey(c)));
      const overlap = melds[j].some(c => keys1.has(cardKey(c)));
      if (overlap) continue;

      const totalPoints = meldPointValue(melds[i]) + meldPointValue(melds[j]);
      const hasRun = isValidRun(melds[i]) || isValidRun(melds[j]);
      if (totalPoints >= threshold && hasRun) {
        results.push([melds[i], melds[j]]);
      }
    }
  }

  if (results.length > 0) return results;

  // Try triples of melds (with iteration budget)
  for (let i = 0; i < melds.length; i++) {
    for (let j = i + 1; j < melds.length; j++) {
      const keys1 = new Set(melds[i].map(c => cardKey(c)));
      if (melds[j].some(c => keys1.has(cardKey(c)))) continue;

      for (let k = j + 1; k < melds.length; k++) {
        if (++iterations > MAX_COMBO_ITERATIONS) return results;

        const keys2 = new Set([...melds[i], ...melds[j]].map(c => cardKey(c)));
        if (melds[k].some(c => keys2.has(cardKey(c)))) continue;

        const totalPoints = meldPointValue(melds[i]) + meldPointValue(melds[j]) + meldPointValue(melds[k]);
        const hasRun = isValidRun(melds[i]) || isValidRun(melds[j]) || isValidRun(melds[k]);
        if (totalPoints >= threshold && hasRun) {
          results.push([melds[i], melds[j], melds[k]]);
        }
      }
    }
  }

  return results;
}
