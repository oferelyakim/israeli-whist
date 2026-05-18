import type { Card, CardKey } from '../../../types/card';
import { cardKey, parseCardKey } from '../../../types/card';
import { PlayerType, nextSeatN } from '../../../types/game-common';
import {
  YanivPhase,
} from '../types';
import type {
  YanivPlayer,
  DiscardGroup,
  YanivRoundState,
  YanivGameSettings,
  YanivGameState,
  YanivAction,
} from '../types';
import { dealYanivHands, shuffleYanivDeck } from './deck';
import { validateDiscard, getHandValue, sortSequence } from './discard-validation';
import { canDrawFromDiscard } from './draw-validation';
import { computeYanivRoundScores, isGameOver } from './scoring';

// ─── Helpers ───────────────────────────────────────────────────────────

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Find and remove a card from a hand by CardKey.
 * Returns the removed Card, or null if not found.
 */
function removeCardFromHand(hand: Card[], key: CardKey): Card | null {
  const idx = hand.findIndex((c) => cardKey(c) === key);
  if (idx === -1) return null;
  return hand.splice(idx, 1)[0];
}

/**
 * Find and remove a card from a discard group by CardKey.
 * Returns the removed Card, or null if not found.
 */
function removeCardFromDiscardGroup(group: DiscardGroup, key: CardKey): Card | null {
  const idx = group.cards.findIndex((c) => cardKey(c) === key);
  if (idx === -1) return null;
  return group.cards.splice(idx, 1)[0];
}

/**
 * Advance to the next active (non-eliminated) player seat.
 */
function nextActiveSeat(currentSeat: number, players: YanivPlayer[]): number {
  const n = players.length;
  let seat = nextSeatN(currentSeat, n);
  let attempts = 0;
  while (players[seat].eliminated && attempts < n) {
    seat = nextSeatN(seat, n);
    attempts++;
  }
  return seat;
}

/**
 * Check whether a drawn card can be quick-sticked onto the discard group
 * that was just played. The card must match the discard group's type:
 * - single: same rank
 * - set: same rank as the set
 * - sequence: extends the sequence at either end
 */
function canQuickStick(drawnCard: Card, lastDiscard: DiscardGroup): boolean {
  switch (lastDiscard.type) {
    case 'single': {
      // The drawn card must match the rank (quick stick as single of same rank)
      return drawnCard.rank === lastDiscard.cards[0].rank;
    }
    case 'set': {
      // Drawn card must be the same rank as the set
      return drawnCard.rank === lastDiscard.cards[0].rank;
    }
    case 'sequence': {
      // Check if adding the card to the group would still form a valid sequence
      const testCards = [...lastDiscard.cards, drawnCard];
      const result = validateDiscard(testCards);
      return result === 'sequence';
    }
  }
}

// ─── Initial State ─────────────────────────────────────────────────────

export function createInitialYanivState(settings: YanivGameSettings): YanivGameState {
  const players: YanivPlayer[] = settings.playerNames.map((name, i) => ({
    seat: i,
    name,
    type: settings.playerTypes[i] ?? PlayerType.AI,
    hand: [],
    roundScore: 0,
    totalScore: 0,
    eliminated: false,
    declaredYaniv: false,
    isConnected: settings.playerTypes[i] === PlayerType.REMOTE ? false : true,
  }));

  const round: YanivRoundState = {
    roundNumber: 0,
    dealerSeat: 0,
    phase: YanivPhase.DEALING,
    players,
    drawPile: [],
    discardPile: [],
    currentPlayer: 0,
    lastDiscard: null,
    lastDiscardBySeat: null,
    yanivDeclarer: null,
    quickStickEligible: false,
    numPlayers: settings.numPlayers,
  };

  return {
    gameId: '',
    currentRound: round,
    scoreboard: [],
    settings,
    roundCount: 0,
  };
}

// ─── Reducer ───────────────────────────────────────────────────────────

export function yanivReducer(state: YanivGameState, action: YanivAction): YanivGameState {
  // Deep clone to avoid mutation
  const newState = deepClone(state);
  const round = newState.currentRound;
  const settings = newState.settings;

  switch (action.type) {
    case 'DEAL': {
      const { hands, drawPile, firstDiscard } = dealYanivHands(
        action.seed,
        settings.numPlayers,
        settings.handSize,
        settings.useDoubleDeck,
      );

      // Reset player round state
      for (let i = 0; i < round.players.length; i++) {
        round.players[i].hand = hands[i];
        round.players[i].roundScore = 0;
        round.players[i].declaredYaniv = false;
      }

      round.drawPile = drawPile;
      round.discardPile = [firstDiscard];
      round.lastDiscard = firstDiscard;
      round.lastDiscardBySeat = null; // no player discarded the first card

      // First player is left of dealer
      round.currentPlayer = nextActiveSeat(round.dealerSeat, round.players);
      round.phase = YanivPhase.PLAYER_TURN;
      round.yanivDeclarer = null;
      round.quickStickEligible = false;

      return newState;
    }

    case 'DISCARD_AND_DRAW': {
      if (round.phase !== YanivPhase.PLAYER_TURN) return state;
      if (round.currentPlayer !== action.seat) return state;

      const player = round.players[action.seat];

      // Parse and validate discard cards
      const discardCards: Card[] = [];
      for (const key of action.discardCards) {
        const card = removeCardFromHand(player.hand, key);
        if (!card) return state; // invalid card
        discardCards.push(card);
      }

      const discardType = validateDiscard(discardCards);
      if (discardType === 'invalid') {
        // Invalid discard -- return original state
        return state;
      }

      const discardGroup: DiscardGroup = {
        cards: discardType === 'sequence' ? sortSequence(discardCards) : discardCards,
        type: discardType,
      };

      // Push discard group to pile
      round.discardPile.push(discardGroup);
      round.lastDiscard = discardGroup;
      round.lastDiscardBySeat = action.seat;

      // Draw a card
      let drawnCard: Card | null = null;

      if (action.drawSource === 'pile') {
        // Draw from draw pile
        if (round.drawPile.length === 0) {
          // Reshuffle discard pile (except the top/last group) into draw pile
          if (action.reshuffleSeed !== undefined) {
            reshuffleDiscardIntoDraw(round, action.reshuffleSeed);
          }
        }
        if (round.drawPile.length > 0) {
          drawnCard = round.drawPile.pop()!;
        }
      } else if (action.drawSource === 'discard') {
        // Draw from the PREVIOUS player's last discard (which is now the second-to-last
        // group on the discard pile, since we just pushed our own discard).
        if (round.discardPile.length >= 2 && action.drawCardKey) {
          const previousDiscardIdx = round.discardPile.length - 2;
          const previousDiscard = round.discardPile[previousDiscardIdx];
          const targetCard = parseCardKey(action.drawCardKey);

          if (canDrawFromDiscard(previousDiscard, targetCard)) {
            drawnCard = removeCardFromDiscardGroup(previousDiscard, action.drawCardKey);
            // If the previous discard group is now empty, remove it from the pile
            if (previousDiscard.cards.length === 0) {
              round.discardPile.splice(previousDiscardIdx, 1);
            }
          }
        }
      }

      if (drawnCard) {
        player.hand.push(drawnCard);

        // Check quick stick eligibility
        const eligible = canQuickStick(drawnCard, discardGroup);
        round.quickStickEligible = eligible;

        if (eligible) {
          round.phase = YanivPhase.QUICK_STICK;
        } else {
          // Advance to next player
          round.currentPlayer = nextActiveSeat(action.seat, round.players);
          round.phase = YanivPhase.PLAYER_TURN;
          round.quickStickEligible = false;
        }
      } else {
        // No card drawn (shouldn't happen in normal play, but handle gracefully)
        round.currentPlayer = nextActiveSeat(action.seat, round.players);
        round.phase = YanivPhase.PLAYER_TURN;
        round.quickStickEligible = false;
      }

      return newState;
    }

    case 'QUICK_STICK': {
      if (round.phase !== YanivPhase.QUICK_STICK) return state;
      if (round.currentPlayer !== action.seat) return state;

      const player = round.players[action.seat];
      const card = removeCardFromHand(player.hand, action.discardCard);
      if (!card) return state;

      // Discard as a single card on top of the pile
      const quickStickGroup: DiscardGroup = {
        cards: [card],
        type: 'single',
      };
      round.discardPile.push(quickStickGroup);
      round.lastDiscard = quickStickGroup;
      round.lastDiscardBySeat = action.seat;

      // Advance to next player
      round.currentPlayer = nextActiveSeat(action.seat, round.players);
      round.phase = YanivPhase.PLAYER_TURN;
      round.quickStickEligible = false;

      return newState;
    }

    case 'SKIP_QUICK_STICK': {
      if (round.phase !== YanivPhase.QUICK_STICK) return state;
      if (round.currentPlayer !== action.seat) return state;

      // Just advance to next player
      round.currentPlayer = nextActiveSeat(action.seat, round.players);
      round.phase = YanivPhase.PLAYER_TURN;
      round.quickStickEligible = false;

      return newState;
    }

    case 'DECLARE_YANIV': {
      if (round.phase !== YanivPhase.PLAYER_TURN) return state;
      if (round.currentPlayer !== action.seat) return state;

      const player = round.players[action.seat];
      const handValue = getHandValue(player.hand);

      // Must be at or below threshold to declare
      if (handValue > settings.yanivThreshold) return state;

      player.declaredYaniv = true;
      round.yanivDeclarer = action.seat;

      // Compute round scores
      const result = computeYanivRoundScores(
        round.players,
        action.seat,
        settings,
        newState.scoreboard,
      );

      // Apply scores to players
      for (const entry of result.entries) {
        const p = round.players[entry.seat];
        p.roundScore = entry.roundScore;
        p.totalScore = entry.cumulativeScore;
        p.eliminated = entry.eliminated;
      }

      // Add to scoreboard
      newState.scoreboard.push(result.entries);
      newState.roundCount++;

      // Check if game is over
      if (isGameOver(result.entries, settings)) {
        round.phase = YanivPhase.GAME_OVER;
      } else {
        round.phase = YanivPhase.ROUND_END;
      }

      return newState;
    }

    case 'NEXT_ROUND': {
      if (round.phase !== YanivPhase.ROUND_END) return state;

      // Advance dealer
      round.dealerSeat = nextActiveSeat(round.dealerSeat, round.players);
      round.roundNumber++;
      round.phase = YanivPhase.DEALING;
      round.discardPile = [];
      round.drawPile = [];
      round.lastDiscard = null;
      round.lastDiscardBySeat = null;
      round.yanivDeclarer = null;
      round.quickStickEligible = false;

      // Clear hands
      for (const p of round.players) {
        p.hand = [];
        p.roundScore = 0;
        p.declaredYaniv = false;
      }

      // Immediately deal with the provided seed
      return yanivReducer(newState, { type: 'DEAL', seed: action.seed });
    }

    case 'END_GAME': {
      round.phase = YanivPhase.GAME_OVER;
      return newState;
    }

    default:
      return state;
  }
}

// ─── Internal helpers ──────────────────────────────────────────────────

/**
 * Reshuffle all discard pile groups except the top one into the draw pile.
 */
function reshuffleDiscardIntoDraw(round: YanivRoundState, seed: number): void {
  if (round.discardPile.length <= 1) return;

  // Keep the top (most recent) discard group
  const topGroup = round.discardPile[round.discardPile.length - 1];

  // Collect all cards from other groups
  const reshuffleCards: Card[] = [];
  for (let i = 0; i < round.discardPile.length - 1; i++) {
    reshuffleCards.push(...round.discardPile[i].cards);
  }

  // Shuffle and set as new draw pile
  shuffleYanivDeck(reshuffleCards, seed);
  round.drawPile = reshuffleCards;

  // Only the top group remains in the discard pile
  round.discardPile = [topGroup];
}
