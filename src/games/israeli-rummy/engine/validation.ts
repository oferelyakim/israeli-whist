import type { Card } from '../../../types/card';
import { Rank, Suit, STANDARD_SUITS } from '../../../types/card';
import type { Meld } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Check if a card is a joker */
export function isJokerCard(card: Card): boolean {
  return card.suit === Suit.JOKER_RED || card.suit === Suit.JOKER_BLACK;
}

/**
 * Card point value for Israeli Rummy:
 * A=1, 2-10=face value, J=11, Q=12, K=13, Joker=0
 */
export function cardPointValue(card: Card): number {
  if (isJokerCard(card)) return 0;
  if (card.rank === Rank.ACE) return 1;
  return card.rank; // 2–13
}

/** Rank order for runs. Ace low = 1, others = face value. */
function rankOrder(rank: Rank): number {
  if (rank === Rank.ACE) return 1;
  return rank;
}



// ─── Set validation ──────────────────────────────────────────────────────────

/**
 * Check if cards form a valid set: 3–4 cards of the same rank, different suits.
 * Jokers fill in. No two non-joker cards may share a suit.
 */
export function isValidSet(cards: Card[]): boolean {
  if (cards.length < 3 || cards.length > 4) return false;

  const jokers = cards.filter(c => isJokerCard(c));
  const nonJokers = cards.filter(c => !isJokerCard(c));

  if (nonJokers.length === 0) return false; // Need at least 1 real card

  // All non-joker cards must share the same rank
  const rank = nonJokers[0].rank;
  if (!nonJokers.every(c => c.rank === rank)) return false;

  // No two non-joker cards can share a suit
  const suits = nonJokers.map(c => c.suit);
  if (new Set(suits).size !== suits.length) return false;

  // Total cards must not exceed 4 (one per suit)
  if (nonJokers.length + jokers.length > 4) return false;

  return true;
}

// ─── Run validation ──────────────────────────────────────────────────────────

/**
 * Check if cards form a valid run: 3+ consecutive cards of the same suit.
 *
 * Positional interpretation: card order in the array determines joker values.
 * `cards[i]` must represent `base + i` for some base rank. Non-jokers anchor
 * the base; jokers take whatever value their position requires. All resulting
 * values must be in [1, 13] (Ace = 1 only; no wrap, no ace-high).
 *
 * Examples (with rank 1 = Ace):
 *   [🃏, 5♥, 6♥]    → base = 4, positions [4,5,6]         → valid
 *   [🃏, 🃏, 5♥]    → base = 3, positions [3,4,5]         → valid
 *   [🃏, 2♥, 3♥]    → base = 1, positions [1,2,3]         → valid
 *   [12♥, 🃏, 🃏]   → base = 12, positions [12,13,14]     → invalid (14 > 13)
 *   [🃏, 🃏, A♥]    → base = -1, positions [-1,0,1]       → invalid (< 1)
 *   [🃏, 🃏, 🃏]    → no anchor                           → invalid
 */
export function isValidRun(cards: Card[]): boolean {
  if (cards.length < 3) return false;

  const nonJokers = cards.filter(c => !isJokerCard(c));

  // Need at least one real card to anchor the run.
  if (nonJokers.length === 0) return false;

  // All non-joker cards must share the same standard suit.
  const suit = nonJokers[0].suit;
  if (!nonJokers.every(c => c.suit === suit)) return false;
  if ((STANDARD_SUITS as readonly Suit[]).indexOf(suit) === -1) return false;

  // Derive the base rank from each non-joker's position. All must agree.
  // base = rankOrder(cards[i].rank) - i  for every non-joker index i.
  let base: number | null = null;
  for (let i = 0; i < cards.length; i++) {
    if (isJokerCard(cards[i])) continue;
    const candidate = rankOrder(cards[i].rank) - i;
    if (base === null) base = candidate;
    else if (base !== candidate) return false; // positional mismatch (duplicate or non-consecutive)
  }

  if (base === null) return false; // defensive — covered by nonJokers.length check above

  // The run covers ranks [base, base + cards.length - 1]. All must lie in [1, 13].
  if (base < 1 || base + cards.length - 1 > 13) return false;

  return true;
}

// ─── Meld validation ─────────────────────────────────────────────────────────

/** Check if cards form a valid meld (set or run). */
export function isValidMeld(cards: Card[]): { valid: boolean; type: 'set' | 'run' | null } {
  if (isValidSet(cards)) return { valid: true, type: 'set' };
  if (isValidRun(cards)) return { valid: true, type: 'run' };
  return { valid: false, type: null };
}

/** Check that all melds on the table are valid. */
export function allMeldsValid(melds: Meld[]): boolean {
  return melds.every(m => isValidMeld(m.cards).valid);
}

/**
 * Find the index of a joker in `meldCards` that `droppedCard` can legally
 * replace. A replacement is legal only when the meld remains a valid set/run
 * after swapping the joker out and the dropped card in (at the same index).
 *
 * For runs, the dropped card's positional rank must equal base + jokerIndex.
 * For sets, the dropped card must share the set's rank and add a fresh suit.
 *
 * Returns the joker's index on success, or null if no replacement is possible.
 *
 * Notes on multi-joker melds: if multiple jokers are present, each is tested
 * in turn — the first one whose replacement yields a valid meld wins. The
 * meld must already be a valid meld to be eligible (we don't try to "heal"
 * invalid groups via replacement here).
 */
export function findJokerToReplace(meldCards: Card[], droppedCard: Card): number | null {
  if (isJokerCard(droppedCard)) return null;
  const pre = isValidMeld(meldCards);
  if (!pre.valid) return null;

  for (let i = 0; i < meldCards.length; i++) {
    if (!isJokerCard(meldCards[i])) continue;
    const next = meldCards.slice();
    next[i] = droppedCard;
    if (isValidMeld(next).valid) return i;
  }
  return null;
}

/**
 * Heuristic: could `card` plausibly belong in `meld`?
 * Used during DnD to decide whether to auto-attach a dropped card to a nearby meld.
 *
 * For a set (same rank): card rank matches AND card suit not already present.
 * For a run (same suit, consecutive): card suit matches AND rank is adjacent or fills a gap.
 * For jokers: always could fit (they're wild).
 * For incomplete groups (<3 cards): check if card shares rank (potential set) or suit+proximity (potential run).
 */
export function couldFitInMeld(card: Card, meld: Meld): boolean {
  if (isJokerCard(card)) return true;
  if (meld.cards.length === 0) return true;

  const nonJokers = meld.cards.filter(c => !isJokerCard(c));
  if (nonJokers.length === 0) return true; // all jokers — anything could fit

  // Detect meld shape from non-joker cards
  const allSameRank = nonJokers.every(c => c.rank === nonJokers[0].rank);
  const allSameSuit = nonJokers.every(c => c.suit === nonJokers[0].suit);

  if (allSameRank && !allSameSuit) {
    // Set-like: card must share rank and have a unique suit
    if (card.rank !== nonJokers[0].rank) return false;
    const existingSuits = new Set(nonJokers.map(c => c.suit));
    return !existingSuits.has(card.suit) && meld.cards.length < 4;
  }

  if (allSameSuit && !allSameRank) {
    // Run-like: card must share suit and rank within the extended range.
    // Jokers in the meld extend the reachable range by their count, since a
    // joker can represent any missing rank adjacent to the current span.
    if (card.suit !== nonJokers[0].suit) return false;
    const ranks = nonJokers.map(c => rankOrder(c.rank));
    const minR = Math.min(...ranks);
    const maxR = Math.max(...ranks);
    const jokerCount = meld.cards.length - nonJokers.length;
    const cr = rankOrder(card.rank);
    // Accept cards that either fill a gap inside [minR, maxR] or extend one
    // end by up to (jokerCount + 1) ranks.
    return cr >= minR - (jokerCount + 1) && cr <= maxR + (jokerCount + 1) && !ranks.includes(cr);
  }

  if (allSameRank && allSameSuit && nonJokers.length === 1) {
    // Single non-joker card: could be start of set or run
    if (card.rank === nonJokers[0].rank && card.suit !== nonJokers[0].suit) return true;  // potential set
    if (card.suit === nonJokers[0].suit) {
      const diff = Math.abs(rankOrder(card.rank) - rankOrder(nonJokers[0].rank));
      return diff <= 2; // within 2 ranks = potential run
    }
    return false;
  }

  // Fallback: check if adding makes a valid meld
  return isValidMeld([...meld.cards, card]).valid;
}

// ─── Point calculation ───────────────────────────────────────────────────────

/**
 * Calculate the point value of a meld for first-meld requirement.
 * Joker takes on the value of the card it represents in the meld.
 */
export function meldPointValue(cards: Card[]): number {
  const { type } = isValidMeld(cards);
  if (!type) return 0;

  if (type === 'set') {
    // All cards have the same rank. Joker = same rank value.
    const nonJokers = cards.filter(c => !isJokerCard(c));
    if (nonJokers.length === 0) return 0;
    const rankVal = cardPointValue(nonJokers[0]);
    return rankVal * cards.length;
  }

  // Run: positional interpretation. cards[i] represents base + i.
  // Derive base from any non-joker: base = rankOrder(c.rank) - index.
  let base: number | null = null;
  for (let i = 0; i < cards.length; i++) {
    if (isJokerCard(cards[i])) continue;
    base = rankOrder(cards[i].rank) - i;
    break;
  }
  if (base === null) return 0;

  let total = 0;
  for (let i = 0; i < cards.length; i++) {
    total += base + i;
  }
  return total;
}

// ─── First meld requirement ──────────────────────────────────────────────────

/**
 * Check whether a set of melds meets the first-meld requirement:
 * total point value >= threshold AND at least one run.
 */
export function meetsFirstMeldRequirement(melds: Card[][], threshold: number): boolean {
  if (melds.length === 0) return false;

  let totalPoints = 0;
  let hasRun = false;

  for (const m of melds) {
    const { valid, type } = isValidMeld(m);
    if (!valid) return false;
    totalPoints += meldPointValue(m);
    if (type === 'run') hasRun = true;
  }

  return totalPoints >= threshold && hasRun;
}

// ─── Lay off ─────────────────────────────────────────────────────────────────

/** Check if a single card can be laid off onto an existing meld. */
export function canLayOff(card: Card, meld: Meld): boolean {
  if (meld.type === 'set') {
    return isValidSet([...meld.cards, card]);
  }
  // Runs are positional: a layoff may extend the high end (append) OR the
  // low end (prepend). Either arrangement must pass isValidRun.
  return (
    isValidRun([...meld.cards, card]) ||
    isValidRun([card, ...meld.cards])
  );
}

// ─── Finding melds in a hand ─────────────────────────────────────────────────

/**
 * Find all possible melds (sets and runs) in a hand, including joker usage.
 * Returns an array of card arrays, each representing a valid meld.
 * Used by AI and for hints.
 */
export function findPossibleMelds(hand: Card[]): Card[][] {
  const melds: Card[][] = [];
  const jokers = hand.filter(c => isJokerCard(c));
  const nonJokers = hand.filter(c => !isJokerCard(c));

  // ── Find sets (group by rank) ──
  const byRank = new Map<Rank, Card[]>();
  for (const card of nonJokers) {
    const group = byRank.get(card.rank) ?? [];
    group.push(card);
    byRank.set(card.rank, group);
  }

  for (const [_rank, cards] of byRank) {
    // Deduplicate by suit for sets
    const uniqueSuits = new Map<Suit, Card>();
    for (const c of cards) {
      if (!uniqueSuits.has(c.suit)) uniqueSuits.set(c.suit, c);
    }
    const uniqueCards = Array.from(uniqueSuits.values());

    if (uniqueCards.length >= 3) {
      melds.push(uniqueCards.slice(0, 4)); // max 4 in a set
    } else if (uniqueCards.length === 2 && jokers.length > 0) {
      melds.push([...uniqueCards, jokers[0]]);
    }
  }

  // ── Find runs (group by suit, then find consecutive sequences) ──
  for (const suit of STANDARD_SUITS) {
    const suitCards = nonJokers
      .filter(c => c.suit === suit)
      .sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));

    // Remove duplicate ranks (keep first)
    const uniqueRanks: Card[] = [];
    const seenRanks = new Set<number>();
    for (const c of suitCards) {
      const ro = rankOrder(c.rank);
      if (!seenRanks.has(ro)) {
        seenRanks.add(ro);
        uniqueRanks.push(c);
      }
    }

    if (uniqueRanks.length < 2 && jokers.length === 0) continue;
    if (uniqueRanks.length < 1) continue;

    // Scan for consecutive sequences with gaps <= available jokers.
    // Build the run with jokers interleaved in their POSITIONAL slots so the
    // result passes the positional isValidRun check.
    for (let start = 0; start < uniqueRanks.length; start++) {
      const runOrdered: Card[] = [uniqueRanks[start]];
      let jokersUsed = 0;

      for (let next = start + 1; next < uniqueRanks.length; next++) {
        const gap = rankOrder(uniqueRanks[next].rank) - rankOrder(uniqueRanks[next - 1].rank) - 1;
        if (gap < 0) continue; // duplicate rank
        if (jokersUsed + gap <= jokers.length) {
          // Insert `gap` jokers between the previous and next card.
          for (let g = 0; g < gap; g++) {
            runOrdered.push(jokers[jokersUsed + g]);
          }
          jokersUsed += gap;
          runOrdered.push(uniqueRanks[next]);
        } else {
          break;
        }
      }

      if (runOrdered.length >= 3) {
        melds.push(runOrdered);
      }
    }
  }

  return melds;
}

// ─── Meld card ordering ─────────────────────────────────────────────────────

/**
 * Sort meld cards for display: jokers placed in their logical position.
 * For runs: jokers fill gaps between non-joker cards.
 * For sets: jokers go at the end.
 * For invalid/partial melds: sort by rank with jokers at end (best effort).
 */
export function sortMeldCards(cards: Card[]): Card[] {
  if (cards.length === 0) return cards;

  const jokers = cards.filter(c => isJokerCard(c));
  const nonJokers = cards.filter(c => !isJokerCard(c));

  if (nonJokers.length === 0) return cards;

  const { type } = isValidMeld(cards);

  if (type === 'set') {
    const so: Record<string, number> = { CLUBS: 0, DIAMONDS: 1, HEARTS: 2, SPADES: 3 };
    const sorted = [...nonJokers].sort((a, b) => (so[a.suit] ?? 0) - (so[b.suit] ?? 0));
    return [...sorted, ...jokers];
  }

  // For runs (valid or not): sort non-jokers by rank, place jokers in gaps
  // Determine if all non-jokers share a suit (run-like)
  const allSameSuit = nonJokers.every(c => c.suit === nonJokers[0].suit);

  if (type === 'run' || allSameSuit) {
    // Ace = 1 only — always sort ace-low.
    const sorted = [...nonJokers].sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));

    // Build sequence: place jokers in gaps between consecutive cards
    const result: Card[] = [];
    let jokerIdx = 0;

    for (let i = 0; i < sorted.length; i++) {
      result.push(sorted[i]);
      if (i < sorted.length - 1) {
        const gap = rankOrder(sorted[i + 1].rank) - rankOrder(sorted[i].rank) - 1;
        for (let g = 0; g < gap && jokerIdx < jokers.length; g++) {
          result.push(jokers[jokerIdx++]);
        }
      }
    }

    // Distribute any remaining jokers at the ends. Prefer extending the HIGH
    // end when room exists there; if the current high end is at the top of the
    // range (K = 13), spill to the LOW end instead. This keeps runs in-range
    // and mirrors the positional validator so sortMeldCards output re-validates.
    const jokersLeft = jokers.length - jokerIdx;
    const minRank = result.length > 0 && !isJokerCard(result[0]) ? rankOrder(result[0].rank) : 1;
    const maxRank = result.length > 0 && !isJokerCard(result[result.length - 1])
      ? rankOrder(result[result.length - 1].rank)
      : 13;

    // Spill to the low end first if extending high would overflow (max > 13).
    const highRoom = Math.max(0, 13 - maxRank);
    const lowRoom = Math.max(0, minRank - 1);

    // Default: extend high first (preserves prior behavior for ordinary runs
    // like [5H, 6H] + joker → [5H, 6H, J]). Only spill low for the overflow case.
    const extendHigh = Math.min(jokersLeft, highRoom);
    let extendLow = jokersLeft - extendHigh;
    if (extendLow > lowRoom) {
      // Can't fit — still lay out in a stable order for display.
      extendLow = lowRoom;
    }

    for (let g = 0; g < extendLow && jokerIdx < jokers.length; g++) {
      result.unshift(jokers[jokerIdx++]);
    }
    for (let g = 0; g < extendHigh && jokerIdx < jokers.length; g++) {
      result.push(jokers[jokerIdx++]);
    }
    // Any leftover (couldn't be legally placed) — append at end.
    while (jokerIdx < jokers.length) {
      result.push(jokers[jokerIdx++]);
    }

    return result;
  }

  // Fallback for invalid/mixed melds: sort by rank, jokers at end
  nonJokers.sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));
  return [...nonJokers, ...jokers];
}

// ─── Sorting helpers ─────────────────────────────────────────────────────────

const SUIT_ORDER: Record<string, number> = {
  CLUBS: 0, DIAMONDS: 1, HEARTS: 2, SPADES: 3,
  JOKER_RED: 4, JOKER_BLACK: 5,
};

/**
 * Find cards that form valid sets (3+ cards of the same rank with unique suits) in hand.
 * In a double deck, 2 K♣ + 2 K♠ is NOT a valid set (duplicate suits).
 * Returns [setCards, remainingCards]. Jokers are always in remaining.
 */
function extractSets(hand: Card[]): [Card[], Card[]] {
  const jokers = hand.filter(c => isJokerCard(c));
  const nonJokers = hand.filter(c => !isJokerCard(c));

  // Group by rank
  const byRank = new Map<Rank, Card[]>();
  for (const c of nonJokers) {
    const group = byRank.get(c.rank) ?? [];
    group.push(c);
    byRank.set(c.rank, group);
  }

  const setCards: Card[] = [];
  const remaining: Card[] = [];

  for (const [_rank, cards] of byRank) {
    // Deduplicate by suit — pick one card per suit for the set
    const bySuit = new Map<string, Card>();
    const extras: Card[] = [];
    for (const c of cards) {
      if (!bySuit.has(c.suit)) {
        bySuit.set(c.suit, c);
      } else {
        extras.push(c);
      }
    }
    const uniqueSuitCards = Array.from(bySuit.values());
    if (uniqueSuitCards.length >= 3) {
      setCards.push(...uniqueSuitCards);
      remaining.push(...extras);
    } else {
      remaining.push(...cards);
    }
  }

  // Sort set cards by rank, then by suit within each rank
  setCards.sort((a, b) => {
    const rankDiff = rankOrder(a.rank) - rankOrder(b.rank);
    if (rankDiff !== 0) return rankDiff;
    return (SUIT_ORDER[a.suit] ?? 0) - (SUIT_ORDER[b.suit] ?? 0);
  });

  return [setCards, [...remaining, ...jokers]];
}

/** Sort hand by suit then rank. Sets (3+ same rank) first, then remaining by suit ascending. Jokers at the end. */
export function sortBySuit(hand: Card[]): Card[] {
  const [setCards, remaining] = extractSets(hand);

  remaining.sort((a, b) => {
    if (isJokerCard(a) && !isJokerCard(b)) return 1;
    if (!isJokerCard(a) && isJokerCard(b)) return -1;
    if (isJokerCard(a) && isJokerCard(b)) return 0;
    const suitDiff = (SUIT_ORDER[a.suit] ?? 0) - (SUIT_ORDER[b.suit] ?? 0);
    if (suitDiff !== 0) return suitDiff;
    return rankOrder(a.rank) - rankOrder(b.rank);
  });

  return [...setCards, ...remaining];
}

/**
 * Find cards that form valid runs (3+ consecutive cards of same suit) in hand.
 * Returns [runCards, remainingCards]. Jokers are always in remaining.
 */
function extractRuns(hand: Card[]): [Card[], Card[]] {
  const jokers = hand.filter(c => isJokerCard(c));
  const nonJokers = hand.filter(c => !isJokerCard(c));

  const runCards: Card[] = [];
  const usedIndices = new Set<number>();

  // Group by suit
  for (const suit of STANDARD_SUITS) {
    const suitCards = nonJokers
      .map((c, idx) => ({ card: c, origIdx: idx }))
      .filter(({ card }) => card.suit === suit)
      .sort((a, b) => rankOrder(a.card.rank) - rankOrder(b.card.rank));

    if (suitCards.length < 3) continue;

    // Find longest consecutive runs greedily
    let i = 0;
    while (i < suitCards.length) {
      // Start a consecutive sequence
      const run = [suitCards[i]];
      let j = i + 1;
      while (j < suitCards.length) {
        const prevRank = rankOrder(suitCards[j - 1].card.rank);
        const curRank = rankOrder(suitCards[j].card.rank);
        if (curRank === prevRank + 1) {
          run.push(suitCards[j]);
          j++;
        } else if (curRank === prevRank) {
          // Duplicate rank (double deck) — skip
          j++;
        } else {
          break;
        }
      }

      if (run.length >= 3) {
        for (const entry of run) {
          runCards.push(entry.card);
          usedIndices.add(entry.origIdx);
        }
      }
      i = j;
    }
  }

  // Sort run cards by suit then rank for display
  runCards.sort((a, b) => {
    const suitDiff = (SUIT_ORDER[a.suit] ?? 0) - (SUIT_ORDER[b.suit] ?? 0);
    if (suitDiff !== 0) return suitDiff;
    return rankOrder(a.rank) - rankOrder(b.rank);
  });

  const remaining = nonJokers.filter((_, idx) => !usedIndices.has(idx));
  return [runCards, [...remaining, ...jokers]];
}

/**
 * Sort hand with runs (3+ consecutive same suit) highlighted first,
 * then remaining cards sorted by rank ascending.
 * Within the same rank, sort by suit.
 */
export function sortBySequence(hand: Card[]): Card[] {
  const [runCards, remaining] = extractRuns(hand);

  remaining.sort((a, b) => {
    if (isJokerCard(a) && !isJokerCard(b)) return 1;
    if (!isJokerCard(a) && isJokerCard(b)) return -1;
    if (isJokerCard(a) && isJokerCard(b)) return 0;
    const rankDiff = rankOrder(a.rank) - rankOrder(b.rank);
    if (rankDiff !== 0) return rankDiff;
    return (SUIT_ORDER[a.suit] ?? 0) - (SUIT_ORDER[b.suit] ?? 0);
  });

  return [...runCards, ...remaining];
}
