/**
 * Rearrange-stability regression: the two complaints the user reported after
 * the first fix attempt.
 *
 *  1. "As soon as I drag a tile from my hand to the table, the table is being
 *      rearranged." → sibling melds must NOT move when a drag begins / hovers.
 *  2. "When I add a 6 to [7,8,9] it added the 6 after the 9 and only sorted on
 *      submit; a joker for [10,11,_,13] only slotted in on submit." → a dropped
 *      tile must slot into its correct position WITHIN the target meld
 *      immediately (before commit).
 */
import { test, expect, type Page } from '@playwright/test';
import { seedSavedGame, enterSeededGame, c, joker, Suit, Rank } from './helpers/irummy';

const RUN_789 = 'm_run789';
const SET_444 = 'm_set444';
const RUN_10_11_13 = 'm_run101113';

async function seedBoard(page: Page): Promise<void> {
  await seedSavedGame(page, {
    numPlayers: 2,
    metFirstMeldSeats: [0], // no first-meld restriction — free to rearrange
    humanHand: [c(Suit.HEARTS, Rank.SIX), joker(true)],
    opponentHandSizes: [10],
    melds: [
      { id: RUN_789, type: 'run', cards: [c(Suit.HEARTS, 7), c(Suit.HEARTS, 8), c(Suit.HEARTS, 9)] },
      { id: SET_444, type: 'set', cards: [c(Suit.CLUBS, 4), c(Suit.DIAMONDS, 4), c(Suit.SPADES, 4)] },
      { id: RUN_10_11_13, type: 'run', cards: [c(Suit.CLUBS, 10), c(Suit.CLUBS, 11), c(Suit.CLUBS, 13)] },
    ],
  });
}

/** Read the visible tile numbers of a meld, in DOM order (★ for a joker). */
async function meldRanks(page: Page, meldIdx: number): Promise<string[]> {
  return page.evaluate((idx) => {
    const meld = document.querySelectorAll('.irummy-melds-grid > .irummy-meld')[idx];
    if (!meld) return [];
    return Array.from(meld.querySelectorAll('.irummy-meld-card')).map((cardEl) => {
      if (cardEl.querySelector('.rtile-joker-star')) return '★';
      const num = cardEl.querySelector('.rtile-number-main');
      return (num?.textContent ?? '').trim();
    });
  }, meldIdx);
}

/** Bounding boxes of every meld frame, keyed by first-card rank for stability. */
async function meldBoxes(page: Page): Promise<Record<string, { x: number; y: number }>> {
  return page.evaluate(() => {
    const out: Record<string, { x: number; y: number }> = {};
    document.querySelectorAll('.irummy-melds-grid > .irummy-meld').forEach((meld, i) => {
      const r = (meld as HTMLElement).getBoundingClientRect();
      out[`meld${i}`] = { x: Math.round(r.x), y: Math.round(r.y) };
    });
    return out;
  });
}

function handTile(page: Page, rank: string) {
  if (rank === '★') {
    return page.locator('.irummy-hand-card', { has: page.locator('.rtile-joker-star') }).first();
  }
  return page
    .locator('.irummy-hand-card', { has: page.locator('.rtile-number-main', { hasText: new RegExp(`^${rank}$`) }) })
    .first();
}

function meldFrame(page: Page, idx: number) {
  return page.locator('.irummy-melds-grid > .irummy-meld').nth(idx);
}

async function centerOf(page: Page, locator: ReturnType<Page['locator']>) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('no bounding box');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto('/');
  await seedBoard(page);
  await enterSeededGame(page, 2);
  // Melds render in seed order: [7,8,9], [4,4,4], [10,11,13].
  await expect(meldFrame(page, 0)).toBeVisible();
  await expect(meldFrame(page, 2)).toBeVisible();
});

test('sibling melds do not move when a hand drag starts and hovers the table', async ({ page }) => {
  const before = await meldBoxes(page);

  // Begin dragging the 6♥ from hand; move over the FIRST meld [7,8,9] but do
  // NOT release. This is the exact moment the user says "the table rearranges".
  const from = await centerOf(page, handTile(page, '6'));
  const over = await centerOf(page, meldFrame(page, 0));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + over.x) / 2, (from.y + over.y) / 2, { steps: 6 });
  await page.mouse.move(over.x, over.y, { steps: 6 });

  const during = await meldBoxes(page);

  // The set [4,4,4] and run [10,11,13] are NOT the drag target — they must not
  // move at all. Allow 2px for sub-pixel rounding only.
  for (const key of ['meld1', 'meld2']) {
    expect(Math.abs(during[key].x - before[key].x), `${key} x drifted`).toBeLessThanOrEqual(2);
    expect(Math.abs(during[key].y - before[key].y), `${key} y drifted`).toBeLessThanOrEqual(2);
  }

  await page.mouse.up();
});

test('a tile dropped on a meld slots into sorted position immediately (before commit)', async ({ page }) => {
  // Drop 6♥ onto [7,8,9] → must render [6,7,8,9], not [7,8,9,6].
  const from = await centerOf(page, handTile(page, '6'));
  const to = await centerOf(page, meldFrame(page, 0));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();

  await expect
    .poll(() => meldRanks(page, 0))
    .toEqual(['6', '7', '8', '9']);
});

test('a joker dropped into a run slots between its neighbours immediately', async ({ page }) => {
  // Drop the joker onto [10,11,13] → must render [10,11,★,13] (joker = 12).
  const from = await centerOf(page, handTile(page, '★'));
  const to = await centerOf(page, meldFrame(page, 2));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();

  await expect
    .poll(() => meldRanks(page, 2))
    .toEqual(['10', '11', '★', '13']);
});
