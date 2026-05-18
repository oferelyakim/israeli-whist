/**
 * Regression test for the multi-meld first-turn bug.
 *
 * Repro before fix: another player has [5♥, 5♣, 5♠] on the table. Player
 * commits two new melds from hand: run [3♥, 4♥, 5♥] + set [10♣, 10♥, 10♠].
 * The 5♥ from hand collides by (suit, rank) with the 5♥ already on the
 * table (Israeli Rummy uses two decks), causing the existing meld to be
 * misclassified as "new" and failing the all-from-hand check.
 *
 * Run with:
 *   node --experimental-strip-types scripts/test-first-meld.mts
 */

import { israeliRummyReducer, createInitialIsraeliRummyState } from '../src/games/israeli-rummy/engine/game-reducer.ts';
import type { IsraeliRummyGameState, Meld } from '../src/games/israeli-rummy/types.ts';
import { IsraeliRummyPhase, TurnAction } from '../src/games/israeli-rummy/types.ts';
import { GameType, PlayerType } from '../src/types/game-common.ts';
import type { Card } from '../src/types/card.ts';

function card(suit: 'CLUBS' | 'DIAMONDS' | 'HEARTS' | 'SPADES', rank: number): Card {
  return { suit, rank, isJoker: false } as Card;
}

const existingMeld: Meld = {
  id: 'irummy_meld_existing_1',
  cards: [card('HEARTS', 5), card('CLUBS', 5), card('SPADES', 5)],
  type: 'set',
};

const handBefore: Card[] = [
  card('HEARTS', 3),
  card('HEARTS', 4),
  card('HEARTS', 5),     // collides with the 5♥ already on the table
  card('CLUBS', 10),
  card('HEARTS', 10),
  card('SPADES', 10),
  card('DIAMONDS', 2),   // a couple of leftover hand tiles
  card('DIAMONDS', 7),
];

const newRun: Meld = {
  id: 'new_run_xyz',
  cards: [card('HEARTS', 3), card('HEARTS', 4), card('HEARTS', 5)],
  type: 'run',
};

const newSet: Meld = {
  id: 'new_set_xyz',
  cards: [card('CLUBS', 10), card('HEARTS', 10), card('SPADES', 10)],
  type: 'set',
};

const baseState: IsraeliRummyGameState = {
  ...createInitialIsraeliRummyState({
    gameType: GameType.ISRAELI_RUMMY,
    numPlayers: 2,
    playerNames: ['Player', 'Bot'],
    playerTypes: [PlayerType.HUMAN, PlayerType.AI],
  }),
  phase: IsraeliRummyPhase.PLAYING,
  turnAction: TurnAction.REARRANGING,
  melds: [existingMeld],
  players: [
    {
      seat: 0,
      name: 'Player',
      type: PlayerType.HUMAN,
      hand: handBefore,
      hasMetFirstMeld: false,
      isConnected: true,
    },
    {
      seat: 1,
      name: 'Bot',
      type: PlayerType.AI,
      hand: [],
      hasMetFirstMeld: true,
      isConnected: true,
    },
  ],
  currentPlayer: 0,
  boardSnapshot: {
    melds: [{ ...existingMeld, cards: [...existingMeld.cards] }],
    hand: [...handBefore],
  },
  drawPile: [card('DIAMONDS', 11)],
};

const proposedHand: Card[] = [card('DIAMONDS', 2), card('DIAMONDS', 7)];

const next = israeliRummyReducer(baseState, {
  type: 'COMMIT_MELDS',
  melds: [existingMeld, newRun, newSet],
  hand: proposedHand,
});

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else      { console.log('PASS:', msg); }
}

assert(next !== baseState, 'reducer accepted the commit (returned a new state)');
assert(next.melds.length === 3, `melds length should be 3 (was ${next.melds.length})`);
assert(next.players[0].hasMetFirstMeld === true, 'player has now met first meld');
assert(next.players[0].hand.length === 2, `player hand should have 2 leftover tiles (was ${next.players[0].hand.length})`);
assert(next.currentPlayer === 1, 'turn advanced to next player');

// Sanity: a second test where the player tries to take a tile FROM the
// existing meld and stuff it into a new run. This MUST still be rejected.
const cheatNewRun: Meld = {
  id: 'new_cheat',
  // Uses 5♣ (which is in the existing meld) — should be rejected
  cards: [card('CLUBS', 3), card('CLUBS', 4), card('CLUBS', 5)],
  type: 'run',
};
const tamperedExisting: Meld = {
  ...existingMeld,
  cards: [card('HEARTS', 5), card('SPADES', 5)],  // 5♣ removed
};
const cheatHand: Card[] = handBefore.filter(c =>
  !(c.suit === 'HEARTS' && c.rank === 3) &&
  !(c.suit === 'HEARTS' && c.rank === 4) &&
  !(c.suit === 'HEARTS' && c.rank === 5)
);
cheatHand.push(card('CLUBS', 3), card('CLUBS', 4));
const cheatBase: IsraeliRummyGameState = {
  ...baseState,
  players: [
    { ...baseState.players[0], hand: [
      card('CLUBS', 3), card('CLUBS', 4),
      card('DIAMONDS', 2), card('DIAMONDS', 7),
    ] },
    baseState.players[1],
  ],
  boardSnapshot: {
    melds: [{ ...existingMeld, cards: [...existingMeld.cards] }],
    hand: [card('CLUBS', 3), card('CLUBS', 4), card('DIAMONDS', 2), card('DIAMONDS', 7)],
  },
};
const cheatResult = israeliRummyReducer(cheatBase, {
  type: 'COMMIT_MELDS',
  melds: [tamperedExisting, cheatNewRun],
  hand: [card('DIAMONDS', 2), card('DIAMONDS', 7)],
});
assert(cheatResult === cheatBase, 'reducer rejects rearranging an existing meld during first turn');

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll tests passed.');
