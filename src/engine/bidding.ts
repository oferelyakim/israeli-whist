import type { StandardSuit } from '../types/card';
import type { BiddingState, PlayerSeat, AuctionBid } from '../types/game';
import { HAND_SIZE, nextSeat, compareAuctionBids } from '../types/game';

export function getMinThreshold(exchangeRound: number): number {
  return 5 + exchangeRound;
}

export function getTotalBids(bids: (number | null)[]): number {
  return bids.reduce((sum: number, b) => sum + (b ?? 0), 0);
}

export function getBiddingOrder(dealerSeat: PlayerSeat): PlayerSeat[] {
  const order: PlayerSeat[] = [];
  for (let i = 1; i <= 4; i++) {
    order.push(((dealerSeat + i) % 4) as PlayerSeat);
  }
  return order;
}

// --- Auction phase validation ---

/**
 * Validates an auction bid.
 * amount = 0 means pass.
 * amount >= minThreshold with a suit that beats current highest means a valid auction bid.
 */
export function validateAuctionBid(
  bidding: BiddingState,
  seat: PlayerSeat,
  amount: number,
  suit?: StandardSuit
): string | null {
  if (seat !== bidding.currentBidder) return 'Not your turn to bid';
  // Pass
  if (amount === 0) return null;
  if (!Number.isInteger(amount) || amount < 0 || amount > HAND_SIZE) return 'Bid must be 0-13';
  if (amount < bidding.minThreshold) return `Bid must be at least ${bidding.minThreshold}`;
  if (suit === undefined) return 'Must specify a suit';
  // Must beat current highest
  if (bidding.highestBid !== null) {
    const newBid: AuctionBid = { amount, suit };
    if (compareAuctionBids(newBid, bidding.highestBid) <= 0) {
      return 'Bid must be higher than current highest bid';
    }
  }
  return null;
}

// --- Raise phase validation ---

/**
 * Validates a raise bid. The winner can keep their current bid or raise it higher.
 * Must be >= current highestBid amount (i.e., their winning auction bid amount).
 */
export function validateRaise(
  bidding: BiddingState,
  seat: PlayerSeat,
  amount: number
): string | null {
  if (seat !== bidding.highestBidder) {
    return 'Only the auction winner can raise';
  }

  if (!Number.isInteger(amount) || amount < 0 || amount > HAND_SIZE) {
    return `Bid must be 0-${HAND_SIZE}`;
  }

  const minAmount = bidding.highestBid?.amount ?? 0;
  if (amount < minAmount) {
    return `Raise must be at least your current bid (${minAmount})`;
  }

  return null;
}

// --- Declaring phase validation ---

/**
 * Returns whether this seat is the last declarer (the 3rd of the 3 non-winner players).
 */
export function isLastDeclarer(bidding: BiddingState, trumpCaller: PlayerSeat): boolean {
  const order = getDeclarationOrder(trumpCaller);
  const declaredCount = order.filter((s) => bidding.bids[s] !== null).length;
  return declaredCount === 2; // 2 already declared, this one is the 3rd (last)
}

/**
 * Returns the bid value the last declarer CANNOT choose (would make total = 13).
 */
export function getRestrictedBid(bids: (number | null)[]): number | null {
  const total = getTotalBids(bids);
  const restricted = HAND_SIZE - total;
  if (restricted >= 0 && restricted <= HAND_SIZE) {
    return restricted;
  }
  return null;
}

/**
 * Validates a declaration (trick expectation by non-winner players).
 * Last declarer cannot make total bids = 13.
 */
export function validateDeclare(
  bidding: BiddingState,
  seat: PlayerSeat,
  amount: number,
  trumpCaller: PlayerSeat
): string | null {
  if (seat === trumpCaller) {
    return 'Trump caller does not declare (already bid via raise)';
  }

  if (seat !== bidding.currentBidder) {
    return 'Not your turn to declare';
  }

  if (!Number.isInteger(amount) || amount < 0 || amount > HAND_SIZE) {
    return `Declaration must be 0-${HAND_SIZE}`;
  }

  if (isLastDeclarer(bidding, trumpCaller)) {
    const restricted = getRestrictedBid(bidding.bids);
    if (restricted !== null && amount === restricted) {
      return `Cannot declare ${amount}: total would equal 13`;
    }
  }

  return null;
}

// --- Utility functions ---

/**
 * Determines if exchange is needed (nobody placed a bid -- all passed).
 */
export function shouldExchange(bidding: BiddingState): boolean {
  return bidding.highestBidder === null;
}

/**
 * Finds the trump caller from auction bids - player with highest bid >= threshold.
 */
export function findTrumpCaller(
  auctionBids: (number | null)[],
  minThreshold: number,
  biddingOrder: PlayerSeat[]
): PlayerSeat | null {
  let maxBid = -1;
  let winner: PlayerSeat | null = null;
  for (const seat of biddingOrder) {
    const bid = auctionBids[seat];
    if (bid !== null && bid >= minThreshold && bid > maxBid) {
      maxBid = bid;
      winner = seat;
    }
  }
  return winner;
}

/**
 * Returns the declaration order: 3 players clockwise from the trump caller,
 * skipping the trump caller themselves.
 */
export function getDeclarationOrder(trumpCaller: PlayerSeat): PlayerSeat[] {
  const order: PlayerSeat[] = [];
  let seat = nextSeat(trumpCaller);
  for (let i = 0; i < 3; i++) {
    order.push(seat);
    seat = nextSeat(seat);
  }
  return order;
}
