/**
 * Regression test: bots must lay off single cards onto existing melds, not
 * just place complete new sets/runs from hand.
 *
 * Reported by user 2026-04-24: "the bots still don't get rid of cards
 * unless they have a set". This test exercises several scenarios where
 * the bot has a layoff opportunity but no full new meld in hand, and
 * confirms the AI returns a COMMIT_MELDS that places at least one card.
 */

import { getIsraeliRummyAIAction } from '../src/games/israeli-rummy/ai/ai-player.ts';
import { createInitialIsraeliRummyState } from '../src/games/israeli-rummy/engine/game-reducer.ts';
import type { IsraeliRummyGameState, Meld } from '../src/games/israeli-rummy/types.ts';
import { IsraeliRummyPhase, TurnAction } from '../src/games/israeli-rummy/types.ts';
import { GameType, PlayerType } from '../src/types/game-common.ts';
import type { Card } from '../src/types/card.ts';

function card(suit: 'CLUBS' | 'DIAMONDS' | 'HEARTS' | 'SPADES', rank: number): Card {
  return { suit, rank, isJoker: false } as Card;
}

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else      { console.log('PASS:', msg); }
}

function makeState(opts: {
  hand: Card[];
  melds: Meld[];
  drawPile?: Card[];
  hasMetFirstMeld?: boolean;
}): IsraeliRummyGameState {
  const base = createInitialIsraeliRummyState({
    gameType: GameType.ISRAELI_RUMMY,
    numPlayers: 2,
    playerNames: ['Bot', 'Other'],
    playerTypes: [PlayerType.AI, PlayerType.AI],
  });
  return {
    ...base,
    phase: IsraeliRummyPhase.PLAYING,
    turnAction: TurnAction.CHOOSE,
    melds: opts.melds,
    drawPile: opts.drawPile ?? [card('DIAMONDS', 11), card('DIAMONDS', 12)],
    players: [
      {
        seat: 0,
        name: 'Bot',
        type: PlayerType.AI,
        hand: opts.hand,
        hasMetFirstMeld: opts.hasMetFirstMeld ?? true,
        isConnected: true,
      },
      {
        seat: 1,
        name: 'Other',
        type: PlayerType.AI,
        hand: [card('SPADES', 2)],
        hasMetFirstMeld: true,
        isConnected: true,
      },
    ],
    currentPlayer: 0,
  };
}

function runRearrange(state: IsraeliRummyGameState): { startedRearrange: boolean; commit: { melds: Meld[]; hand: Card[] } | null } {
  const choose = getIsraeliRummyAIAction(state, 0);
  if (!choose || choose.type !== 'START_REARRANGE') {
    return { startedRearrange: false, commit: null };
  }
  const player = state.players[0];
  const rearrangingState: IsraeliRummyGameState = {
    ...state,
    turnAction: TurnAction.REARRANGING,
    boardSnapshot: {
      melds: state.melds.map(m => ({ ...m, cards: [...m.cards] })),
      hand: [...player.hand],
    },
  };
  const commit = getIsraeliRummyAIAction(rearrangingState, 0);
  if (!commit || commit.type !== 'COMMIT_MELDS') {
    return { startedRearrange: true, commit: null };
  }
  return { startedRearrange: true, commit: { melds: commit.melds, hand: commit.hand } };
}

// ─── Scenario 1: pure layoff onto a set ──────────────────────────────────
// Bot hand: [5♥, K♣]. Table: set [5♣,5♦,5♠] and run [J♥,Q♥,K♥,A♥].
// 5♥ should lay off onto the set. K♣ has nowhere to go.
{
  const setMeld: Meld = {
    id: 'm1',
    cards: [card('CLUBS', 5), card('DIAMONDS', 5), card('SPADES', 5)],
    type: 'set',
  };
  const runMeld: Meld = {
    id: 'm2',
    cards: [card('HEARTS', 10), card('HEARTS', 11), card('HEARTS', 12), card('HEARTS', 13)],
    type: 'run',
  };
  const state = makeState({
    hand: [card('HEARTS', 5), card('CLUBS', 13)],
    melds: [setMeld, runMeld],
  });
  const { startedRearrange, commit } = runRearrange(state);
  assert(startedRearrange, 'Scenario 1: bot starts rearrange when it has a layoff card');
  assert(commit !== null, 'Scenario 1: bot returns COMMIT_MELDS rather than reverting');
  if (commit) {
    const placedFromHand = state.players[0].hand.length - commit.hand.length;
    assert(placedFromHand >= 1, `Scenario 1: bot placed ≥1 card from hand (placed=${placedFromHand})`);
    const fiveOnTable = commit.melds.flatMap(m => m.cards).filter(c => c.rank === 5 && c.suit === 'HEARTS').length;
    assert(fiveOnTable === 1, `Scenario 1: 5♥ now on table (count=${fiveOnTable})`);
  }
}

// ─── Scenario 2: pure layoff onto a run ──────────────────────────────────
// Bot hand: [10♣]. Table: run [J♣,Q♣,K♣].
// 10♣ should prepend to the run.
{
  const runMeld: Meld = {
    id: 'm1',
    cards: [card('CLUBS', 11), card('CLUBS', 12), card('CLUBS', 13)],
    type: 'run',
  };
  const state = makeState({
    hand: [card('CLUBS', 10)],
    melds: [runMeld],
  });
  const { startedRearrange, commit } = runRearrange(state);
  assert(startedRearrange, 'Scenario 2: bot starts rearrange to lay off run extension');
  assert(commit !== null, 'Scenario 2: bot returns COMMIT_MELDS');
  if (commit) {
    assert(commit.hand.length === 0, `Scenario 2: hand emptied after layoff (hand size=${commit.hand.length})`);
  }
}

// ─── Scenario 3: layoff plus a new set ───────────────────────────────────
// Bot hand: [3♥, 3♦, 3♠, 5♥]. Table: set [5♣,5♦,5♠].
// Bot should place new set [3♥,3♦,3♠] AND lay off 5♥.
{
  const setMeld: Meld = {
    id: 'm1',
    cards: [card('CLUBS', 5), card('DIAMONDS', 5), card('SPADES', 5)],
    type: 'set',
  };
  const state = makeState({
    hand: [card('HEARTS', 3), card('DIAMONDS', 3), card('SPADES', 3), card('HEARTS', 5)],
    melds: [setMeld],
  });
  const { startedRearrange, commit } = runRearrange(state);
  assert(startedRearrange, 'Scenario 3: bot starts rearrange (set+layoff)');
  assert(commit !== null, 'Scenario 3: bot returns COMMIT_MELDS');
  if (commit) {
    assert(commit.hand.length === 0, `Scenario 3: hand emptied — bot won (hand size=${commit.hand.length})`);
    assert(commit.melds.length === 2, `Scenario 3: 2 melds on table after commit (count=${commit.melds.length})`);
  }
}

// ─── Scenario 4: multi-layoff ────────────────────────────────────────────
// Bot hand: [5♥, 7♣]. Table: set [5♣,5♦,5♠], set [7♥,7♦,7♠].
// Both cards should lay off.
{
  const set5: Meld = {
    id: 'm1',
    cards: [card('CLUBS', 5), card('DIAMONDS', 5), card('SPADES', 5)],
    type: 'set',
  };
  const set7: Meld = {
    id: 'm2',
    cards: [card('HEARTS', 7), card('DIAMONDS', 7), card('SPADES', 7)],
    type: 'set',
  };
  const state = makeState({
    hand: [card('HEARTS', 5), card('CLUBS', 7)],
    melds: [set5, set7],
  });
  const { startedRearrange, commit } = runRearrange(state);
  assert(startedRearrange, 'Scenario 4: bot starts rearrange for multi-layoff');
  assert(commit !== null, 'Scenario 4: bot returns COMMIT_MELDS');
  if (commit) {
    assert(commit.hand.length === 0, `Scenario 4: both cards laid off — hand emptied (size=${commit.hand.length})`);
  }
}

// ─── Scenario 5: layoff at end of run (high side) ────────────────────────
// Bot hand: [8♥]. Table: run [5♥,6♥,7♥].
// 8♥ should append to the run.
{
  const runMeld: Meld = {
    id: 'm1',
    cards: [card('HEARTS', 5), card('HEARTS', 6), card('HEARTS', 7)],
    type: 'run',
  };
  const state = makeState({
    hand: [card('HEARTS', 8)],
    melds: [runMeld],
  });
  const { startedRearrange, commit } = runRearrange(state);
  assert(startedRearrange, 'Scenario 5: bot starts rearrange for high-end run layoff');
  assert(commit !== null, 'Scenario 5: bot returns COMMIT_MELDS');
  if (commit) {
    assert(commit.hand.length === 0, `Scenario 5: 8♥ laid off (hand size=${commit.hand.length})`);
  }
}

// ─── Scenario 6: ENDGAME — short hand, must lay off everything ───────────
// Bot hand size <= 5 forces endgame mode.
// Hand: [4♣, 9♥, K♠]. Table: run [2♣,3♣,4♣ NOPE that's a 3 card], set [9♣,9♦,9♠], set [K♥,K♦,K♣].
// Wait — 4♣ can't lay off onto a run [2♣,3♣,...] because the run needs to extend. Let me use [5♣,6♣,7♣] so 4♣ prepends.
{
  const run: Meld = {
    id: 'm1',
    cards: [card('CLUBS', 5), card('CLUBS', 6), card('CLUBS', 7)],
    type: 'run',
  };
  const set9: Meld = {
    id: 'm2',
    cards: [card('CLUBS', 9), card('DIAMONDS', 9), card('SPADES', 9)],
    type: 'set',
  };
  const setK: Meld = {
    id: 'm3',
    cards: [card('HEARTS', 13), card('DIAMONDS', 13), card('CLUBS', 13)],
    type: 'set',
  };
  const state = makeState({
    hand: [card('CLUBS', 4), card('HEARTS', 9), card('SPADES', 13)],
    melds: [run, set9, setK],
  });
  const { startedRearrange, commit } = runRearrange(state);
  assert(startedRearrange, 'Scenario 6 (endgame): bot starts rearrange with 3 layoffs available');
  assert(commit !== null, 'Scenario 6: bot returns COMMIT_MELDS');
  if (commit) {
    assert(commit.hand.length === 0, `Scenario 6: all 3 cards laid off — hand emptied (size=${commit.hand.length})`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll layoff tests passed.');
