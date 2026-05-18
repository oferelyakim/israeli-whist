import type { RummyGameState, RummyAction, Meld } from '../types';
import { RummyPhase, TurnStep } from '../types';
import type { RummyGameSettings } from '../types';
import { cardKey, parseCardKey } from '../../../types/card';
import type { Card, CardKey } from '../../../types/card';
import { nextSeatN } from '../../../types/game-common';
import { dealRummy } from './deck';
import { isValidMeld, canLayOff, checkWin } from './validation';

let meldCounter = 0;
function nextMeldId(): string {
  return `meld_${++meldCounter}`;
}

export function createInitialRummyState(settings: RummyGameSettings): RummyGameState {
  return {
    gameId: `rummy_${Date.now()}`,
    settings,
    phase: RummyPhase.DEALING,
    players: settings.playerNames.map((name, i) => ({
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
    numPlayers: settings.numPlayers,
    winner: null,
    moveCount: 0,
  };
}

export function rummyReducer(state: RummyGameState, action: RummyAction): RummyGameState {
  const s = state;

  switch (action.type) {
    case 'DEAL': {
      const { players: dealt, drawPile, discardPile } = dealRummy(s.numPlayers, action.seed);
      const newPlayers = s.players.map((p, i) => ({
        ...p,
        hand: sortHand(dealt[i].hand),
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
      };
    }

    case 'DRAW_FROM_STOCK': {
      if (s.phase !== RummyPhase.PLAYING) return s;
      if (s.turnStep !== TurnStep.DRAW) return s;

      let drawPile = [...s.drawPile];
      let discardPile = [...s.discardPile];

      // If draw pile is empty, recycle discard pile
      if (drawPile.length === 0) {
        if (discardPile.length <= 1) return s; // Can't draw at all
        const topDiscard = discardPile[discardPile.length - 1];
        drawPile = discardPile.slice(0, -1);
        // Shuffle the recycled cards (non-deterministic, but this is a rare edge case)
        for (let i = drawPile.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [drawPile[i], drawPile[j]] = [drawPile[j], drawPile[i]];
        }
        discardPile = [topDiscard];
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
        discardPile,
        turnStep: TurnStep.MELD,
        consecutiveSkips: 0,
      };
    }

    case 'DRAW_FROM_DISCARD': {
      if (s.phase !== RummyPhase.PLAYING) return s;
      if (s.turnStep !== TurnStep.DRAW) return s;
      if (s.discardPile.length === 0) return s;

      const drawnCard = s.discardPile[s.discardPile.length - 1];
      const newDiscardPile = s.discardPile.slice(0, -1);

      const newPlayers = [...s.players];
      const player = { ...newPlayers[s.currentPlayer] };
      player.hand = sortHand([...player.hand, drawnCard]);
      newPlayers[s.currentPlayer] = player;

      return {
        ...s,
        players: newPlayers,
        discardPile: newDiscardPile,
        turnStep: TurnStep.MELD,
        consecutiveSkips: 0,
      };
    }

    case 'MELD_CARDS': {
      if (s.phase !== RummyPhase.PLAYING) return s;
      if (s.turnStep !== TurnStep.MELD) return s;

      const cards = action.cardKeys.map(k => parseCardKey(k));
      const { valid, type } = isValidMeld(cards);
      if (!valid || !type) return s;

      // Verify player has these cards
      const player = s.players[s.currentPlayer];
      const handKeys = new Set(player.hand.map(c => cardKey(c)));
      if (!action.cardKeys.every(k => handKeys.has(k))) return s;

      // Remove cards from hand
      const meldKeySet = new Set<CardKey>(action.cardKeys);
      const newHand = player.hand.filter(c => !meldKeySet.has(cardKey(c)));

      const newPlayers = [...s.players];
      newPlayers[s.currentPlayer] = { ...player, hand: newHand };

      const newMeld: Meld = {
        id: nextMeldId(),
        cards,
        type,
      };

      return {
        ...s,
        players: newPlayers,
        melds: [...s.melds, newMeld],
      };
    }

    case 'LAY_OFF': {
      if (s.phase !== RummyPhase.PLAYING) return s;
      if (s.turnStep !== TurnStep.MELD) return s;

      const card = parseCardKey(action.cardKey);
      const meldIdx = s.melds.findIndex(m => m.id === action.meldId);
      if (meldIdx === -1) return s;

      const meld = s.melds[meldIdx];
      if (!canLayOff(card, meld)) return s;

      // Verify player has this card
      const player = s.players[s.currentPlayer];
      if (!player.hand.some(c => cardKey(c) === action.cardKey)) return s;

      // Remove card from hand
      const newHand = player.hand.filter(c => cardKey(c) !== action.cardKey);
      const newPlayers = [...s.players];
      newPlayers[s.currentPlayer] = { ...player, hand: newHand };

      // Add card to meld
      const newMelds = [...s.melds];
      newMelds[meldIdx] = { ...meld, cards: [...meld.cards, card] };

      return {
        ...s,
        players: newPlayers,
        melds: newMelds,
      };
    }

    case 'DISCARD': {
      if (s.phase !== RummyPhase.PLAYING) return s;
      if (s.turnStep !== TurnStep.MELD) return s;

      const player = s.players[s.currentPlayer];
      if (!player.hand.some(c => cardKey(c) === action.cardKey)) return s;

      const card = parseCardKey(action.cardKey);
      const newHand = player.hand.filter(c => cardKey(c) !== action.cardKey);
      const newPlayers = [...s.players];
      newPlayers[s.currentPlayer] = { ...player, hand: newHand };

      const newDiscardPile = [...s.discardPile, card];

      // Check win
      if (checkWin(newHand)) {
        return {
          ...s,
          players: newPlayers,
          discardPile: newDiscardPile,
          phase: RummyPhase.ROUND_END,
          winner: s.currentPlayer,
          moveCount: s.moveCount + 1,
        };
      }

      // Next player's turn
      const nextPlayer = nextSeatN(s.currentPlayer, s.numPlayers);
      return {
        ...s,
        players: newPlayers,
        discardPile: newDiscardPile,
        currentPlayer: nextPlayer,
        turnStep: TurnStep.DRAW,
        moveCount: s.moveCount + 1,
        consecutiveSkips: 0,
      };
    }

    case 'PASS_TURN': {
      if (s.phase !== RummyPhase.PLAYING) return s;
      if (s.turnStep !== TurnStep.DRAW) return s;
      // Only allowed when nothing can be drawn from stock (discard recycle would fail).
      if (s.drawPile.length > 0) return s;
      if (s.discardPile.length > 1) return s;

      const skips = (s.consecutiveSkips ?? 0) + 1;

      // Everyone passed in a row → end as a draw (lowest hand count wins).
      if (skips >= s.numPlayers) {
        let best = 0;
        for (let i = 1; i < s.players.length; i++) {
          if (s.players[i].hand.length < s.players[best].hand.length) best = i;
        }
        return {
          ...s,
          phase: RummyPhase.ROUND_END,
          winner: best,
          moveCount: s.moveCount + 1,
          consecutiveSkips: skips,
        };
      }

      const nextPlayer = nextSeatN(s.currentPlayer, s.numPlayers);
      return {
        ...s,
        currentPlayer: nextPlayer,
        turnStep: TurnStep.DRAW,
        moveCount: s.moveCount + 1,
        consecutiveSkips: skips,
      };
    }

    case 'NEW_GAME': {
      const initial = createInitialRummyState(s.settings);
      return rummyReducer(initial, { type: 'DEAL', seed: action.seed });
    }

    default:
      return s;
  }
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
