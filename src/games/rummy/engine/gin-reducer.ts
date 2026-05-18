import type { RummyGameState, RummyAction, Meld, RummyGameSettings } from '../types';
import { RummyPhase, TurnStep, RummyVariant } from '../types';
import type { Card, CardKey } from '../../../types/card';
import { cardKey, parseCardKey, Rank } from '../../../types/card';
import { nextSeatN } from '../../../types/game-common';
import { shuffleDeck, createStandardDeck } from './deck';
import { isValidSet, isValidRun, rankValue } from './validation';

let ginMeldCounter = 0;
function nextGinMeldId(): string {
  return `gin_meld_${++ginMeldCounter}`;
}

/** Card value for Gin Rummy deadwood: A=1, 2-10=face, J/Q/K=10 */
export function ginCardValue(rank: Rank): number {
  return Math.min(rankValue(rank), 10);
}

/** Total deadwood value of a set of cards */
export function deadwoodValue(cards: Card[]): number {
  return cards.reduce((sum, c) => sum + ginCardValue(c.rank), 0);
}

/** Sort hand by suit then rank for display */
function sortHand(hand: Card[]): Card[] {
  const suitOrder: Record<string, number> = {
    CLUBS: 0, DIAMONDS: 1, HEARTS: 2, SPADES: 3,
    JOKER_RED: 4, JOKER_BLACK: 5,
  };
  return [...hand].sort((a, b) => {
    const suitDiff = (suitOrder[a.suit] ?? 0) - (suitOrder[b.suit] ?? 0);
    if (suitDiff !== 0) return suitDiff;
    return a.rank - b.rank;
  });
}

/**
 * Find all possible melds (sets and runs) in a hand.
 */
function findAllMelds(hand: Card[]): Card[][] {
  const melds: Card[][] = [];
  const handByKey = new Map<string, Card>();
  for (const c of hand) {
    handByKey.set(cardKey(c), c);
  }

  // Find sets (group by rank)
  const byRank = new Map<Rank, Card[]>();
  for (const card of hand) {
    const group = byRank.get(card.rank) ?? [];
    group.push(card);
    byRank.set(card.rank, group);
  }
  for (const cards of byRank.values()) {
    if (cards.length >= 3) {
      melds.push([...cards]);
      // Also add all 3-card subsets if there are 4 cards
      if (cards.length === 4) {
        for (let skip = 0; skip < 4; skip++) {
          melds.push(cards.filter((_, i) => i !== skip));
        }
      }
    }
  }

  // Find runs (group by suit, find consecutive sequences)
  const rankOrder = (rank: Rank): number => rank === Rank.ACE ? 1 : rank;
  const suits = ['CLUBS', 'DIAMONDS', 'HEARTS', 'SPADES'];
  for (const suit of suits) {
    const suitCards = hand
      .filter(c => c.suit === suit)
      .sort((a, b) => rankOrder(a.rank) - rankOrder(b.rank));

    if (suitCards.length < 3) continue;

    // Find all consecutive runs of length 3+
    for (let start = 0; start < suitCards.length; start++) {
      const run: Card[] = [suitCards[start]];
      for (let j = start + 1; j < suitCards.length; j++) {
        if (rankOrder(suitCards[j].rank) === rankOrder(suitCards[j - 1].rank) + 1) {
          run.push(suitCards[j]);
          if (run.length >= 3) {
            melds.push([...run]);
          }
        } else {
          break;
        }
      }
    }
  }

  return melds;
}

/**
 * Find the best combination of non-overlapping melds that minimizes deadwood.
 * For 10-11 cards this is tractable with recursive backtracking.
 */
export function findBestMelds(hand: Card[]): { melds: Card[][]; deadwood: Card[] } {
  const allMelds = findAllMelds(hand);

  let bestDeadwoodValue = Infinity;
  let bestMeldCombo: Card[][] = [];

  function backtrack(meldIdx: number, usedKeys: Set<string>, currentMelds: Card[][]) {
    // Calculate current deadwood
    const unusedCards = hand.filter(c => !usedKeys.has(cardKey(c)));
    const currentDW = deadwoodValue(unusedCards);

    if (currentDW < bestDeadwoodValue) {
      bestDeadwoodValue = currentDW;
      bestMeldCombo = [...currentMelds];
    }

    if (currentDW === 0) return; // Can't do better

    for (let i = meldIdx; i < allMelds.length; i++) {
      const meld = allMelds[i];
      // Check no overlap
      if (meld.some(c => usedKeys.has(cardKey(c)))) continue;

      // Add this meld
      const newUsed = new Set(usedKeys);
      for (const c of meld) newUsed.add(cardKey(c));
      currentMelds.push(meld);
      backtrack(i + 1, newUsed, currentMelds);
      currentMelds.pop();
    }
  }

  backtrack(0, new Set(), []);

  const usedKeys = new Set<string>();
  for (const meld of bestMeldCombo) {
    for (const c of meld) usedKeys.add(cardKey(c));
  }
  const deadwood = hand.filter(c => !usedKeys.has(cardKey(c)));

  return { melds: bestMeldCombo, deadwood };
}

/** Can the player knock? (deadwood <= 10 after best melding) */
export function canKnock(hand: Card[]): boolean {
  const { deadwood } = findBestMelds(hand);
  return deadwoodValue(deadwood) <= 10;
}

/** Does the player have gin? (deadwood = 0) */
export function hasGin(hand: Card[]): boolean {
  const { deadwood } = findBestMelds(hand);
  return deadwood.length === 0;
}

export function createInitialGinState(settings: RummyGameSettings): RummyGameState {
  return {
    gameId: `gin_${Date.now()}`,
    settings: { ...settings, variant: RummyVariant.GIN },
    phase: RummyPhase.DEALING,
    players: settings.playerNames.slice(0, 2).map((name, i) => ({
      seat: i,
      name,
      type: settings.playerTypes[i],
      hand: [],
      isConnected: true,
    })),
    drawPile: [],
    discardPile: [],
    melds: [],
    currentPlayer: 0,
    turnStep: TurnStep.DRAW,
    numPlayers: 2,
    winner: null,
    moveCount: 0,
    ginState: undefined,
  };
}

function dealGin(seed: number): { hands: Card[][]; drawPile: Card[]; discardPile: Card[] } {
  const deck = shuffleDeck(createStandardDeck(), seed);
  const hand0 = deck.slice(0, 10);
  const hand1 = deck.slice(10, 20);
  const discardPile = [deck[20]];
  const drawPile = deck.slice(21);
  return { hands: [hand0, hand1], drawPile, discardPile };
}

function validateMelds(hand: Card[], meldKeys: CardKey[][]): { valid: boolean; melds: Card[][]; deadwood: Card[] } {
  const handKeys = new Set(hand.map(c => cardKey(c)));
  const usedKeys = new Set<CardKey>();
  const melds: Card[][] = [];

  for (const meldCardKeys of meldKeys) {
    const meldCards = meldCardKeys.map(k => parseCardKey(k));

    // Verify player has these cards and they're not already used
    for (const k of meldCardKeys) {
      if (!handKeys.has(k) || usedKeys.has(k)) {
        return { valid: false, melds: [], deadwood: hand };
      }
      usedKeys.add(k);
    }

    // Validate each meld
    if (!isValidSet(meldCards) && !isValidRun(meldCards)) {
      return { valid: false, melds: [], deadwood: hand };
    }

    melds.push(meldCards);
  }

  const deadwood = hand.filter(c => !usedKeys.has(cardKey(c)));
  return { valid: true, melds, deadwood };
}

export function ginReducer(state: RummyGameState, action: RummyAction): RummyGameState {
  const s = state;

  switch (action.type) {
    case 'DEAL': {
      const { hands, drawPile, discardPile } = dealGin(action.seed);
      const newPlayers = s.players.map((p, i) => ({
        ...p,
        hand: sortHand(hands[i]),
      }));
      return {
        ...s,
        phase: RummyPhase.PLAYING,
        players: newPlayers,
        drawPile,
        discardPile,
        currentPlayer: 0,
        turnStep: TurnStep.DRAW,
        melds: [],
        winner: null,
        moveCount: 0,
        ginState: undefined,
      };
    }

    case 'DRAW_FROM_STOCK': {
      if (s.phase !== RummyPhase.PLAYING) return s;
      if (s.turnStep !== TurnStep.DRAW) return s;

      let drawPile = [...s.drawPile];

      // In Gin Rummy, if stock has 2 or fewer cards, it's a draw (no winner)
      if (drawPile.length <= 2) {
        return {
          ...s,
          phase: RummyPhase.ROUND_END,
          winner: null,
          moveCount: s.moveCount + 1,
        };
      }

      const drawnCard = drawPile[drawPile.length - 1];
      const newDrawPile = drawPile.slice(0, -1);

      const newPlayers = [...s.players];
      const player = { ...newPlayers[s.currentPlayer] };
      player.hand = sortHand([...player.hand, drawnCard]);
      newPlayers[s.currentPlayer] = player;

      return {
        ...s,
        players: newPlayers,
        drawPile: newDrawPile,
        turnStep: TurnStep.MELD,
        ginState: s.ginState ? {
          ...s.ginState,
          lastDrawnFromDiscard: false,
          lastDrawnCard: null,
        } : undefined,
      };
    }

    case 'DRAW_FROM_DISCARD': {
      if (s.phase !== RummyPhase.PLAYING) return s;
      if (s.turnStep !== TurnStep.DRAW) return s;
      if (s.discardPile.length === 0) return s;

      const drawnCard = s.discardPile[s.discardPile.length - 1];
      const newDiscardPile = s.discardPile.slice(0, -1);
      const drawnKey = cardKey(drawnCard);

      const newPlayers = [...s.players];
      const player = { ...newPlayers[s.currentPlayer] };
      player.hand = sortHand([...player.hand, drawnCard]);
      newPlayers[s.currentPlayer] = player;

      return {
        ...s,
        players: newPlayers,
        discardPile: newDiscardPile,
        turnStep: TurnStep.MELD,
        ginState: {
          knocker: -1,
          knockerMelds: [],
          knockerDeadwood: [],
          defenderDeadwood: [],
          isGin: false,
          lastDrawnFromDiscard: true,
          lastDrawnCard: drawnKey,
        },
      };
    }

    case 'DISCARD': {
      if (s.phase !== RummyPhase.PLAYING) return s;
      if (s.turnStep !== TurnStep.MELD) return s;

      const player = s.players[s.currentPlayer];
      if (!player.hand.some(c => cardKey(c) === action.cardKey)) return s;

      // Can't discard what was just picked from discard
      if (s.ginState?.lastDrawnFromDiscard && s.ginState.lastDrawnCard === action.cardKey) {
        return s;
      }

      const card = parseCardKey(action.cardKey);
      const newHand = player.hand.filter(c => cardKey(c) !== action.cardKey);
      const newPlayers = [...s.players];
      newPlayers[s.currentPlayer] = { ...player, hand: newHand };

      const newDiscardPile = [...s.discardPile, card];
      const nextPlayer = nextSeatN(s.currentPlayer, 2);

      return {
        ...s,
        players: newPlayers,
        discardPile: newDiscardPile,
        currentPlayer: nextPlayer,
        turnStep: TurnStep.DRAW,
        moveCount: s.moveCount + 1,
        ginState: s.ginState ? {
          ...s.ginState,
          lastDrawnFromDiscard: false,
          lastDrawnCard: null,
        } : undefined,
      };
    }

    case 'KNOCK': {
      if (s.phase !== RummyPhase.PLAYING) return s;
      if (s.turnStep !== TurnStep.MELD) return s;

      const player = s.players[s.currentPlayer];
      const { valid, melds, deadwood } = validateMelds(player.hand, action.melds);
      if (!valid) return s;

      const dwValue = deadwoodValue(deadwood);
      if (dwValue > 10) return s; // Can't knock with > 10 deadwood

      const isGin = deadwood.length === 0;

      // Convert melds to Meld objects
      const knockerMelds: Meld[] = melds.map((cards) => ({
        id: nextGinMeldId(),
        cards,
        type: isValidSet(cards) ? 'set' as const : 'run' as const,
      }));

      const defenderSeat = nextSeatN(s.currentPlayer, 2);
      const defender = s.players[defenderSeat];

      // If it's gin, defender can't lay off - resolve immediately
      if (isGin) {
        const defenderResult = findBestMelds(defender.hand);
        // Knocker wins with gin
        return {
          ...s,
          phase: RummyPhase.ROUND_END,
          winner: s.currentPlayer,
          melds: knockerMelds,
          ginState: {
            knocker: s.currentPlayer,
            knockerMelds,
            knockerDeadwood: [],
            defenderDeadwood: defenderResult.deadwood,
            isGin: true,
            lastDrawnFromDiscard: false,
            lastDrawnCard: null,
          },
          moveCount: s.moveCount + 1,
        };
      }

      // Not gin - enter knock reveal phase for defender to lay off
      return {
        ...s,
        phase: RummyPhase.KNOCK_REVEAL,
        melds: knockerMelds,
        ginState: {
          knocker: s.currentPlayer,
          knockerMelds,
          knockerDeadwood: deadwood,
          defenderDeadwood: [...defender.hand],
          isGin: false,
          lastDrawnFromDiscard: false,
          lastDrawnCard: null,
        },
        currentPlayer: defenderSeat,
        moveCount: s.moveCount + 1,
      };
    }

    case 'GIN': {
      // GIN is essentially KNOCK with 0 deadwood - reuse KNOCK logic
      return ginReducer(s, { type: 'KNOCK', melds: action.melds });
    }

    case 'DEFENDER_LAYOFF': {
      if (s.phase !== RummyPhase.KNOCK_REVEAL) return s;
      if (!s.ginState || s.ginState.isGin) return s; // Can't lay off against gin

      const defenderSeat = s.currentPlayer;
      const defender = s.players[defenderSeat];

      // Find the card in defender's hand
      const card = parseCardKey(action.cardKey);
      if (!defender.hand.some(c => cardKey(c) === action.cardKey)) return s;

      // Check if card can be added to the specified knocker meld
      const meld = s.ginState.knockerMelds[action.meldIndex];
      if (!meld) return s;

      const extendedCards = [...meld.cards, card];
      const validExtension = isValidSet(extendedCards) || isValidRun(extendedCards);
      if (!validExtension) return s;

      // Remove card from defender's hand
      const newHand = defender.hand.filter(c => cardKey(c) !== action.cardKey);
      const newPlayers = [...s.players];
      newPlayers[defenderSeat] = { ...defender, hand: newHand };

      // Update the meld
      const newKnockerMelds = [...s.ginState.knockerMelds];
      newKnockerMelds[action.meldIndex] = {
        ...meld,
        cards: extendedCards,
      };

      // Update defender deadwood
      const newDefenderDeadwood = s.ginState.defenderDeadwood.filter(
        c => cardKey(c) !== action.cardKey
      );

      return {
        ...s,
        players: newPlayers,
        melds: newKnockerMelds,
        ginState: {
          ...s.ginState,
          knockerMelds: newKnockerMelds,
          defenderDeadwood: newDefenderDeadwood,
        },
      };
    }

    case 'DEFENDER_DONE': {
      if (s.phase !== RummyPhase.KNOCK_REVEAL) return s;
      if (!s.ginState) return s;

      const knockerDW = deadwoodValue(s.ginState.knockerDeadwood);
      const defenderDW = deadwoodValue(s.ginState.defenderDeadwood);

      // Undercut: if defender's deadwood <= knocker's deadwood, defender wins
      const winner = defenderDW <= knockerDW
        ? nextSeatN(s.ginState.knocker, 2)  // defender wins (undercut)
        : s.ginState.knocker;               // knocker wins

      return {
        ...s,
        phase: RummyPhase.ROUND_END,
        winner,
      };
    }

    case 'NEW_GAME': {
      const initial = createInitialGinState(s.settings);
      return ginReducer(initial, { type: 'DEAL', seed: action.seed });
    }

    // Ignore basic rummy actions that don't apply to Gin
    case 'MELD_CARDS':
    case 'LAY_OFF':
      return s;

    default:
      return s;
  }
}
