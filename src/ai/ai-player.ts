import type { Card, CardKey, StandardSuit } from '../types/card';
import { Suit, Rank, SUITS, cardKey } from '../types/card';
import type { GameState, GameAction, PlayerSeat, RoundState, AuctionBid } from '../types/game';
import { GamePhase, HAND_SIZE, SUIT_RANK, compareAuctionBids } from '../types/game';
import { evaluateHand, getBestTrumpSuit } from './hand-evaluation';
import { getPlayableCards } from '../engine/trick';
import { isLastDeclarer, getRestrictedBid } from '../engine/bidding';
import { EXCHANGE_CARD_COUNT } from '../engine/exchange';

// ─── Main entry point ───────────────────────────────────────────────

export function getAIAction(state: GameState, seat: PlayerSeat): GameAction | null {
  const round = state.currentRound;

  switch (round.phase) {
    case GamePhase.BIDDING:
      if (round.bidding.currentBidder === seat) {
        return getAIAuctionBid(round, seat);
      }
      return null;

    case GamePhase.EXCHANGING:
      if (round.exchange && round.exchange.discards[seat] === null) {
        return getAIDiscard(round, seat);
      }
      return null;

    case GamePhase.TRUMP_SELECTION:
      if (round.trumpCaller === seat) {
        return getAITrumpChoice(round, seat);
      }
      return null;

    case GamePhase.RAISE:
      if (round.trumpCaller === seat) {
        return getAIRaise(round, seat);
      }
      return null;

    case GamePhase.DECLARING:
      if (round.bidding.currentBidder === seat) {
        return getAIDeclare(round, seat);
      }
      return null;

    case GamePhase.PLAYING:
      if (round.currentPlayer === seat) {
        return getAIPlay(round, seat);
      }
      return null;

    default:
      return null;
  }
}

// ─── Card counting utilities ────────────────────────────────────────

/**
 * How many recent tricks the AI remembers for card-by-card tracking.
 * A real player doesn't perfectly recall every card from trick 1.
 * We give the AI decent-but-imperfect memory: last 5 tricks + current trick.
 * (Void detection uses all tricks — remembering someone showed out is natural.)
 */
const AI_MEMORY_TRICKS = 5;

/** Build a set of "suit_rank" keys for recently played cards (imperfect memory). */
function getPlayedCardSet(round: RoundState): Set<string> {
  const played = new Set<string>();
  // Only remember the last AI_MEMORY_TRICKS completed tricks
  const startIdx = Math.max(0, round.completedTricks.length - AI_MEMORY_TRICKS);
  for (let i = startIdx; i < round.completedTricks.length; i++) {
    for (const pc of round.completedTricks[i].cards) {
      played.add(`${pc.card.suit}_${pc.card.rank}`);
    }
  }
  // Always remember the current trick (it's right in front of you)
  for (const pc of round.currentTrick.cards) {
    played.add(`${pc.card.suit}_${pc.card.rank}`);
  }
  return played;
}

/**
 * Is this card the highest remaining in its suit?
 * A "master" card is guaranteed to win its suit.
 */
function isCardMaster(card: Card, round: RoundState, myHand: Card[]): boolean {
  const played = getPlayedCardSet(round);
  for (let rank = card.rank + 1; rank <= Rank.ACE; rank++) {
    const key = `${card.suit}_${rank}`;
    // If a higher card exists that's not played and not in my hand, someone else has it
    if (!played.has(key) && !myHand.some((c) => c.rank === rank && c.suit === card.suit)) {
      return false;
    }
  }
  return true;
}

/** Count how many cards of a suit are still held by opponents. */
function countOpponentCardsInSuit(
  suit: StandardSuit,
  round: RoundState,
  myHand: Card[],
): number {
  const played = getPlayedCardSet(round);
  let count = 0;
  for (let rank = Rank.TWO; rank <= Rank.ACE; rank++) {
    const key = `${suit}_${rank}`;
    if (!played.has(key) && !myHand.some((c) => c.rank === rank && c.suit === suit)) {
      count++;
    }
  }
  return count;
}

/** Check if a specific opponent showed out of a suit (played off-suit when it was led). */
function opponentShownOut(
  round: RoundState,
  opponentSeat: PlayerSeat,
  suit: StandardSuit,
): boolean {
  for (const trick of round.completedTricks) {
    if (trick.leadSuit === suit) {
      const play = trick.cards.find((pc) => pc.seat === opponentSeat);
      if (play && play.card.suit !== suit) {
        return true; // They couldn't follow suit
      }
    }
  }
  return false;
}

/** Get current total of all declared bids. */
function getTotalDeclaredBids(round: RoundState): number {
  return round.players.reduce((sum, p) => sum + (p.bid ?? 0), 0);
}


/**
 * In under-games (total bids ≤ 12), there are surplus tricks nobody wants.
 * The AI should play cautiously early — dumping losable cards first — then
 * switch to aggressive play when the margin tightens.
 *
 * The caution threshold scales with bid size:
 *   Low bid (1-3):    stay cautious while margin ≥ 4
 *   Medium bid (4-6): stay cautious while margin ≥ 3
 *   High bid (7+):    stay cautious while margin ≥ 2
 */
function shouldPlayCautiously(
  round: RoundState,
  tricksNeeded: number,
  myBid: number,
  totalBids: number,
): boolean {
  if (totalBids > 12) return false;
  if (tricksNeeded <= 0) return false;

  const tricksRemaining = 13 - round.completedTricks.length;
  const margin = tricksRemaining - tricksNeeded;

  let threshold: number;
  if (myBid <= 3) threshold = 4;
  else if (myBid <= 6) threshold = 3;
  else threshold = 2;

  return margin >= threshold;
}

// ─── Auction bidding ────────────────────────────────────────────────

function getAIAuctionBid(round: RoundState, seat: PlayerSeat): GameAction {
  const hand = round.players[seat].hand;
  const eval_ = evaluateHand(hand);

  const threshold = round.bidding.minThreshold;
  const highestBid = round.bidding.highestBid;
  const bestSuit = getBestTrumpSuit(hand);

  // Decide whether to bid in the auction
  // Need a decent hand to want to call trump:
  // - Good expected tricks AND
  // - A clear long suit to call as trump
  const wantsToBid =
    eval_.expectedTricks >= threshold - 1.5 && eval_.longestSuitLength >= 4;

  if (wantsToBid) {
    // Start with expected tricks (rounded), capped by threshold
    let bidAmount = Math.max(threshold, Math.round(eval_.expectedTricks));

    // Must beat the current highest bid
    if (highestBid !== null) {
      const newBid: AuctionBid = { amount: bidAmount, suit: bestSuit };
      if (compareAuctionBids(newBid, highestBid) <= 0) {
        // Try one higher
        bidAmount = highestBid.amount + 1;
      }
    }

    // Don't overbid beyond what the hand can support
    const maxBid = Math.min(Math.round(eval_.expectedTricks + 1.2), HAND_SIZE);
    bidAmount = Math.min(bidAmount, maxBid);

    if (bidAmount >= threshold) {
      const newBid: AuctionBid = { amount: bidAmount, suit: bestSuit };
      if (highestBid === null || compareAuctionBids(newBid, highestBid) > 0) {
        return { type: 'BID', seat, amount: bidAmount, suit: bestSuit };
      }

      // If same amount doesn't beat due to suit ranking, try amount + 1
      if (
        highestBid !== null &&
        bidAmount === highestBid.amount &&
        SUIT_RANK[bestSuit] <= SUIT_RANK[highestBid.suit]
      ) {
        const raisedAmount = bidAmount + 1;
        if (raisedAmount <= maxBid) {
          return { type: 'BID', seat, amount: raisedAmount, suit: bestSuit };
        }
      }
    }
  }

  // Pass
  return { type: 'BID', seat, amount: 0 };
}

// ─── Exchange / discard ─────────────────────────────────────────────

function getAIDiscard(round: RoundState, seat: PlayerSeat): GameAction {
  const hand = round.players[seat].hand;

  // Strategy: discard to create voids while protecting honor combinations
  // 1. Keep long suits intact (they have ruffing/length potential)
  // 2. Protect honor combos (AK, KQ, QJ)
  // 3. Discard low cards from short suits, preferably voiding a suit

  const suitCards: Record<string, Card[]> = {};
  for (const suit of SUITS) {
    suitCards[suit] = hand.filter((c) => c.suit === suit);
  }

  // Score each card for "discard desirability" (higher = more desirable to discard)
  const scored = hand.map((card) => {
    const suit = card.suit as StandardSuit;
    const suitLen = suitCards[suit].length;
    let score = 0;

    // Prefer discarding from short suits (to create voids)
    if (suitLen === 1) score += 15; // Singleton: discard to create void
    if (suitLen === 2) score += 10; // Doubleton
    if (suitLen === 3) score += 5;

    // Prefer discarding low cards
    score += (Rank.ACE - card.rank) * 0.5;

    // Penalize discarding high honors (keep them)
    if (card.rank === Rank.ACE) score -= 20;
    if (card.rank === Rank.KING) score -= 12;

    // Penalize breaking protected honors
    const suitHand = suitCards[suit];
    const hasAce = suitHand.some((c) => c.rank === Rank.ACE);
    const hasKing = suitHand.some((c) => c.rank === Rank.KING);
    const hasQueen = suitHand.some((c) => c.rank === Rank.QUEEN);

    // Don't discard a King that has an Ace above it (AK combo)
    if (card.rank === Rank.KING && hasAce) score -= 15;
    // Don't discard an Ace that has a King (AK combo)
    if (card.rank === Rank.ACE && hasKing) score -= 10;
    // Don't discard Queen from KQ
    if (card.rank === Rank.QUEEN && hasKing) score -= 8;
    // Don't discard Jack from QJ
    if (card.rank === Rank.JACK && hasQueen) score -= 5;

    // Penalize discarding from long suits (they're valuable)
    if (suitLen >= 5) score -= 8;
    if (suitLen >= 4) score -= 4;

    // Bonus: discarding a singleton honor is OK if it creates a void
    // (a bare King is better discarded than kept in exchange phase)
    if (suitLen === 1 && card.rank === Rank.KING && !hasAce) score += 5;
    if (suitLen === 1 && card.rank === Rank.QUEEN) score += 8;

    return { card, score };
  });

  // Sort by desirability (highest score = discard first)
  scored.sort((a, b) => b.score - a.score);

  const discards: CardKey[] = [];
  for (const { card } of scored) {
    if (discards.length >= EXCHANGE_CARD_COUNT) break;
    discards.push(cardKey(card));
  }

  return { type: 'SELECT_DISCARDS', seat, cards: discards };
}

// ─── Trump selection ────────────────────────────────────────────────

function getAITrumpChoice(round: RoundState, seat: PlayerSeat): GameAction {
  const hand = round.players[seat].hand;
  const suit = getBestTrumpSuit(hand);
  return { type: 'CHOOSE_TRUMP', seat, suit };
}

// ─── Raise bid ──────────────────────────────────────────────────────

function getAIRaise(round: RoundState, seat: PlayerSeat): GameAction {
  const hand = round.players[seat].hand;
  const trumpSuit = round.trumpSuit;
  const currentBid = round.bidding.highestBid?.amount ?? 0;

  // Evaluate hand with known trump
  const eval_ = evaluateHand(hand, trumpSuit);

  // Raise if hand is clearly stronger than current bid
  if (eval_.expectedTricks > currentBid + 1.2) {
    const raisedBid = Math.min(currentBid + 1, HAND_SIZE);
    return { type: 'RAISE_BID', seat, amount: raisedBid };
  }

  // Otherwise keep current bid
  return { type: 'RAISE_BID', seat, amount: currentBid };
}

// ─── Declaration ────────────────────────────────────────────────────

function getAIDeclare(round: RoundState, seat: PlayerSeat): GameAction {
  const hand = round.players[seat].hand;
  const trumpSuit = round.trumpSuit;

  // Evaluate hand with known trump
  const eval_ = evaluateHand(hand, trumpSuit);

  // Get current total bids (trump caller's bid + any already declared)
  const currentTotal = getTotalDeclaredBids(round);

  // How many players still haven't declared (including me)?
  const undeclaredCount = round.players.filter(
    (p) => p.bid === null && p.seat !== round.trumpCaller,
  ).length;

  // Estimate whether the game will be "over" (>13) or "under" (<13)
  // Current total + my expected + estimated remaining
  const avgRemaining = undeclaredCount > 1 ? 3.2 : 0; // rough avg per remaining player
  const estimatedFinalTotal = currentTotal + eval_.expectedTricks + avgRemaining;
  const likelyOver = estimatedFinalTotal > 14;
  const likelyUnder = estimatedFinalTotal < 12;

  // ── Zero bid strategy ──
  // Zero in under game ("down"): +50 success, -50 failure -- very valuable
  // Zero in over game ("up"): +30 success, -30 failure -- still good
  const shouldConsiderZero = eval_.expectedTricks <= 2;

  if (shouldConsiderZero) {
    let wantZero = false;

    if (eval_.expectedTricks <= 0.5) {
      // Very weak hand: almost certainly can make zero
      wantZero = true;
    } else if (eval_.expectedTricks <= 1.5 && likelyUnder) {
      // Under game + weak hand: zero is worth the high reward (+50)
      wantZero = true;
    } else if (eval_.expectedTricks <= 1.0 && likelyOver) {
      // Over game + very weak hand: zero still worth it (+30)
      wantZero = true;
    }

    if (wantZero) {
      let declareAmount = 0;
      // Check last-declarer restriction
      if (isLastDeclarer(round.bidding, round.trumpCaller!)) {
        const restricted = getRestrictedBid(round.bidding.bids);
        if (restricted === 0) {
          declareAmount = 1; // Can't bid zero, bid 1 instead
        }
      }
      return { type: 'DECLARE', seat, amount: declareAmount };
    }
  }

  // ── Normal declaration ──
  // Adjust based on up/down dynamics
  let adjustment = 0;
  if (likelyOver) {
    // Over game: everyone competing for tricks, harder to make bid
    adjustment = -0.3;
  } else if (likelyUnder) {
    // Under game: excess tricks floating around, slightly easier
    adjustment = 0.2;
  }

  // Add slight randomness to prevent predictability
  let declareAmount = Math.round(
    eval_.expectedTricks + adjustment + (Math.random() - 0.5) * 0.8,
  );
  declareAmount = Math.max(0, Math.min(HAND_SIZE, declareAmount));

  // Apply last-declarer restriction
  if (isLastDeclarer(round.bidding, round.trumpCaller!)) {
    const restricted = getRestrictedBid(round.bidding.bids);
    if (restricted !== null && declareAmount === restricted) {
      // Adjust away from restricted value
      if (declareAmount > eval_.expectedTricks) {
        declareAmount = Math.max(0, declareAmount - 1);
      } else {
        declareAmount = Math.min(HAND_SIZE, declareAmount + 1);
      }
      // Double check we didn't land on restricted again
      if (declareAmount === restricted) {
        declareAmount = restricted > 0 ? restricted - 1 : restricted + 1;
      }
    }
  }

  declareAmount = Math.max(0, Math.min(HAND_SIZE, declareAmount));

  return { type: 'DECLARE', seat, amount: declareAmount };
}

// ─── Card play ──────────────────────────────────────────────────────

function getAIPlay(round: RoundState, seat: PlayerSeat): GameAction {
  const hand = round.players[seat].hand;
  const playable = getPlayableCards(hand, round.currentTrick.leadSuit);

  if (playable.length === 0) {
    throw new Error('No playable cards');
  }

  if (playable.length === 1) {
    return { type: 'PLAY_CARD', seat, card: cardKey(playable[0]) };
  }

  const player = round.players[seat];
  const bid = player.bid ?? 0;
  const tricksWon = player.tricksWon;
  const tricksNeeded = bid - tricksWon;
  const totalBids = getTotalDeclaredBids(round);

  let chosen: Card;

  if (round.currentTrick.cards.length === 0) {
    // Leading
    chosen = chooseLeadCard(playable, round, seat, tricksNeeded, bid, totalBids);
  } else {
    // Following
    chosen = chooseFollowCard(playable, round, seat, tricksNeeded, bid, totalBids);
  }

  return { type: 'PLAY_CARD', seat, card: cardKey(chosen) };
}

// ─── Lead card selection ────────────────────────────────────────────

function chooseLeadCard(
  playable: Card[],
  round: RoundState,
  seat: PlayerSeat,
  tricksNeeded: number,
  myBid: number,
  totalBids: number,
): Card {
  const trumpSuit = round.trumpSuit;
  const hand = round.players[seat].hand;

  // ── Zero bid: lead to lose ──
  if (myBid === 0) {
    return chooseLeadForZeroBid(playable, round, seat);
  }

  if (tricksNeeded > 0 && shouldPlayCautiously(round, tricksNeeded, myBid, totalBids)) {
    // ── Under-game caution: dump losable cards first, save winners for later ──
    // Lead the lowest-rank non-master from a short non-trump suit.
    // Low cards (3, 4, 5) almost always lose; mid-rank cards (9, J) might
    // accidentally win, so we save those for dumping when following.
    const nonMasters = playable.filter((c) => !isCardMaster(c, round, hand));
    const candidates = nonMasters.length > 0 ? nonMasters : playable;

    let bestCard: Card | null = null;
    let bestScore = -Infinity;
    for (const card of candidates) {
      const suitLen = hand.filter((c) => c.suit === card.suit).length;
      let score = -card.rank;                                     // lower rank = higher score
      if (card.suit === trumpSuit) score -= 10;                   // avoid leading trump
      if (suitLen <= 2) score += 3;                               // short suit bonus
      if (score > bestScore) {
        bestScore = score;
        bestCard = card;
      }
    }
    if (bestCard && nonMasters.length > 0) return bestCard;
    // If only masters remain, fall through to normal aggressive play
  }

  if (tricksNeeded > 0) {
    // ── Need more tricks ──

    // 1. Lead master cards (highest remaining in suit = guaranteed winner)
    const masters = playable.filter((c) => isCardMaster(c, round, hand));
    if (masters.length > 0) {
      // Prefer cashing non-trump masters first (save trumps)
      const nonTrumpMasters = masters.filter((c) => c.suit !== trumpSuit);
      if (nonTrumpMasters.length > 0) {
        return nonTrumpMasters.sort((a, b) => b.rank - a.rank)[0];
      }
      return masters.sort((a, b) => b.rank - a.rank)[0];
    }

    // 2. Consider leading trump to draw out opponents' trumps
    //    Good when we have long trump (4+) and want to exhaust opponents
    if (trumpSuit) {
      const myTrumps = playable.filter((c) => c.suit === trumpSuit);
      const oppTrumpsOut = countOpponentCardsInSuit(trumpSuit, round, hand);
      if (myTrumps.length >= 3 && oppTrumpsOut > 0 && oppTrumpsOut <= myTrumps.length + 1) {
        // Draw trumps: lead high trump
        return myTrumps.sort((a, b) => b.rank - a.rank)[0];
      }
    }

    // 3. Lead from strong suits (but avoid dangerous leads)
    const suitGroups = groupBySuit(playable);
    let bestLead: Card | null = null;
    let bestScore = -Infinity;

    for (const [suitStr, cards] of Object.entries(suitGroups)) {
      const suit = suitStr as StandardSuit;
      if (cards.length === 0) continue;

      const topCard = cards.sort((a, b) => b.rank - a.rank)[0];
      const hasAce = cards.some((c) => c.rank === Rank.ACE);
      const hasKing = cards.some((c) => c.rank === Rank.KING);

      // DON'T lead from Kx without Ace (King gets captured)
      if (hasKing && !hasAce && cards.length <= 2 && topCard.rank === Rank.KING) {
        continue;
      }

      let score = 0;
      score += cards.length * 2; // Prefer longer suits
      score += topCard.rank * 0.5; // Prefer higher top cards
      if (hasAce) score += 8; // Ace-led suits are strong
      if (suit === trumpSuit) score -= 3; // Slightly avoid leading trump

      if (score > bestScore) {
        bestScore = score;
        bestLead = topCard;
      }
    }

    if (bestLead) return bestLead;

    // Fallback: lead highest card
    return [...playable].sort((a, b) => b.rank - a.rank)[0];
  }

  // ── Don't need more tricks (already made bid or overbid risk) ──
  return chooseLeadToLose(playable, round, seat, totalBids);
}

/** Lead card selection when we've bid zero. */
function chooseLeadForZeroBid(
  playable: Card[],
  round: RoundState,
  seat: PlayerSeat,
): Card {
  const hand = round.players[seat].hand;

  // Lead low from short suits to minimize winning risk
  // Prefer suits where opponents have higher cards
  const scored = playable.map((card) => {
    let score = 0;
    // Lower rank = safer lead for zero bid
    score += (Rank.ACE - card.rank) * 3;
    // Shorter suit = fewer forced wins later
    const suitLen = hand.filter((c) => c.suit === card.suit).length;
    score += (5 - suitLen) * 2;
    // Penalty if card is a master (would win)
    if (isCardMaster(card, round, hand)) score -= 20;
    return { card, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].card;
}

/** Lead card selection when we don't need more tricks. */
function chooseLeadToLose(
  playable: Card[],
  round: RoundState,
  seat: PlayerSeat,
  totalBids: number,
): Card {
  const hand = round.players[seat].hand;
  const overGame = totalBids > 13;

  // Check for zero bidders we might want to "drop" (force tricks on them)
  const zeroBidders = round.players.filter(
    (p) => p.seat !== seat && p.bid === 0 && p.tricksWon === 0,
  );

  if (zeroBidders.length > 0 && overGame) {
    // In over game, try to drop zero bidders
    // Lead a suit where a zero bidder might be void (forced to trump or win)
    for (const zb of zeroBidders) {
      for (const card of playable) {
        if (opponentShownOut(round, zb.seat, card.suit as StandardSuit)) {
          // They showed out of this suit -- leading it forces them to trump or discard
          // Lead low in this suit
          const suitCards = playable
            .filter((c) => c.suit === card.suit)
            .sort((a, b) => a.rank - b.rank);
          if (suitCards.length > 0) return suitCards[0];
        }
      }
    }
  }

  // Default: lead low from shortest suit
  const sorted = [...playable].sort((a, b) => {
    const lenA = hand.filter((c) => c.suit === a.suit).length;
    const lenB = hand.filter((c) => c.suit === b.suit).length;
    if (lenA !== lenB) return lenA - lenB;
    return a.rank - b.rank;
  });
  return sorted[0];
}

// ─── Follow card selection ──────────────────────────────────────────

function chooseFollowCard(
  playable: Card[],
  round: RoundState,
  seat: PlayerSeat,
  tricksNeeded: number,
  myBid: number,
  totalBids: number,
): Card {
  const trick = round.currentTrick;
  const trumpSuit = round.trumpSuit;

  // Find current winning card in trick
  let winningRank = -1;
  let winningSuit: Suit | null = null;
  let winningSeat: PlayerSeat | null = null;
  for (const pc of trick.cards) {
    let isWinning = false;
    if (winningSuit === null) {
      isWinning = true;
    } else if (pc.card.suit === winningSuit) {
      isWinning = pc.card.rank > winningRank;
    } else if (trumpSuit && pc.card.suit === trumpSuit) {
      isWinning = winningSuit !== trumpSuit || pc.card.rank > winningRank;
    }
    if (isWinning) {
      winningRank = pc.card.rank;
      winningSuit = pc.card.suit;
      winningSeat = pc.seat;
    }
  }

  // Is the last player (4th to play) -- the trick result is final
  const isLastToPlay = trick.cards.length === 3;

  // ── Zero bid: avoid winning at all costs ──
  if (myBid === 0) {
    return chooseFollowForZeroBid(playable, winningRank, winningSuit, trumpSuit);
  }

  if (tricksNeeded > 0 && shouldPlayCautiously(round, tricksNeeded, myBid, totalBids)) {
    // ── Under-game caution: only take "free" wins, otherwise duck ──
    const winners = playable
      .filter((c) => {
        if (winningSuit && c.suit === winningSuit) return c.rank > winningRank;
        if (trumpSuit && c.suit === trumpSuit && winningSuit !== trumpSuit) return true;
        return false;
      })
      .sort((a, b) => a.rank - b.rank);

    if (isLastToPlay && winners.length > 0) {
      // Last to play: safe to take with cheapest winner
      return winners[0];
    }
    // Duck: play HIGHEST losing card to dump dangerous mid-rank cards (9, J)
    // while saving low cards (3, 4, 5) for ducking future leads
    const losers = playable
      .filter((c) => !winners.includes(c))
      .sort((a, b) => b.rank - a.rank);
    if (losers.length > 0) return losers[0];
    // Forced to win: play lowest winner
    return winners[0];
  }

  if (tricksNeeded > 0) {
    // ── Need more tricks: try to win ──

    // Find cards that can beat current winner
    const winners = playable
      .filter((c) => {
        if (winningSuit && c.suit === winningSuit) return c.rank > winningRank;
        if (trumpSuit && c.suit === trumpSuit && winningSuit !== trumpSuit) return true;
        return false;
      })
      .sort((a, b) => a.rank - b.rank);

    if (winners.length > 0) {
      if (isLastToPlay) {
        // Last to play: use cheapest winner (save high cards)
        return winners[0];
      }
      // Not last: might need to beat future players
      // Use cheapest winner that's reasonably safe
      // If only 1 more player after us, cheapest is fine
      if (trick.cards.length === 2) {
        return winners[0]; // 3rd to play, 1 more after
      }
      // 2nd to play, 2 more after -- use a stronger winner
      return winners.length >= 2 ? winners[Math.floor(winners.length / 2)] : winners[0];
    }

    // Can't win: play lowest card to minimize waste
    return [...playable].sort((a, b) => a.rank - b.rank)[0];
  }

  // ── Don't need more tricks: avoid winning ──
  return chooseFollowToLose(
    playable,
    round,
    seat,
    winningRank,
    winningSuit,
    winningSeat,
    trumpSuit,
    totalBids,
  );
}

/** Follow card when we've bid zero. */
function chooseFollowForZeroBid(
  playable: Card[],
  winningRank: number,
  winningSuit: Suit | null,
  trumpSuit: StandardSuit | null,
): Card {
  // Play highest card that still loses (duck under the winner)
  const losers = playable
    .filter((c) => {
      if (winningSuit && c.suit === winningSuit) return c.rank < winningRank;
      if (trumpSuit && c.suit === trumpSuit) return false; // Trump would win
      if (c.suit !== winningSuit) return true; // Off-suit non-trump loses
      return false;
    })
    .sort((a, b) => b.rank - a.rank); // Highest loser first (save low cards for later)

  if (losers.length > 0) return losers[0];

  // Forced to win: play lowest possible (minimize damage)
  return [...playable].sort((a, b) => a.rank - b.rank)[0];
}

/** Follow card when we don't need more tricks. */
function chooseFollowToLose(
  playable: Card[],
  round: RoundState,
  _seat: PlayerSeat,
  winningRank: number,
  winningSuit: Suit | null,
  winningSeat: PlayerSeat | null,
  trumpSuit: StandardSuit | null,
  totalBids: number,
): Card {
  const trick = round.currentTrick;
  const overGame = totalBids > 13;

  // Check if current winner is a zero bidder -- if so, we WANT to win (drop them)
  if (winningSeat !== null && overGame) {
    const winnerBid = round.players[winningSeat].bid ?? -1;
    if (winnerBid === 0 && round.players[winningSeat].tricksWon === 0) {
      // Zero bidder is winning! Try to let them win this trick (don't overtake)
      // Actually -- we want them to take the trick to bust their zero bid!
      // So DON'T win over them. Play a loser.
      const losers = playable
        .filter((c) => {
          if (winningSuit && c.suit === winningSuit) return c.rank < winningRank;
          if (trumpSuit && c.suit === trumpSuit) return false;
          if (c.suit !== trick.leadSuit) return true;
          return false;
        })
        .sort((a, b) => a.rank - b.rank);

      if (losers.length > 0) return losers[0];
    }
  }

  // Normal "don't need tricks" play: duck under the winner
  const losers = playable
    .filter((c) => {
      if (winningSuit && c.suit === winningSuit) return c.rank < winningRank;
      if (trumpSuit && c.suit === trumpSuit) return false; // Trump would win
      if (c.suit !== trick.leadSuit) return true; // Off-suit non-trump loses
      return false;
    })
    .sort((a, b) => a.rank - b.rank);

  if (losers.length > 0) return losers[0];

  // Forced to win: play lowest possible
  return [...playable].sort((a, b) => a.rank - b.rank)[0];
}

// ─── Utility ────────────────────────────────────────────────────────

function groupBySuit(cards: Card[]): Record<string, Card[]> {
  const groups: Record<string, Card[]> = {};
  for (const card of cards) {
    const s = card.suit as string;
    if (!groups[s]) groups[s] = [];
    groups[s].push(card);
  }
  return groups;
}
