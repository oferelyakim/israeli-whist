import type { Card, StandardSuit } from '../types/card';
import { Suit, Rank, SUITS } from '../types/card';

export interface HandEvaluation {
  expectedTricks: number;
  suitStrengths: Record<StandardSuit, number>;
  suitLengths: Record<StandardSuit, number>;
  voids: StandardSuit[];
  longestSuit: StandardSuit;
  longestSuitLength: number;
  highCardPoints: number;
}

const HIGH_CARD_VALUES: Partial<Record<Rank, number>> = {
  [Rank.ACE]: 4,
  [Rank.KING]: 3,
  [Rank.QUEEN]: 2,
  [Rank.JACK]: 1,
};

/**
 * Evaluate expected tricks for a suit based on honor combinations.
 *
 * Key principles from Israeli Whist strategy:
 * - Don't rely on Queen unless you also have the Jack
 * - Don't rely on the Jack alone
 * - Kx is about half a trick
 * - Long suits generate extra tricks once opponents run out
 */
function evaluateSuitTricks(cards: Card[], isTrump: boolean): number {
  if (cards.length === 0) return 0;

  const length = cards.length;
  const hasAce = cards.some((c) => c.rank === Rank.ACE);
  const hasKing = cards.some((c) => c.rank === Rank.KING);
  const hasQueen = cards.some((c) => c.rank === Rank.QUEEN);
  const hasJack = cards.some((c) => c.rank === Rank.JACK);
  const hasTen = cards.some((c) => c.rank === Rank.TEN);

  let tricks = 0;

  if (hasAce) {
    tricks += 0.9; // Ace is near-certain winner
    if (hasKing) {
      tricks += 0.85; // AK is very strong
      if (hasQueen) {
        tricks += 0.75; // AKQ
        if (hasJack) {
          tricks += 0.65; // AKQJ
          if (hasTen) tricks += 0.55; // AKQJT
        }
        // Extra length beyond AKQ: small cards likely to become winners
        if (length > 3) tricks += (length - 3) * 0.4;
      } else if (hasJack) {
        // AKJ -- missing Queen, J provides some backup
        tricks += 0.2;
      }
      // Extra length beyond AK (without Q)
      if (!hasQueen && length > 2) tricks += (length - 2) * 0.2;
    } else if (hasQueen) {
      // AQ (no K) -- finesse potential
      tricks += 0.35;
      if (hasJack) tricks += 0.15; // AQJ
    }
    // Ace alone in long suit
    if (!hasKing && !hasQueen && length >= 4) tricks += 0.15;
  } else if (hasKing) {
    // King without Ace
    if (length === 1) {
      tricks += 0.2; // Bare King -- vulnerable, likely caught by Ace
    } else if (length === 2) {
      tricks += 0.45; // Kx -- about half a trick
      if (hasQueen) tricks += 0.1; // KQ doubleton
    } else if (length === 3) {
      tricks += 0.55; // Kxx
      if (hasQueen) {
        tricks += 0.2; // KQx
        if (hasJack) tricks += 0.15; // KQJ
      }
    } else {
      // Kxxx+
      tricks += 0.6;
      if (hasQueen) {
        tricks += 0.25; // KQxx+
        if (hasJack) tricks += 0.15; // KQJx+
      }
    }
  } else if (hasQueen) {
    // Queen without A or K -- unreliable per strategy guide
    if (length === 1) {
      tricks += 0.05; // Bare Queen -- almost worthless
    } else if (length === 2) {
      tricks += 0.1; // Qx
      if (hasJack) tricks += 0.15; // QJ
    } else {
      tricks += 0.15; // Qxx+
      if (hasJack) {
        tricks += 0.2; // QJx -- decent per strategy
        if (hasTen) tricks += 0.1; // QJT
      }
    }
  } else if (hasJack) {
    // Jack without higher honors -- don't rely on it
    if (length >= 4) tricks += 0.1; // Only valuable in long suits
    if (hasTen && length >= 3) tricks += 0.05; // JT with length
  }

  // Long suit bonus: once opponents run out of suit, small cards win
  if (length >= 5) {
    tricks += (length - 4) * 0.45;
  } else if (length === 4 && tricks >= 1.5) {
    // Strong 4-card suit might yield an extra trick
    tricks += 0.2;
  }

  // Trump suit inherent bonus (trump always beats side suits)
  if (isTrump) {
    if (length >= 4) tricks += 0.3;
    if (length >= 5) tricks += 0.3;
  }

  return tricks;
}

export function evaluateHand(hand: Card[], trumpSuit?: StandardSuit | null): HandEvaluation {
  const suitCards: Record<StandardSuit, Card[]> = {
    [Suit.CLUBS]: [],
    [Suit.DIAMONDS]: [],
    [Suit.HEARTS]: [],
    [Suit.SPADES]: [],
  };

  let highCardPoints = 0;
  for (const card of hand) {
    suitCards[card.suit as StandardSuit].push(card);
    highCardPoints += HIGH_CARD_VALUES[card.rank] ?? 0;
  }

  const suitLengths: Record<StandardSuit, number> = {} as Record<StandardSuit, number>;
  const suitStrengths: Record<StandardSuit, number> = {} as Record<StandardSuit, number>;
  const voids: StandardSuit[] = [];
  let longestSuit: StandardSuit = Suit.SPADES;
  let longestSuitLength = 0;

  for (const suit of SUITS) {
    const cards = suitCards[suit];
    suitLengths[suit] = cards.length;

    if (cards.length === 0) {
      voids.push(suit);
      suitStrengths[suit] = 0;
      continue;
    }

    if (cards.length > longestSuitLength) {
      longestSuitLength = cards.length;
      longestSuit = suit;
    }

    const isTrump = trumpSuit ? suit === trumpSuit : false;
    suitStrengths[suit] = evaluateSuitTricks(cards, isTrump);
  }

  // Calculate expected tricks
  let expectedTricks = 0;
  for (const suit of SUITS) {
    expectedTricks += suitStrengths[suit];
  }

  // Ruffing potential: void/singleton in a side suit + trump = extra tricks
  if (trumpSuit) {
    const trumpLength = suitLengths[trumpSuit];
    const trumpStrength = suitStrengths[trumpSuit];
    // Ruffable trumps: those not already counted as trick winners
    const ruffableTrumps = Math.max(0, trumpLength - Math.ceil(trumpStrength));

    for (const v of voids) {
      if (v !== trumpSuit && ruffableTrumps > 0) {
        expectedTricks += Math.min(ruffableTrumps, 2) * 0.6;
      }
    }

    // Singleton bonus (one lead away from a void for ruffing)
    for (const suit of SUITS) {
      if (suit !== trumpSuit && suitLengths[suit] === 1 && ruffableTrumps > 0) {
        expectedTricks += 0.3;
      }
    }
  }

  return {
    expectedTricks: Math.round(expectedTricks * 10) / 10,
    suitStrengths,
    suitLengths,
    voids,
    longestSuit,
    longestSuitLength,
    highCardPoints,
  };
}

export function getBestTrumpSuit(hand: Card[]): StandardSuit {
  const eval_ = evaluateHand(hand);
  // Prefer longest suit, break ties with strength
  let best: StandardSuit = SUITS[0];
  let bestScore = -1;

  for (const suit of SUITS) {
    const score = eval_.suitLengths[suit] * 10 + eval_.suitStrengths[suit];
    if (score > bestScore) {
      bestScore = score;
      best = suit;
    }
  }
  return best;
}
