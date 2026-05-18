import type { IsraeliRummyGameState, IsraeliRummyAction, Meld, IsraeliRummyGameSettings } from '../types';
import { IsraeliRummyPhase, TurnAction } from '../types';
import type { Card } from '../../../types/card';
import { cardKey } from '../../../types/card';
import { nextSeatN } from '../../../types/game-common';
import { dealIsraeliRummy } from './deck';
import { allMeldsValid, cardPointValue, meetsFirstMeldRequirement, sortBySuit, sortMeldCards } from './validation';

/** Pick the player whose hand has the lowest total point value. Ties break
 *  by seat index (lowest first), matching standard Rummikub house rules. */
function lowestPointsWinner(state: IsraeliRummyGameState): number {
  let bestSeat = 0;
  let bestScore = Infinity;
  for (let i = 0; i < state.players.length; i++) {
    const total = state.players[i].hand.reduce((s, c) => s + cardPointValue(c), 0);
    if (total < bestScore) {
      bestScore = total;
      bestSeat = i;
    }
  }
  return bestSeat;
}

let meldCounter = 0;
function nextMeldId(): string {
  return `irummy_meld_${++meldCounter}`;
}

export function createInitialIsraeliRummyState(settings: IsraeliRummyGameSettings): IsraeliRummyGameState {
  return {
    gameId: `irummy_${Date.now()}`,
    settings,
    phase: IsraeliRummyPhase.DEALING,
    players: settings.playerNames.map((name, i) => ({
      seat: i,
      name,
      type: settings.playerTypes[i],
      hand: [],
      hasMetFirstMeld: false,
      isConnected: true,
    })),
    drawPile: [],
    melds: [],
    currentPlayer: 0,
    turnAction: TurnAction.CHOOSE,
    numPlayers: settings.numPlayers,
    winner: null,
    moveCount: 0,
    firstMeldThreshold: 30,
    boardSnapshot: null,
    consecutivePasses: 0,
  };
}

export function israeliRummyReducer(state: IsraeliRummyGameState, action: IsraeliRummyAction): IsraeliRummyGameState {
  const s = state;

  switch (action.type) {
    case 'DEAL': {
      const { players: dealt, drawPile } = dealIsraeliRummy(s.numPlayers, action.seed);
      const newPlayers = s.players.map((p, i) => ({
        ...p,
        hand: sortBySuit(dealt[i].hand),
        hasMetFirstMeld: false,
      }));
      return {
        ...s,
        phase: IsraeliRummyPhase.PLAYING,
        players: newPlayers,
        drawPile,
        currentPlayer: 0,
        turnAction: TurnAction.CHOOSE,
        melds: [],
        winner: null,
        moveCount: 0,
        boardSnapshot: null,
        consecutivePasses: 0,
      };
    }

    case 'DRAW_CARD': {
      if (s.phase !== IsraeliRummyPhase.PLAYING) return s;
      if (s.turnAction !== TurnAction.CHOOSE) return s;
      if (s.drawPile.length === 0) return s;

      const drawnCard = s.drawPile[s.drawPile.length - 1];
      const newDrawPile = s.drawPile.slice(0, -1);

      const newPlayers = [...s.players];
      const player = { ...newPlayers[s.currentPlayer] };
      player.hand = sortBySuit([...player.hand, drawnCard]);
      newPlayers[s.currentPlayer] = player;

      // Drawing ends the turn without placing a tile — counts as a "pass"
      // toward the deadlock detector. The counter only matters once the
      // draw pile is empty, but incrementing uniformly keeps the logic simple.
      const nextPlayer = nextSeatN(s.currentPlayer, s.numPlayers);
      return {
        ...s,
        players: newPlayers,
        drawPile: newDrawPile,
        currentPlayer: nextPlayer,
        turnAction: TurnAction.CHOOSE,
        moveCount: s.moveCount + 1,
        consecutivePasses: s.consecutivePasses + 1,
      };
    }

    case 'START_REARRANGE': {
      if (s.phase !== IsraeliRummyPhase.PLAYING) return s;
      if (s.turnAction !== TurnAction.CHOOSE) return s;

      // Save snapshot of current board state (melds + player hand)
      const player = s.players[s.currentPlayer];
      return {
        ...s,
        turnAction: TurnAction.REARRANGING,
        boardSnapshot: {
          melds: s.melds.map(m => ({ ...m, cards: [...m.cards] })),
          hand: [...player.hand],
        },
      };
    }

    case 'COMMIT_MELDS': {
      if (s.phase !== IsraeliRummyPhase.PLAYING) return s;
      if (s.turnAction !== TurnAction.REARRANGING) return s;
      if (!s.boardSnapshot) return s;

      const proposedMelds = action.melds;
      const proposedHand = action.hand;

      // 1. All proposed melds must be valid
      if (!allMeldsValid(proposedMelds)) return s;

      // 2. All cards that were in boardSnapshot.melds must still be on the table
      const snapshotTableCards = collectAllCards(s.boardSnapshot.melds);
      const proposedTableCards = collectAllCards(proposedMelds);
      if (!allCardsPresent(snapshotTableCards, proposedTableCards)) return s;

      // 3. Conservation of cards: snapshot (table + hand) == proposed (table + hand)
      const snapshotHandCards = s.boardSnapshot.hand;
      const totalBefore = [...snapshotTableCards, ...snapshotHandCards];
      const totalAfter = [...proposedTableCards, ...proposedHand];
      if (!cardMultisetsEqual(totalBefore, totalAfter)) return s;

      // 4. First meld check
      const player = s.players[s.currentPlayer];
      if (!player.hasMetFirstMeld) {
        // Find cards newly placed on the table (from hand)
        const newTableCards = getNewTableCards(snapshotTableCards, proposedTableCards);
        if (newTableCards.length === 0) return s; // Must place something new

        // FIRST MELD RULE: Player can ONLY use cards from their hand.
        // The original table melds must remain unchanged.
        if (!snapshotMeldsPreserved(s.boardSnapshot.melds, proposedMelds)) return s;

        // Identify NEW melds by ID. We can't classify by card value because
        // Israeli Rummy uses two decks — a tile the player just placed from
        // hand can share its (suit, rank) with a tile in an existing table
        // meld (e.g. existing [5♥,5♣,5♠] + new run [3♥,4♥,5♥]). The previous
        // value-based classifier misidentified the unchanged existing meld
        // as "new" and then failed it for "rearranging from the table".
        //
        // Once snapshotMeldsPreserved + total-card conservation (step 3) hold,
        // any meld whose ID is not in the snapshot is, by construction,
        // composed entirely of tiles that came from the player's hand — so
        // a separate "all from hand" check is unnecessary.
        const snapshotMeldIds = new Set(s.boardSnapshot.melds.map(m => m.id));
        const newMeldCards = proposedMelds
          .filter(m => !snapshotMeldIds.has(m.id))
          .map(m => m.cards);

        if (!meetsFirstMeldRequirement(newMeldCards, s.firstMeldThreshold)) return s;
      }

      // Assign IDs to melds and sort their cards for display
      const finalMelds: Meld[] = proposedMelds.map(m => ({
        ...m,
        id: m.id || nextMeldId(),
        cards: sortMeldCards(m.cards),
      }));

      // Determine if cards were placed from hand
      const cardsPlacedFromHand = snapshotHandCards.length - proposedHand.length;

      const newPlayers = [...s.players];
      newPlayers[s.currentPlayer] = {
        ...player,
        hand: sortBySuit(proposedHand),
        hasMetFirstMeld: player.hasMetFirstMeld || cardsPlacedFromHand > 0,
      };

      // Check win: empty hand
      if (proposedHand.length === 0) {
        return {
          ...s,
          players: newPlayers,
          melds: finalMelds,
          phase: IsraeliRummyPhase.ROUND_END,
          winner: s.currentPlayer,
          turnAction: TurnAction.CHOOSE,
          boardSnapshot: null,
          moveCount: s.moveCount + 1,
          consecutivePasses: 0,
        };
      }

      // Advance to next player. A commit that placed at least one tile from
      // hand breaks the deadlock chain; a commit that only shuffled table
      // melds counts as a pass (shouldn't happen because the mustPlaceCard
      // check above guards against it, but be defensive).
      const placedFromHand = cardsPlacedFromHand > 0;
      const nextPlayer = nextSeatN(s.currentPlayer, s.numPlayers);
      return {
        ...s,
        players: newPlayers,
        melds: finalMelds,
        currentPlayer: nextPlayer,
        turnAction: TurnAction.CHOOSE,
        boardSnapshot: null,
        moveCount: s.moveCount + 1,
        consecutivePasses: placedFromHand ? 0 : s.consecutivePasses + 1,
      };
    }

    case 'REVERT_REARRANGE': {
      if (s.phase !== IsraeliRummyPhase.PLAYING) return s;
      if (s.turnAction !== TurnAction.REARRANGING) return s;
      if (!s.boardSnapshot) return s;

      // Restore melds and hand from snapshot
      const newPlayers = [...s.players];
      newPlayers[s.currentPlayer] = {
        ...s.players[s.currentPlayer],
        hand: [...s.boardSnapshot.hand],
      };

      return {
        ...s,
        players: newPlayers,
        melds: s.boardSnapshot.melds.map(m => ({ ...m, cards: [...m.cards] })),
        turnAction: TurnAction.CHOOSE,
        boardSnapshot: null,
      };
    }

    case 'PASS_TURN': {
      if (s.phase !== IsraeliRummyPhase.PLAYING) return s;
      if (s.turnAction !== TurnAction.CHOOSE) return s;

      const passes = s.consecutivePasses + 1;

      // Deadlock rule: if the draw pile is empty AND 2 full rounds have
      // passed with nobody placing a tile, end the round. Winner is the
      // player with the lowest total point value in hand (ties go to the
      // lowest seat index).
      if (s.drawPile.length === 0 && passes >= s.numPlayers * 2) {
        return {
          ...s,
          phase: IsraeliRummyPhase.ROUND_END,
          winner: lowestPointsWinner(s),
          turnAction: TurnAction.CHOOSE,
          moveCount: s.moveCount + 1,
          consecutivePasses: passes,
        };
      }

      const nextPlayer = nextSeatN(s.currentPlayer, s.numPlayers);
      return {
        ...s,
        currentPlayer: nextPlayer,
        turnAction: TurnAction.CHOOSE,
        moveCount: s.moveCount + 1,
        consecutivePasses: passes,
      };
    }

    case 'NEW_GAME': {
      meldCounter = 0;
      const initial = createInitialIsraeliRummyState(s.settings);
      return israeliRummyReducer(initial, { type: 'DEAL', seed: action.seed });
    }

    default:
      return s;
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Collect all cards from a list of melds into a flat array. */
function collectAllCards(melds: Meld[]): Card[] {
  const cards: Card[] = [];
  for (const m of melds) {
    cards.push(...m.cards);
  }
  return cards;
}

/**
 * Check that every card in `required` appears in `available`
 * (multiset inclusion: respects duplicates).
 */
function allCardsPresent(required: Card[], available: Card[]): boolean {
  const counts = new Map<string, number>();
  for (const c of available) {
    const key = cardKey(c);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const c of required) {
    const key = cardKey(c);
    const count = counts.get(key) ?? 0;
    if (count <= 0) return false;
    counts.set(key, count - 1);
  }
  return true;
}

/** Check that two multisets of cards are equal. */
function cardMultisetsEqual(a: Card[], b: Card[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const c of a) {
    const key = cardKey(c);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const c of b) {
    const key = cardKey(c);
    const count = counts.get(key) ?? 0;
    if (count <= 0) return false;
    counts.set(key, count - 1);
  }
  return true;
}

/**
 * Check that all snapshot melds are preserved exactly in the proposed melds.
 * Used for first-meld rule: player can't rearrange existing table melds.
 */
function snapshotMeldsPreserved(snapshotMelds: Meld[], proposedMelds: Meld[]): boolean {
  for (const snapMeld of snapshotMelds) {
    // Find this meld in proposed (by id)
    const proposed = proposedMelds.find(m => m.id === snapMeld.id);
    if (!proposed) return false;
    // Check same cards (order may differ, but multiset must match)
    if (!cardMultisetsEqual(snapMeld.cards, proposed.cards)) return false;
  }
  return true;
}

/**
 * Find cards that are in the proposed table but not in the snapshot table
 * (these are cards newly placed from the hand).
 */
function getNewTableCards(snapshotCards: Card[], proposedCards: Card[]): Card[] {
  const remaining = new Map<string, number>();
  for (const c of snapshotCards) {
    const key = cardKey(c);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const newCards: Card[] = [];
  for (const c of proposedCards) {
    const key = cardKey(c);
    const count = remaining.get(key) ?? 0;
    if (count > 0) {
      remaining.set(key, count - 1);
    } else {
      newCards.push(c);
    }
  }
  return newCards;
}

