import type { CardKey, StandardSuit } from '../types/card';
import { parseCardKey, cardEquals } from '../types/card';
import type { GameState, GameAction, RoundState, PlayerSeat, Player, GameSettings, AuctionBid, BiddingState, Trick } from '../types/game';
import { GamePhase, nextSeat, getPlayerLeftOfDealer, HAND_SIZE } from '../types/game';
import { dealHands } from './deck';
import {
  validateAuctionBid, validateRaise, validateDeclare,
  getMinThreshold, getTotalBids, getDeclarationOrder,
} from './bidding';
import { validateDiscards, performExchange } from './exchange';
import { getPlayableCards, determineTrickWinner, createEmptyTrick } from './trick';
import { computeRoundScores } from './scoring';

export function createInitialGameState(settings: GameSettings): GameState {
  const players: Player[] = settings.playerNames.map((name, i) => ({
    seat: i as PlayerSeat,
    name,
    type: settings.playerTypes[i],
    hand: [],
    tricksWon: 0,
    bid: null,
    score: 0,
    isConnected: true,
  }));

  return {
    gameId: Math.random().toString(36).substring(2, 8).toUpperCase(),
    currentRound: createRoundState(0, 0 as PlayerSeat, players),
    scoreboard: [],
    settings,
    roundCount: 0,
  };
}

function createRoundState(
  roundNumber: number,
  dealerSeat: PlayerSeat,
  players: Player[]
): RoundState {
  const firstBidder = getPlayerLeftOfDealer(dealerSeat);
  return {
    roundNumber,
    dealerSeat,
    phase: GamePhase.DEALING,
    trumpSuit: null,
    trumpCaller: null,
    bidding: {
      auctionBids: [null, null, null, null],
      auctionTurnsTaken: 0,
      consecutivePasses: 0,
      auctionHistory: [],
      highestBid: null,
      highestBidder: null,
      currentBidder: firstBidder,
      bids: [null, null, null, null],
      exchangeRound: 0,
      minThreshold: 5,
    },
    exchange: null,
    currentTrick: createEmptyTrick(firstBidder),
    completedTricks: [],
    trickNumber: 0,
    currentPlayer: firstBidder,
    players: players.map((p) => ({
      ...p,
      hand: [],
      tricksWon: 0,
      bid: null,
    })),
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'START_GAME':
      return createInitialGameState(action.settings);

    case 'DEAL':
      return handleDeal(state, action.seed);

    case 'BID':
      return handleBid(state, action.seat, action.amount, action.suit);

    case 'SELECT_DISCARDS':
      return handleSelectDiscards(state, action.seat, action.cards);

    case 'CHOOSE_TRUMP':
      return handleChooseTrump(state, action.seat, action.suit);

    case 'RAISE_BID':
      return handleRaise(state, action.seat, action.amount);

    case 'DECLARE':
      return handleDeclare(state, action.seat, action.amount);

    case 'PLAY_CARD':
      return handlePlayCard(state, action.seat, action.card);

    case 'COLLECT_TRICK':
      return handleCollectTrick(state);

    case 'NEXT_ROUND':
      return handleNextRound(state, action.seed);

    case 'END_GAME':
      return {
        ...state,
        currentRound: { ...state.currentRound, phase: GamePhase.GAME_OVER },
      };

    default:
      return state;
  }
}

function handleDeal(state: GameState, seed: number): GameState {
  const round = state.currentRound;
  if (round.phase !== GamePhase.DEALING) {
    throw new Error(`Cannot deal in phase ${round.phase}`);
  }

  const hands = dealHands(seed);
  const players = round.players.map((p, i) => ({
    ...p,
    hand: hands[i],
    tricksWon: 0,
    bid: null,
  }));

  return {
    ...state,
    currentRound: {
      ...round,
      phase: GamePhase.BIDDING,
      players,
    },
  };
}

function handleBid(state: GameState, seat: PlayerSeat, amount: number, suit?: StandardSuit): GameState {
  const round = state.currentRound;
  if (round.phase !== GamePhase.BIDDING) {
    throw new Error(`Cannot bid in phase ${round.phase}`);
  }

  const error = validateAuctionBid(round.bidding, seat, amount, suit);
  if (error) throw new Error(error);

  const newAuctionBids = [...round.bidding.auctionBids] as (AuctionBid | null)[];
  const newTurnsTaken = round.bidding.auctionTurnsTaken + 1;
  const newHistory = [...round.bidding.auctionHistory];

  // Track highest bidder
  let newHighestBid = round.bidding.highestBid;
  let newHighestBidder = round.bidding.highestBidder;
  let newConsecutivePasses = round.bidding.consecutivePasses;

  if (amount === 0) {
    // Pass
    newConsecutivePasses += 1;
    newHistory.push({ seat, bid: null });
  } else {
    // Bid with suit
    const auctionBid: AuctionBid = { amount, suit: suit! };
    newAuctionBids[seat] = auctionBid;
    newHighestBid = auctionBid;
    newHighestBidder = seat;
    newConsecutivePasses = 0;
    newHistory.push({ seat, bid: auctionBid });
  }

  // Check if auction ends:
  // 1) Someone bid and 3 others passed consecutively → winner found
  // 2) Nobody bid and all 4 passed → go to exchange
  const auctionWon = newHighestBidder !== null && newConsecutivePasses >= 3;
  const allPassedNoBid = newHighestBidder === null && newConsecutivePasses >= 4;

  if (!auctionWon && !allPassedNoBid) {
    // Auction continues — move to next bidder
    return {
      ...state,
      currentRound: {
        ...round,
        phase: GamePhase.BIDDING,
        bidding: {
          ...round.bidding,
          auctionBids: newAuctionBids,
          auctionTurnsTaken: newTurnsTaken,
          consecutivePasses: newConsecutivePasses,
          auctionHistory: newHistory,
          highestBid: newHighestBid,
          highestBidder: newHighestBidder,
          currentBidder: nextSeat(seat),
        },
        currentPlayer: nextSeat(seat),
      },
    };
  }

  const updatedBidding: BiddingState = {
    ...round.bidding,
    auctionBids: newAuctionBids,
    auctionTurnsTaken: newTurnsTaken,
    consecutivePasses: newConsecutivePasses,
    auctionHistory: newHistory,
    highestBid: newHighestBid,
    highestBidder: newHighestBidder,
  };

  if (allPassedNoBid) {
    // Nobody bid — exchange
    const nextExchangeRound = round.bidding.exchangeRound + 1;
    if (nextExchangeRound > 2) {
      // 3 exchanges failed (rounds 0, 1, 2) — re-deal
      const firstBidder = getPlayerLeftOfDealer(round.dealerSeat);
      return {
        ...state,
        currentRound: {
          ...round,
          phase: GamePhase.DEALING,
          bidding: {
            auctionBids: [null, null, null, null],
            auctionTurnsTaken: 0,
            consecutivePasses: 0,
            auctionHistory: [],
            highestBid: null,
            highestBidder: null,
            currentBidder: firstBidder,
            bids: [null, null, null, null],
            exchangeRound: 0,
            minThreshold: 5,
          },
          currentPlayer: firstBidder,
        },
      };
    }

    // Start exchange phase
    return {
      ...state,
      currentRound: {
        ...round,
        phase: GamePhase.EXCHANGING,
        bidding: updatedBidding,
        exchange: {
          discards: [null, null, null, null],
          received: [null, null, null, null],
          phase: 'SELECTING',
        },
      },
    };
  }

  // Someone won the auction — go to RAISE
  const trumpSuit = newHighestBid!.suit;
  const trumpCaller = newHighestBidder;

  return {
    ...state,
    currentRound: {
      ...round,
      phase: GamePhase.RAISE,
      trumpSuit,
      trumpCaller,
      bidding: updatedBidding,
      currentPlayer: trumpCaller!,
    },
  };
}

function handleSelectDiscards(
  state: GameState,
  seat: PlayerSeat,
  cardKeys: CardKey[]
): GameState {
  const round = state.currentRound;
  if (round.phase !== GamePhase.EXCHANGING || !round.exchange) {
    throw new Error(`Cannot exchange in phase ${round.phase}`);
  }

  const player = round.players[seat];
  const error = validateDiscards(player.hand, cardKeys);
  if (error) throw new Error(error);

  const newDiscards = [...round.exchange.discards];
  newDiscards[seat] = cardKeys;

  // Check if all players have selected
  const allSelected = newDiscards.every((d) => d !== null);

  if (!allSelected) {
    return {
      ...state,
      currentRound: {
        ...round,
        exchange: {
          ...round.exchange,
          discards: newDiscards,
        },
      },
    };
  }

  // All selected -- perform exchange
  const currentHands = round.players.map((p) => p.hand);
  const newHands = performExchange(currentHands, newDiscards);

  const newPlayers = round.players.map((p, i) => ({
    ...p,
    hand: newHands[i],
    bid: null, // Reset bids for re-bidding
  }));

  const nextExchangeRound = round.bidding.exchangeRound + 1;
  const firstBidder = getPlayerLeftOfDealer(round.dealerSeat);

  return {
    ...state,
    currentRound: {
      ...round,
      phase: GamePhase.BIDDING,
      bidding: {
        auctionBids: [null, null, null, null],
        auctionTurnsTaken: 0,
        consecutivePasses: 0,
        auctionHistory: [],
        highestBid: null,
        highestBidder: null,
        currentBidder: firstBidder,
        bids: [null, null, null, null],
        exchangeRound: nextExchangeRound,
        minThreshold: getMinThreshold(nextExchangeRound),
      },
      exchange: {
        discards: newDiscards,
        received: [null, null, null, null],
        phase: 'COMPLETE',
      },
      currentPlayer: firstBidder,
      players: newPlayers,
    },
  };
}

function handleChooseTrump(
  state: GameState,
  seat: PlayerSeat,
  suit: StandardSuit
): GameState {
  const round = state.currentRound;
  if (round.phase !== GamePhase.TRUMP_SELECTION) {
    throw new Error(`Cannot choose trump in phase ${round.phase}`);
  }
  if (seat !== round.trumpCaller) {
    throw new Error('Only the trump caller can choose trump');
  }

  // After trump selection, go to RAISE phase (not PLAYING)
  return {
    ...state,
    currentRound: {
      ...round,
      phase: GamePhase.RAISE,
      trumpSuit: suit,
      currentPlayer: seat, // Trump caller decides on raise
    },
  };
}

function handleRaise(
  state: GameState,
  seat: PlayerSeat,
  amount: number
): GameState {
  const round = state.currentRound;
  if (round.phase !== GamePhase.RAISE) {
    throw new Error(`Cannot raise in phase ${round.phase}`);
  }

  const error = validateRaise(round.bidding, seat, amount);
  if (error) throw new Error(error);

  // Set the winner's final bid into bids array and player.bid
  const newBids = [...round.bidding.bids];
  newBids[seat] = amount;

  const newPlayers = round.players.map((p) =>
    p.seat === seat ? { ...p, bid: amount } : p
  );

  // Update highestBid with new amount (keep the suit from the auction)
  const updatedHighestBid: AuctionBid | null = round.bidding.highestBid
    ? { ...round.bidding.highestBid, amount }
    : null;

  // Move to DECLARING phase. First declarer is nextSeat(trumpCaller)
  const firstDeclarer = nextSeat(round.trumpCaller!);

  return {
    ...state,
    currentRound: {
      ...round,
      phase: GamePhase.DECLARING,
      bidding: {
        ...round.bidding,
        bids: newBids,
        highestBid: updatedHighestBid,
        currentBidder: firstDeclarer,
      },
      currentPlayer: firstDeclarer,
      players: newPlayers,
    },
  };
}

function handleDeclare(
  state: GameState,
  seat: PlayerSeat,
  amount: number
): GameState {
  const round = state.currentRound;
  if (round.phase !== GamePhase.DECLARING) {
    throw new Error(`Cannot declare in phase ${round.phase}`);
  }

  const error = validateDeclare(round.bidding, seat, amount, round.trumpCaller!);
  if (error) throw new Error(error);

  // Set declaration in bids and player.bid
  const newBids = [...round.bidding.bids];
  newBids[seat] = amount;

  const newPlayers = round.players.map((p) =>
    p.seat === seat ? { ...p, bid: amount } : p
  );

  // Check if all 3 non-winner players have declared
  const declarationOrder = getDeclarationOrder(round.trumpCaller!);
  const allDeclared = declarationOrder.every((s) => newBids[s] !== null);

  if (!allDeclared) {
    // Move to next declarer
    const nextDeclarer = nextSeat(seat);
    // Skip the trump caller if needed
    const actualNext = nextDeclarer === round.trumpCaller ? nextSeat(nextDeclarer) : nextDeclarer;

    return {
      ...state,
      currentRound: {
        ...round,
        phase: GamePhase.DECLARING,
        bidding: {
          ...round.bidding,
          bids: newBids,
          currentBidder: actualNext,
        },
        currentPlayer: actualNext,
        players: newPlayers,
      },
    };
  }

  // All declarations are in -- start playing
  // Trump caller leads first trick
  const leadSeat = round.trumpCaller!;

  return {
    ...state,
    currentRound: {
      ...round,
      phase: GamePhase.PLAYING,
      bidding: {
        ...round.bidding,
        bids: newBids,
      },
      currentTrick: createEmptyTrick(leadSeat),
      trickNumber: 1,
      currentPlayer: leadSeat,
      players: newPlayers,
    },
  };
}

function handlePlayCard(
  state: GameState,
  seat: PlayerSeat,
  cardKeyStr: CardKey
): GameState {
  const round = state.currentRound;
  if (round.phase !== GamePhase.PLAYING) {
    throw new Error(`Cannot play card in phase ${round.phase}`);
  }
  if (seat !== round.currentPlayer) {
    throw new Error('Not your turn');
  }

  const player = round.players[seat];
  const card = parseCardKey(cardKeyStr);

  // Verify card is in hand
  if (!player.hand.some((c) => cardEquals(c, card))) {
    throw new Error('Card not in hand');
  }

  // Verify card is playable (follow suit rule)
  const playable = getPlayableCards(player.hand, round.currentTrick.leadSuit);
  if (!playable.some((c) => cardEquals(c, card))) {
    throw new Error('Must follow suit');
  }

  // Play the card
  const newTrick: Trick = {
    ...round.currentTrick,
    cards: [...round.currentTrick.cards, { card, seat }],
    leadSuit: round.currentTrick.leadSuit ?? (card.suit as StandardSuit),
  };

  // Remove card from hand
  const newHand = player.hand.filter((c) => !cardEquals(c, card));
  const newPlayers = round.players.map((p) =>
    p.seat === seat ? { ...p, hand: newHand } : p
  );

  // Check if trick is complete (4 cards)
  if (newTrick.cards.length === 4) {
    const winner = determineTrickWinner(newTrick, round.trumpSuit);
    const completedTrick: Trick = { ...newTrick, winnerSeat: winner };

    return {
      ...state,
      currentRound: {
        ...round,
        phase: GamePhase.TRICK_COMPLETE,
        currentTrick: completedTrick,
        currentPlayer: winner,
        players: newPlayers,
      },
    };
  }

  // Trick not complete -- next player
  return {
    ...state,
    currentRound: {
      ...round,
      currentTrick: newTrick,
      currentPlayer: nextSeat(seat),
      players: newPlayers,
    },
  };
}

function handleCollectTrick(state: GameState): GameState {
  const round = state.currentRound;
  if (round.phase !== GamePhase.TRICK_COMPLETE) {
    throw new Error(`Cannot collect trick in phase ${round.phase}`);
  }

  const winner = round.currentTrick.winnerSeat!;
  const newPlayers = round.players.map((p) =>
    p.seat === winner ? { ...p, tricksWon: p.tricksWon + 1 } : p
  );

  const completedTricks = [...round.completedTricks, round.currentTrick];

  // Check if round is over (13 tricks)
  if (completedTricks.length === HAND_SIZE) {
    // Compute scores using bids (final declarations)
    const totalBids = getTotalBids(round.bidding.bids);
    const scores = computeRoundScores(newPlayers, totalBids, state.scoreboard);

    // Apply scores to players
    const scoredPlayers = newPlayers.map((p) => {
      const entry = scores.find((e) => e.seat === p.seat)!;
      return { ...p, score: entry.cumulativeScore };
    });

    return {
      ...state,
      currentRound: {
        ...round,
        phase: GamePhase.ROUND_END,
        completedTricks,
        currentTrick: createEmptyTrick(winner),
        players: scoredPlayers,
      },
      scoreboard: [...state.scoreboard, scores],
    };
  }

  // Start next trick -- winner leads
  return {
    ...state,
    currentRound: {
      ...round,
      phase: GamePhase.PLAYING,
      completedTricks,
      currentTrick: createEmptyTrick(winner),
      trickNumber: round.trickNumber + 1,
      currentPlayer: winner,
      players: newPlayers,
    },
  };
}

function handleNextRound(state: GameState, seed: number): GameState {
  const round = state.currentRound;
  if (round.phase !== GamePhase.ROUND_END) {
    throw new Error(`Cannot start next round in phase ${round.phase}`);
  }

  const newDealerSeat = nextSeat(round.dealerSeat);
  const newRound = createRoundState(
    round.roundNumber + 1,
    newDealerSeat,
    round.players
  );

  // Deal immediately
  const hands = dealHands(seed);
  const players = newRound.players.map((p, i) => ({
    ...p,
    hand: hands[i],
  }));

  return {
    ...state,
    currentRound: {
      ...newRound,
      phase: GamePhase.BIDDING,
      players,
    },
    roundCount: state.roundCount + 1,
  };
}
