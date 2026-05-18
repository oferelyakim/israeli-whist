/**
 * Regression test: in a 2-deck game (Israeli Rummy uses two decks), two
 * jokers of the same colour share their cardKey. The earlier joker-
 * reclamation strategy in ai-player.ts identified jokers by cardKey, which
 * mis-assigned "this came from the table" vs "this came from the hand"
 * whenever the bot held a joker of the same colour as a joker on the table.
 * The result was a card-conservation violation, selfValidateCommit
 * silently reverted, and the bot's hand grew unbounded turn after turn.
 *
 * The fix uses object reference identity (`===`) to track the table joker.
 *
 * This test exercises that scenario:
 *   Hand: [JOKER_RED (in hand), 8♣, 9♣]
 *   Table: set [5♥, 5♦, JOKER_RED (filling for 5♠ or 5♣)] — joker of same colour
 * The bot should swap the table joker out (replacing it with 5♠/5♣ from
 * hand — but the hand has neither, so this swap shouldn't be attempted)
 * OR play the obvious new run [JOKER_RED, 8♣, 9♣] from hand.
 *
 * Because the hand has no replacement for the table joker, Strategy A
 * shouldn't fire — but the test ensures the bot still finds and plays the
 * new run from hand without reverting.
 *
 * A second scenario gives the bot a swap candidate AND verifies card
 * conservation through commit.
 */

import { getIsraeliRummyAIAction } from '../src/games/israeli-rummy/ai/ai-player.ts';
import { israeliRummyReducer, createInitialIsraeliRummyState } from '../src/games/israeli-rummy/engine/game-reducer.ts';
import type { IsraeliRummyGameState, Meld } from '../src/games/israeli-rummy/types.ts';
import { IsraeliRummyPhase, TurnAction } from '../src/games/israeli-rummy/types.ts';
import { GameType, PlayerType } from '../src/types/game-common.ts';
import type { Card } from '../src/types/card.ts';

function card(suit: 'CLUBS' | 'DIAMONDS' | 'HEARTS' | 'SPADES', rank: number): Card {
  return { suit, rank } as Card;
}
function jokerRed(): Card { return { suit: 'JOKER_RED', rank: 0 } as Card; }
function jokerBlack(): Card { return { suit: 'JOKER_BLACK', rank: 0 } as Card; }

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (!cond) { console.error('FAIL:', msg); failures++; }
  else      { console.log('PASS:', msg); }
}

function makeState(opts: {
  hand: Card[];
  melds: Meld[];
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
    drawPile: [card('DIAMONDS', 11), card('DIAMONDS', 12)],
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

function totalCards(state: IsraeliRummyGameState): number {
  const meldCards = state.melds.reduce((n, m) => n + m.cards.length, 0);
  const handCards = state.players.reduce((n, p) => n + p.hand.length, 0);
  return meldCards + handCards;
}

// ─── Scenario A: hand has same-colour joker as a table-meld joker ─────────
// The bot should NOT silently revert. With a swap candidate available, it
// should perform the joker swap correctly without losing or duplicating
// any tile (card conservation).
//
// Setup: table run [JOKER_RED, 6♣, 7♣] (joker fills for 5♣). Bot hand has
// [5♣, JOKER_RED, 9♣, 10♣]. Strategy A swaps the table joker for the
// hand's 5♣. Freed table joker should land in a NEW meld using the bot's
// own joker (JOKER_RED) + 9♣ + 10♣ won't form a run with another joker
// alone, but the freed joker can extend the existing run, OR form a new
// run with hand cards. Either way, the move must be conservation-clean.
{
  const tableJoker = jokerRed();
  const meld: Meld = {
    id: 'm1',
    cards: [tableJoker, card('CLUBS', 6), card('CLUBS', 7)],
    type: 'run',
  };
  const handJoker = jokerRed();
  const handCards = [card('CLUBS', 5), handJoker, card('CLUBS', 9), card('CLUBS', 10)];
  const state = makeState({ hand: handCards, melds: [meld] });
  const totalBefore = totalCards(state);

  const choose = getIsraeliRummyAIAction(state, 0);
  assert(choose !== null, 'Scenario A: AI returns an action');
  assert(choose?.type === 'START_REARRANGE', 'Scenario A: AI starts rearrange (joker swap available)');

  if (choose?.type === 'START_REARRANGE') {
    const afterStart = israeliRummyReducer(state, { type: 'START_REARRANGE' });
    const commit = getIsraeliRummyAIAction(afterStart, 0);
    assert(commit?.type === 'COMMIT_MELDS', 'Scenario A: AI returns COMMIT_MELDS, not REVERT_REARRANGE');

    if (commit?.type === 'COMMIT_MELDS') {
      const afterCommit = israeliRummyReducer(afterStart, commit);
      // The reducer accepts only if conservation holds. If it rejects, state stays in REARRANGING.
      assert(afterCommit.turnAction === TurnAction.CHOOSE,
        `Scenario A: reducer accepted commit (turnAction=${afterCommit.turnAction})`);
      const totalAfter = totalCards(afterCommit);
      assert(totalAfter === totalBefore,
        `Scenario A: card conservation holds (before=${totalBefore}, after=${totalAfter})`);
    }
  }
}

// ─── Scenario B: bot has a black AND red joker, table has a red joker ────
// Cardkey collision case: hand has handJoker(RED). Table has tableJoker(RED).
// The "wrong" answer would consume the hand joker as if it were the table
// joker. We assert the bot doesn't silently revert and the resulting
// commit preserves card conservation.
{
  const tableJoker = jokerRed();
  // table set: filling 7♠ via joker
  const meld: Meld = {
    id: 'm1',
    cards: [card('HEARTS', 7), card('DIAMONDS', 7), tableJoker],
    type: 'set',
  };
  const handJoker = jokerRed();
  const handCards = [card('SPADES', 7), handJoker, card('CLUBS', 4), card('CLUBS', 5)];
  const state = makeState({ hand: handCards, melds: [meld] });
  const totalBefore = totalCards(state);

  const choose = getIsraeliRummyAIAction(state, 0);
  assert(choose?.type === 'START_REARRANGE',
    'Scenario B: AI starts rearrange (swap 7♠ in for table joker, reuse joker in new meld)');

  if (choose?.type === 'START_REARRANGE') {
    const afterStart = israeliRummyReducer(state, { type: 'START_REARRANGE' });
    const commit = getIsraeliRummyAIAction(afterStart, 0);
    assert(commit?.type === 'COMMIT_MELDS', 'Scenario B: AI returns COMMIT_MELDS rather than reverting');

    if (commit?.type === 'COMMIT_MELDS') {
      const afterCommit = israeliRummyReducer(afterStart, commit);
      assert(afterCommit.turnAction === TurnAction.CHOOSE,
        `Scenario B: reducer accepted commit (turnAction=${afterCommit.turnAction})`);
      const totalAfter = totalCards(afterCommit);
      assert(totalAfter === totalBefore,
        `Scenario B: card conservation holds (before=${totalBefore}, after=${totalAfter})`);

      // Hand should have shrunk (bot played at least one tile).
      const handBefore = state.players[0].hand.length;
      const handAfter = afterCommit.players[0].hand.length;
      assert(handAfter < handBefore,
        `Scenario B: bot played at least one tile (hand: ${handBefore} -> ${handAfter})`);
    }
  }
}

// ─── Scenario C: large stuck hand — bot must find SOMETHING to play ───────
// Hand of 30 tiles with no full melds in hand but at least one obvious
// layoff. The fallback layoff sweep should kick in if the main pipeline
// produces a faulty proposal. Simulates the user-reported "bot has 30
// tiles and can't put down anything".
{
  // Table: set of 5s, run of hearts 6-9, run of clubs 9-J.
  const set5: Meld = {
    id: 'm1',
    cards: [card('CLUBS', 5), card('DIAMONDS', 5), card('SPADES', 5)],
    type: 'set',
  };
  const runH: Meld = {
    id: 'm2',
    cards: [card('HEARTS', 6), card('HEARTS', 7), card('HEARTS', 8), card('HEARTS', 9)],
    type: 'run',
  };
  const runC: Meld = {
    id: 'm3',
    cards: [card('CLUBS', 9), card('CLUBS', 10), card('CLUBS', 11)],
    type: 'run',
  };

  // 30 random "junk" tiles, but sneak in one obvious layoff: 5♥ → set5,
  // and 12♣ → runC (extends to Q), and 10♥ → runH (extends to 10).
  const hand: Card[] = [
    card('HEARTS', 5),       // → set5
    card('CLUBS', 12),       // → runC
    card('HEARTS', 10),      // → runH
    // 27 unrelated tiles
    card('DIAMONDS', 2), card('DIAMONDS', 3), card('SPADES', 8),
    card('SPADES', 9), card('HEARTS', 13), card('DIAMONDS', 9),
    card('SPADES', 11), card('SPADES', 12), card('CLUBS', 2),
    card('DIAMONDS', 13), card('SPADES', 4), card('HEARTS', 11),
    card('DIAMONDS', 4), card('CLUBS', 13), card('SPADES', 13),
    card('HEARTS', 12), card('SPADES', 6), card('SPADES', 7),
    card('SPADES', 10), card('CLUBS', 6), card('CLUBS', 7),
    card('DIAMONDS', 6), card('DIAMONDS', 7), card('DIAMONDS', 8),
    card('DIAMONDS', 10), card('CLUBS', 4), card('HEARTS', 4),
  ];
  const state = makeState({ hand, melds: [set5, runH, runC] });
  const totalBefore = totalCards(state);
  assert(state.players[0].hand.length === 30, `Scenario C: bot hand has 30 tiles`);

  const choose = getIsraeliRummyAIAction(state, 0);
  assert(choose?.type === 'START_REARRANGE',
    'Scenario C: bot with 30 tiles starts rearrange (layoffs available)');

  if (choose?.type === 'START_REARRANGE') {
    const afterStart = israeliRummyReducer(state, { type: 'START_REARRANGE' });
    const commit = getIsraeliRummyAIAction(afterStart, 0);
    assert(commit?.type === 'COMMIT_MELDS',
      'Scenario C: bot returns COMMIT_MELDS — does NOT silently revert');

    if (commit?.type === 'COMMIT_MELDS') {
      const afterCommit = israeliRummyReducer(afterStart, commit);
      assert(afterCommit.turnAction === TurnAction.CHOOSE,
        `Scenario C: reducer accepted commit`);
      const totalAfter = totalCards(afterCommit);
      assert(totalAfter === totalBefore,
        `Scenario C: card conservation holds (before=${totalBefore}, after=${totalAfter})`);
      const handAfter = afterCommit.players[0].hand.length;
      assert(handAfter < 30, `Scenario C: bot placed at least one tile (hand=${handAfter})`);
    }
  }
}

void jokerBlack;
if (failures > 0) {
  console.error(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll 2-deck joker collision tests passed.');
