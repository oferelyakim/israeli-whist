/**
 * Helpers for the Israeli Rummy Playwright harness.
 *
 * These helpers are deliberately thin wrappers around Playwright primitives so
 * the test files read as a linear story. Card-state shapes mirror the
 * reducer's IsraeliRummyGameState, but we intentionally only spell out the
 * fields the UI needs so these tests remain resilient to adjacent schema
 * changes.
 */
import { expect, type Page, type Locator } from '@playwright/test';

// ─── Card primitives ──────────────────────────────────────────────────────

export const Suit = {
  CLUBS: 'CLUBS',
  DIAMONDS: 'DIAMONDS',
  HEARTS: 'HEARTS',
  SPADES: 'SPADES',
  JOKER_RED: 'JOKER_RED',
  JOKER_BLACK: 'JOKER_BLACK',
} as const;
export type SuitT = (typeof Suit)[keyof typeof Suit];

export const Rank = {
  JOKER: 0,
  TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7,
  EIGHT: 8, NINE: 9, TEN: 10, JACK: 11, QUEEN: 12, KING: 13, ACE: 14,
} as const;

export interface Card {
  suit: SuitT;
  rank: number;
}

export interface Meld {
  id: string;
  cards: Card[];
  type: 'set' | 'run';
}

/** Short constructor for a normal card. */
export const c = (suit: SuitT, rank: number): Card => ({ suit, rank });
/** Short constructor for a joker (red by default). */
export const joker = (red = true): Card => ({
  suit: red ? Suit.JOKER_RED : Suit.JOKER_BLACK,
  rank: Rank.JOKER,
});

// ─── Game state seeding ───────────────────────────────────────────────────

const SAVE_KEY = 'israeli-rummy-saved-game';

export interface SeedOptions {
  /** Number of seats (2–4). */
  numPlayers?: number;
  /** Human hand (seat 0). */
  humanHand: Card[];
  /** Hand sizes for AI opponents, in seat order 1..numPlayers-1. */
  opponentHandSizes?: number[];
  /** Melds currently on the table. */
  melds: Meld[];
  /** Override the firstMeldThreshold (default 30). */
  firstMeldThreshold?: number;
  /** Mark a seat as having met the first meld already (default: none). */
  metFirstMeldSeats?: number[];
}

/**
 * Stuff a synthetic IsraeliRummyGameState into localStorage so that when the
 * game screen mounts it restores this state directly. Intentionally minimal —
 * the reducer tolerates extra keys and missing keys default sensibly.
 */
export async function seedSavedGame(page: Page, opts: SeedOptions): Promise<void> {
  const numPlayers = opts.numPlayers ?? 4;
  const metSet = new Set(opts.metFirstMeldSeats ?? []);
  const opponentSizes = opts.opponentHandSizes ?? Array.from({ length: numPlayers - 1 }, () => 10);

  // Seat 0 is always the human. Opponents get placeholder cards — shape only.
  const players = Array.from({ length: numPlayers }, (_, i) => {
    const hand = i === 0
      ? opts.humanHand
      : Array.from({ length: opponentSizes[i - 1] ?? 10 }, () => ({ suit: Suit.SPADES, rank: 2 }));
    return {
      seat: i,
      name: i === 0 ? 'You' : `Bot ${i}`,
      type: i === 0 ? 'HUMAN' : 'AI',
      hand,
      hasMetFirstMeld: metSet.has(i),
      isConnected: true,
    };
  });

  const fakeState = {
    gameId: `irummy_test_${Date.now()}`,
    settings: {
      gameType: 'ISRAELI_RUMMY',
      numPlayers,
      playerNames: players.map(p => p.name),
      playerTypes: players.map(p => p.type),
    },
    phase: 'PLAYING',
    players,
    drawPile: Array.from({ length: 20 }, () => ({ suit: Suit.CLUBS, rank: 3 })),
    melds: opts.melds,
    currentPlayer: 0,
    turnAction: 'CHOOSE',
    numPlayers,
    winner: null,
    moveCount: 0,
    firstMeldThreshold: opts.firstMeldThreshold ?? 30,
    boardSnapshot: null,
  };

  await page.evaluate(
    ({ key, state }) => {
      localStorage.setItem(key, JSON.stringify(state));
    },
    { key: SAVE_KEY, state: fakeState },
  );
}

/** Purge any prior saved Israeli Rummy state so a fresh session starts clean. */
export async function clearSavedGame(page: Page): Promise<void> {
  await page.evaluate((key) => {
    localStorage.removeItem(key);
  }, SAVE_KEY);
}

// ─── Navigation ───────────────────────────────────────────────────────────

export interface StartGameOpts {
  /** Number of players (2, 3, or 4). Defaults to 4. */
  players?: number;
}

/**
 * Click through the main menu into a fresh Israeli Rummy game vs AI. The
 * tests that exercise the menu itself should not use this helper; everything
 * else should.
 */
export async function startGame(page: Page, opts: StartGameOpts = {}): Promise<void> {
  const players = opts.players ?? 4;

  // 1. Pick the Israeli Rummy tab. The tab list can be off-viewport on
  //    narrow screens so we scroll it into view and force-click to avoid
  //    hit-testing against the menu background photo.
  const irummyTab = page.getByRole('button', { name: /israeli rummy|ראמי ישראלי/i });
  await irummyTab.scrollIntoViewIfNeeded();
  await irummyTab.click({ force: true });

  // 2. Pick the player-count. The menu renders one button per count.
  const countBtn = page
    .locator('.player-count-btn', { hasText: new RegExp(`^${players}$`) })
    .first();
  await countBtn.scrollIntoViewIfNeeded();
  await countBtn.click({ force: true });

  // 3. Hit Play vs AI.
  const playBtn = page.getByRole('button', { name: /play vs ai|שחק נגד/i });
  await playBtn.scrollIntoViewIfNeeded();
  await playBtn.click({ force: true });

  // 4. Wait for the game table to render. `.irummy-hand-row` is only present
  //    on the game screen.
  await page.locator('.irummy-hand-row').waitFor({ state: 'visible', timeout: 10_000 });
}

/**
 * Navigate into the game assuming a saved game is already seeded in
 * localStorage. The menu's "Play vs AI" button hands settings to the game
 * screen which, on mount, finds the saved state and restores it.
 */
export async function enterSeededGame(page: Page, players = 4): Promise<void> {
  await startGame(page, { players });
}

// ─── Drag-and-drop ────────────────────────────────────────────────────────

/**
 * Drag a tile from one selector to another using pointer events. The Israeli
 * Rummy board uses pointer events (not HTML5 DnD) so we dispatch
 * mousedown/mousemove/mouseup with real coordinates.
 */
export async function dragTile(
  page: Page,
  fromSelector: string,
  toSelector: string,
): Promise<void> {
  const from = page.locator(fromSelector).first();
  const to = page.locator(toSelector).first();
  await from.waitFor({ state: 'visible' });
  await to.waitFor({ state: 'visible' });

  const fromBox = await from.boundingBox();
  const toBox = await to.boundingBox();
  if (!fromBox || !toBox) {
    throw new Error(`dragTile: missing bounding box (from=${!!fromBox}, to=${!!toBox})`);
  }
  const fromX = fromBox.x + fromBox.width / 2;
  const fromY = fromBox.y + fromBox.height / 2;
  const toX = toBox.x + toBox.width / 2;
  const toY = toBox.y + toBox.height / 2;

  await page.mouse.move(fromX, fromY);
  await page.mouse.down();
  // Small intermediate move to trigger dragstart semantics.
  await page.mouse.move((fromX + toX) / 2, (fromY + toY) / 2, { steps: 8 });
  await page.mouse.move(toX, toY, { steps: 8 });
  await page.mouse.up();
}

// ─── Layout assertions ────────────────────────────────────────────────────

interface Rect { x: number; y: number; width: number; height: number }

function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Assert that no element matched by `meldsSelector` visually overlaps any
 * element matched by any of the `obstacles` selectors.
 *
 * Uses getBoundingClientRect via page.evaluate so this is a true geometric
 * check, not a DOM-containment check.
 */
export async function assertNoOverlap(
  page: Page,
  meldsSelector: string,
  obstacles: string[],
): Promise<void> {
  const report = await page.evaluate(
    ({ meldsSelector, obstacles }) => {
      const getRects = (sel: string) =>
        Array.from(document.querySelectorAll(sel)).map((el) => {
          const r = (el as HTMLElement).getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height, sel };
        });
      const intersect = (a: Rect, b: Rect) =>
        !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
      type Rect = { x: number; y: number; width: number; height: number };

      const meldRects = getRects(meldsSelector);
      const collisions: Array<{ meldIdx: number; obstacle: string }> = [];
      for (const obs of obstacles) {
        const obsRects = getRects(obs);
        meldRects.forEach((m, i) => {
          for (const o of obsRects) {
            if (intersect(m, o)) {
              collisions.push({ meldIdx: i, obstacle: obs });
              break;
            }
          }
        });
      }
      return { meldCount: meldRects.length, collisions };
    },
    { meldsSelector, obstacles },
  );

  expect(
    report.collisions,
    `Expected no overlap between ${meldsSelector} and obstacles [${obstacles.join(', ')}]; ` +
    `got ${report.collisions.length} collisions across ${report.meldCount} melds`,
  ).toEqual([]);
}

/**
 * Assert that the given scrollable element has no vertical overflow — i.e.
 * its clientHeight equals scrollHeight (allowing 1px rounding).
 */
export async function assertNoScroll(page: Page, selector: string): Promise<void> {
  const { clientHeight, scrollHeight } = await page.evaluate((sel) => {
    const el = document.querySelector(sel) as HTMLElement | null;
    if (!el) return { clientHeight: -1, scrollHeight: -1 };
    return { clientHeight: el.clientHeight, scrollHeight: el.scrollHeight };
  }, selector);
  expect(clientHeight, `${selector} must be mounted`).toBeGreaterThan(0);
  expect(
    Math.abs(scrollHeight - clientHeight),
    `${selector} should not scroll (clientHeight=${clientHeight}, scrollHeight=${scrollHeight})`,
  ).toBeLessThanOrEqual(1);
}

/** Convenience: the standard obstacles a meld must never overlap. */
export const STANDARD_OBSTACLES = [
  '.irummy-opponent-left',
  '.irummy-opponent-right',
  '.irummy-hand-row',
  '.irummy-top-bar',
];

/** Scenario helpers — reproducible fixtures for layout tests. */
export const scenarios = {
  /** 8 melds + 10-card hand: dense but should still fit. */
  eightMeldsTenCardHand(): SeedOptions {
    const melds: Meld[] = [];
    for (let i = 0; i < 8; i++) {
      melds.push({
        id: `seed_m${i}`,
        type: 'run',
        cards: [
          c(Suit.HEARTS, 3 + (i % 5)),
          c(Suit.HEARTS, 4 + (i % 5)),
          c(Suit.HEARTS, 5 + (i % 5)),
        ],
      });
    }
    const humanHand: Card[] = Array.from({ length: 10 }, (_, i) => c(Suit.CLUBS, 3 + i));
    return { numPlayers: 4, humanHand, melds };
  },
  /** 15 melds + 7-card hand: stress fit for the melds area sizing. */
  fifteenMeldsSevenCardHand(): SeedOptions {
    const melds: Meld[] = [];
    for (let i = 0; i < 15; i++) {
      melds.push({
        id: `seed_m${i}`,
        type: i % 2 === 0 ? 'run' : 'set',
        cards: [
          c(i % 2 === 0 ? Suit.DIAMONDS : Suit.CLUBS, 3 + (i % 10)),
          c(i % 2 === 0 ? Suit.DIAMONDS : Suit.HEARTS, 4 + (i % 10)),
          c(i % 2 === 0 ? Suit.DIAMONDS : Suit.SPADES, 5 + (i % 10)),
        ],
      });
    }
    const humanHand: Card[] = Array.from({ length: 7 }, (_, i) => c(Suit.CLUBS, 3 + i));
    return { numPlayers: 4, humanHand, melds };
  },
  /** Meld `[A♥, J, 3♥, 4♥]` plus 2♥ in hand — the joker replacement test. */
  jokerReplacementFixture(): SeedOptions {
    return {
      numPlayers: 4,
      humanHand: [c(Suit.HEARTS, Rank.TWO)],
      melds: [
        {
          id: 'seed_joker_meld',
          type: 'run',
          cards: [c(Suit.HEARTS, Rank.ACE), joker(true), c(Suit.HEARTS, 3), c(Suit.HEARTS, 4)],
        },
      ],
      metFirstMeldSeats: [0],
    };
  },
  /** Hand whose sequence-sort produces two groups (separated by a gap). */
  twoGroupHand(): SeedOptions {
    return {
      numPlayers: 4,
      humanHand: [
        c(Suit.HEARTS, 3), c(Suit.HEARTS, 4), c(Suit.HEARTS, 5),
        c(Suit.CLUBS, 10), c(Suit.CLUBS, 11), c(Suit.CLUBS, 12),
      ],
      melds: [],
    };
  },
};

// ─── Small conveniences ───────────────────────────────────────────────────

export function handSlot(page: Page, idx: number): Locator {
  return page.locator(`[data-hand-slot="${idx}"]`);
}

export function meldCard(page: Page, meldIdx: number, cardIdx: number): Locator {
  return page
    .locator('.irummy-melds-area .irummy-meld')
    .nth(meldIdx)
    .locator('.irummy-meld-card')
    .nth(cardIdx);
}
