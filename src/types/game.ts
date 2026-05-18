import type { Card, CardKey, StandardSuit } from './card';
import { Suit } from './card';
import type { PlayerType } from './game-common';
// Re-export PlayerType from shared game-common for backward compat
export { PlayerType } from './game-common';

export interface AuctionBid {
  amount: number;
  suit: StandardSuit;
}

export const SUIT_RANK: Record<StandardSuit, number> = {
  [Suit.SPADES]: 3,
  [Suit.HEARTS]: 2,
  [Suit.DIAMONDS]: 1,
  [Suit.CLUBS]: 0,
};

export function compareAuctionBids(a: AuctionBid, b: AuctionBid): number {
  if (a.amount !== b.amount) return a.amount - b.amount;
  return SUIT_RANK[a.suit] - SUIT_RANK[b.suit];
}

export type PlayerSeat = 0 | 1 | 2 | 3;
export const ALL_SEATS: PlayerSeat[] = [0, 1, 2, 3];
export const HAND_SIZE = 13;
export const NUM_PLAYERS = 4;

export interface Player {
  seat: PlayerSeat;
  name: string;
  type: PlayerType;
  hand: Card[];
  tricksWon: number;
  bid: number | null;
  score: number;
  isConnected: boolean;
}

export enum GamePhase {
  LOBBY = 'LOBBY',
  DEALING = 'DEALING',
  BIDDING = 'BIDDING',
  EXCHANGING = 'EXCHANGING',
  TRUMP_SELECTION = 'TRUMP_SELECTION',
  RAISE = 'RAISE',
  DECLARING = 'DECLARING',
  PLAYING = 'PLAYING',
  TRICK_COMPLETE = 'TRICK_COMPLETE',
  SCORING = 'SCORING',
  ROUND_END = 'ROUND_END',
  GAME_OVER = 'GAME_OVER',
}

export interface PlayedCard {
  card: Card;
  seat: PlayerSeat;
}

export interface Trick {
  cards: PlayedCard[];
  leadSeat: PlayerSeat;
  leadSuit: StandardSuit | null;
  winnerSeat: PlayerSeat | null;
}

export interface AuctionHistoryEntry {
  seat: PlayerSeat;
  bid: AuctionBid | null; // null = pass
}

export interface BiddingState {
  auctionBids: (AuctionBid | null)[]; // Latest bid per player (null = never bid / passed)
  auctionTurnsTaken: number;
  consecutivePasses: number; // Consecutive passes since last bid
  auctionHistory: AuctionHistoryEntry[]; // Full auction log for display
  highestBid: AuctionBid | null;
  highestBidder: PlayerSeat | null;
  currentBidder: PlayerSeat;
  bids: (number | null)[]; // Final declarations (for scoring)
  exchangeRound: number;
  minThreshold: number;
}

export interface ExchangeState {
  discards: (CardKey[] | null)[];
  received: (Card[] | null)[];
  phase: 'SELECTING' | 'COMPLETE';
}

export interface RoundState {
  roundNumber: number;
  dealerSeat: PlayerSeat;
  phase: GamePhase;
  trumpSuit: StandardSuit | null;
  trumpCaller: PlayerSeat | null;
  bidding: BiddingState;
  exchange: ExchangeState | null;
  currentTrick: Trick;
  completedTricks: Trick[];
  trickNumber: number;
  currentPlayer: PlayerSeat;
  players: Player[];
}

export interface ScoreEntry {
  seat: PlayerSeat;
  bid: number;
  tricksTaken: number;
  roundScore: number;
  cumulativeScore: number;
  isZeroBid: boolean;
  totalBids: number;
}

export interface GameSettings {
  maxRounds: number | null;
  playerNames: string[];
  playerTypes: PlayerType[];
}

export interface GameState {
  gameId: string;
  currentRound: RoundState;
  scoreboard: ScoreEntry[][];
  settings: GameSettings;
  roundCount: number;
}

export type GameAction =
  | { type: 'START_GAME'; settings: GameSettings; seed?: number }
  | { type: 'DEAL'; seed: number }
  | { type: 'BID'; seat: PlayerSeat; amount: number; suit?: StandardSuit } // amount=0 = pass, amount>0 needs suit
  | { type: 'SELECT_DISCARDS'; seat: PlayerSeat; cards: CardKey[] }
  | { type: 'CHOOSE_TRUMP'; seat: PlayerSeat; suit: StandardSuit }
  | { type: 'RAISE_BID'; seat: PlayerSeat; amount: number }
  | { type: 'DECLARE'; seat: PlayerSeat; amount: number }
  | { type: 'PLAY_CARD'; seat: PlayerSeat; card: CardKey }
  | { type: 'COLLECT_TRICK' }
  | { type: 'NEXT_ROUND'; seed: number }
  | { type: 'END_GAME' };

export function nextSeat(seat: PlayerSeat): PlayerSeat {
  return ((seat + 1) % 4) as PlayerSeat;
}

export function prevSeat(seat: PlayerSeat): PlayerSeat {
  return ((seat + 3) % 4) as PlayerSeat;
}

export function getPlayerLeftOfDealer(dealerSeat: PlayerSeat): PlayerSeat {
  return nextSeat(dealerSeat);
}
