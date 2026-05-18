import type { GinRummyGameState, GinRummyAction, GinRummyGameSettings, Meld } from '../types';
import { GinRummyPhase, TurnStep } from '../types';
import type { Card } from '../../../types/card';
import { cardKey, parseCardKey } from '../../../types/card';
import { nextSeatN } from '../../../types/game-common';
import { dealGinRummy } from './deck';
import { findBestMelds, deadwoodValue, isValidSet, isValidRun } from './validation';

let meldCounter = 0;
function nextMeldId(): string {
  return `gin_meld_${++meldCounter}`;
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

export function createInitialGinRummyState(settings: GinRummyGameSettings): GinRummyGameState {
  return {
    gameId: `ginrummy_${Date.now()}`,
    settings,
    phase: GinRummyPhase.DEALING,
    players: settings.playerNames.slice(0, 2).map((name, i) => ({
      seat: i,
      name,
      type: settings.playerTypes[i],
      hand: [],
      melds: [],
      deadwood: [],
    })),
    drawPile: [],
    discardPile: [],
    currentPlayer: 0,
    turnStep: TurnStep.DRAW,
    winner: null,
    moveCount: 0,
    knocker: null,
    isGin: false,
    lastDrawnFromDiscard: false,
    lastDrawnCard: null,
  };
}

export function ginRummyReducer(state: GinRummyGameState, action: GinRummyAction): GinRummyGameState {
  const s = state;

  switch (action.type) {
    case 'DEAL': {
      const { hands, drawPile, discardPile } = dealGinRummy(action.seed);
      const newPlayers = s.players.map((p, i) => ({
        ...p,
        hand: sortHand(hands[i]),
        melds: [],
        deadwood: [],
      }));
      return {
        ...s,
        phase: GinRummyPhase.PLAYING,
        players: newPlayers,
        drawPile,
        discardPile,
        currentPlayer: 0,
        turnStep: TurnStep.DRAW,
        winner: null,
        moveCount: 0,
        knocker: null,
        isGin: false,
        lastDrawnFromDiscard: false,
        lastDrawnCard: null,
      };
    }

    case 'DRAW_FROM_STOCK': {
      if (s.phase !== GinRummyPhase.PLAYING) return s;
      if (s.turnStep !== TurnStep.DRAW) return s;

      // If stock has 2 or fewer cards, it's a draw
      if (s.drawPile.length <= 2) {
        return {
          ...s,
          phase: GinRummyPhase.ROUND_END,
          winner: null,
          moveCount: s.moveCount + 1,
        };
      }

      const drawnCard = s.drawPile[s.drawPile.length - 1];
      const newDrawPile = s.drawPile.slice(0, -1);

      const newPlayers = [...s.players];
      const player = { ...newPlayers[s.currentPlayer] };
      player.hand = sortHand([...player.hand, drawnCard]);
      newPlayers[s.currentPlayer] = player;

      return {
        ...s,
        players: newPlayers,
        drawPile: newDrawPile,
        turnStep: TurnStep.DISCARD,
        lastDrawnFromDiscard: false,
        lastDrawnCard: null,
      };
    }

    case 'DRAW_FROM_DISCARD': {
      if (s.phase !== GinRummyPhase.PLAYING) return s;
      if (s.turnStep !== TurnStep.DRAW) return s;
      if (s.discardPile.length === 0) return s;

      const drawnCard = s.discardPile[s.discardPile.length - 1];
      const drawnKey = cardKey(drawnCard);
      const newDiscardPile = s.discardPile.slice(0, -1);

      const newPlayers = [...s.players];
      const player = { ...newPlayers[s.currentPlayer] };
      player.hand = sortHand([...player.hand, drawnCard]);
      newPlayers[s.currentPlayer] = player;

      return {
        ...s,
        players: newPlayers,
        discardPile: newDiscardPile,
        turnStep: TurnStep.DISCARD,
        lastDrawnFromDiscard: true,
        lastDrawnCard: drawnKey,
      };
    }

    case 'DISCARD': {
      if (s.phase !== GinRummyPhase.PLAYING) return s;
      if (s.turnStep !== TurnStep.DISCARD) return s;

      const player = s.players[s.currentPlayer];
      if (!player.hand.some(c => cardKey(c) === action.cardKey)) return s;

      // Can't discard what was just picked from discard
      if (s.lastDrawnFromDiscard && s.lastDrawnCard === action.cardKey) {
        return s;
      }

      const card = parseCardKey(action.cardKey);
      const newHand = player.hand.filter(c => cardKey(c) !== action.cardKey);
      const newPlayers = [...s.players];
      newPlayers[s.currentPlayer] = { ...player, hand: newHand };

      const newDiscardPile = [...s.discardPile, card];

      // If knock requested, handle knock/gin
      if (action.knock) {
        const { melds, deadwood } = findBestMelds(newHand);

        // Validate: can only knock with deadwood <= 10
        const dwVal = deadwoodValue(deadwood);
        if (dwVal > 10) return s; // invalid knock

        const knockerMelds: Meld[] = melds.map(cards => ({
          id: nextMeldId(),
          cards,
          type: isValidSet(cards) ? 'set' as const : 'run' as const,
        }));

        // Update knocker's player data
        newPlayers[s.currentPlayer] = {
          ...newPlayers[s.currentPlayer],
          hand: newHand,
          melds: knockerMelds,
          deadwood,
        };

        const isGinResult = deadwood.length === 0;

        if (isGinResult) {
          // Gin -- opponent can't lay off, resolve immediately
          const defenderSeat = nextSeatN(s.currentPlayer, 2);
          const defender = newPlayers[defenderSeat];
          const defenderResult = findBestMelds(defender.hand);
          newPlayers[defenderSeat] = {
            ...defender,
            melds: defenderResult.melds.map(cards => ({
              id: nextMeldId(),
              cards,
              type: isValidSet(cards) ? 'set' as const : 'run' as const,
            })),
            deadwood: defenderResult.deadwood,
          };

          return {
            ...s,
            players: newPlayers,
            discardPile: newDiscardPile,
            phase: GinRummyPhase.ROUND_END,
            knocker: s.currentPlayer,
            isGin: true,
            winner: s.currentPlayer,
            moveCount: s.moveCount + 1,
            lastDrawnFromDiscard: false,
            lastDrawnCard: null,
          };
        }

        // Knock (not gin) -- opponent can lay off
        const defenderSeat = nextSeatN(s.currentPlayer, 2);
        return {
          ...s,
          players: newPlayers,
          discardPile: newDiscardPile,
          phase: GinRummyPhase.LAYING_OFF,
          knocker: s.currentPlayer,
          isGin: false,
          currentPlayer: defenderSeat,
          moveCount: s.moveCount + 1,
          lastDrawnFromDiscard: false,
          lastDrawnCard: null,
        };
      }

      // Normal discard (no knock) -- next player's turn
      const nextPlayer = nextSeatN(s.currentPlayer, 2);
      return {
        ...s,
        players: newPlayers,
        discardPile: newDiscardPile,
        currentPlayer: nextPlayer,
        turnStep: TurnStep.DRAW,
        moveCount: s.moveCount + 1,
        lastDrawnFromDiscard: false,
        lastDrawnCard: null,
      };
    }

    case 'LAY_OFF_ON_KNOCK': {
      if (s.phase !== GinRummyPhase.LAYING_OFF) return s;
      if (s.knocker === null) return s;

      const defenderSeat = s.currentPlayer;
      const defender = s.players[defenderSeat];
      const knockerPlayer = s.players[s.knocker];

      // Find the card in defender's hand
      if (!defender.hand.some(c => cardKey(c) === action.cardKey)) return s;

      // Check if card can be added to the specified knocker meld
      const meld = knockerPlayer.melds[action.meldIndex];
      if (!meld) return s;

      const cardToLayOff = parseCardKey(action.cardKey);
      const extendedCards = [...meld.cards, cardToLayOff];
      const validExtension = isValidSet(extendedCards) || isValidRun(extendedCards);
      if (!validExtension) return s;

      // Remove card from defender's hand
      const newDefenderHand = defender.hand.filter(c => cardKey(c) !== action.cardKey);
      const newPlayers = [...s.players];

      // Update the knocker's meld
      const newKnockerMelds = [...knockerPlayer.melds];
      newKnockerMelds[action.meldIndex] = {
        ...meld,
        cards: extendedCards,
      };

      newPlayers[s.knocker] = {
        ...knockerPlayer,
        melds: newKnockerMelds,
      };

      newPlayers[defenderSeat] = {
        ...defender,
        hand: newDefenderHand,
      };

      return {
        ...s,
        players: newPlayers,
      };
    }

    case 'DONE_LAYING_OFF': {
      if (s.phase !== GinRummyPhase.LAYING_OFF) return s;
      if (s.knocker === null) return s;

      const defenderSeat = s.currentPlayer;
      const defender = s.players[defenderSeat];
      const knockerPlayer = s.players[s.knocker];

      // Calculate final deadwood
      const knockerDW = deadwoodValue(knockerPlayer.deadwood);
      const defenderDW = deadwoodValue(defender.hand);

      // Update defender's melds/deadwood for display
      const defenderResult = findBestMelds(defender.hand);
      const newPlayers = [...s.players];
      newPlayers[defenderSeat] = {
        ...defender,
        melds: defenderResult.melds.map(cards => ({
          id: nextMeldId(),
          cards,
          type: isValidSet(cards) ? 'set' as const : 'run' as const,
        })),
        deadwood: defenderResult.deadwood,
      };

      // Undercut: if defender's deadwood <= knocker's deadwood, defender wins
      const winner = defenderDW <= knockerDW
        ? defenderSeat
        : s.knocker;

      return {
        ...s,
        players: newPlayers,
        phase: GinRummyPhase.ROUND_END,
        winner,
      };
    }

    case 'NEW_GAME': {
      const initial = createInitialGinRummyState(s.settings);
      return ginRummyReducer(initial, { type: 'DEAL', seed: action.seed });
    }

    default:
      return s;
  }
}
