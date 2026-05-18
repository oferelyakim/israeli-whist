import { test, expect } from '@playwright/test';
import {
  assertNoOverlap,
  assertNoScroll,
  clearSavedGame,
  dragTile,
  enterSeededGame,
  handSlot,
  meldCard,
  scenarios,
  seedSavedGame,
  startGame,
  STANDARD_OBSTACLES,
} from './helpers/irummy';

test.describe('Israeli Rummy — layout regression harness', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await clearSavedGame(page);
  });

  test('initial state: 14 slots, 3 opponent chips, no melds, no workbench', async ({ page }) => {
    // Re-navigate after clearing localStorage so the fresh state takes effect.
    await page.goto('/');
    await startGame(page, { players: 4 });

    // 14 slots in the hand grid (always at least MIN_SLOTS=14).
    const slotCount = await page.locator('[data-hand-slot]').count();
    expect(slotCount).toBeGreaterThanOrEqual(14);

    // Opponent chips: for 4 players we expect 3 opponents — left, top, right.
    await expect(page.locator('.irummy-opponent-chip')).toHaveCount(3);
    await expect(page.locator('.irummy-opponent-left')).toBeVisible();
    await expect(page.locator('.irummy-opponent-top')).toBeVisible();
    await expect(page.locator('.irummy-opponent-right')).toBeVisible();

    // No melds yet.
    await expect(page.locator('.irummy-melds-area .irummy-meld').filter({
      hasNot: page.locator('.irummy-meld-new-slot'),
    })).toHaveCount(0);

    // No workbench banner visible when there are no jokers.
    await expect(page.locator('.irummy-workbench')).toHaveCount(0);
  });

  for (const width of [375, 768, 1200]) {
    test(`layout fit @ ${width}px — 8 melds + 10-card hand`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await seedSavedGame(page, scenarios.eightMeldsTenCardHand());
      await page.reload();
      await enterSeededGame(page, 4);

      await assertNoOverlap(page, '.irummy-melds-area .irummy-meld', STANDARD_OBSTACLES);
      await assertNoScroll(page, '.irummy-melds-area');
    });

    test(`layout fit @ ${width}px — 15 melds + 7-card hand`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/');
      await seedSavedGame(page, scenarios.fifteenMeldsSevenCardHand());
      await page.reload();
      await enterSeededGame(page, 4);

      await assertNoOverlap(page, '.irummy-melds-area .irummy-meld', STANDARD_OBSTACLES);
      await assertNoScroll(page, '.irummy-melds-area');
    });
  }

  test('joker replacement routes to building / new-meld area, not workbench', async ({ page }) => {
    await page.goto('/');
    await seedSavedGame(page, scenarios.jokerReplacementFixture());
    await page.reload();
    await enterSeededGame(page, 4);

    // Enter rearrange mode. The UI exposes a toggle / "rearrange" entry —
    // start by clicking on the meld, which enters rearrange in the current
    // design. If the design changes, this helper is the place to fix.
    await page.locator('.irummy-melds-area .irummy-meld').first().click();

    // Drag 2♥ (the only hand card) onto the joker slot in the meld.
    // The joker is the 2nd card (index 1) of the meld per the fixture.
    await dragTile(
      page,
      '[data-hand-slot="0"]',
      '.irummy-melds-area .irummy-meld .irummy-meld-card >> nth=1',
    );

    // After the drag, the first meld should contain [A♥, 2♥, 3♥, 4♥]
    // — the joker is replaced by the 2 and routed away.
    const meldCardCount = await page
      .locator('.irummy-melds-area .irummy-meld')
      .first()
      .locator('.irummy-meld-card')
      .count();
    expect(meldCardCount).toBe(4);

    // No legacy workbench element should ever materialize.
    await expect(page.locator('.irummy-workbench')).toHaveCount(0);

    // The displaced joker should land in the building / new-meld area.
    // Design shows it in the "working area" or the persistent new-slot.
    const jokerLandedInBuilding = await page.evaluate(() => {
      const inWorking = document.querySelector('.irummy-working-area .irummy-meld-card');
      const inNewSlot = document.querySelector('.irummy-meld-new-slot .irummy-meld-card');
      return Boolean(inWorking || inNewSlot);
    });
    // Soft assertion: if the implementation still routes the joker elsewhere,
    // mark the test as failed but with a clear message — this is the
    // layout-intent the harness is meant to guard.
    expect(jokerLandedInBuilding, 'Displaced joker should appear in working/new-meld area').toBe(true);
  });

  test('hand sparse positioning: drag tile from slot 0 to slot 10 leaves a gap', async ({ page }) => {
    await page.goto('/');
    await startGame(page, { players: 4 });

    // Capture the card that lives in slot 0 before we drag it.
    const slotZeroSig = await handSlot(page, 0).innerHTML();
    expect(slotZeroSig.length).toBeGreaterThan(0);

    // Slot 10 should be empty in the standard 14-tile opening grid (we dealt
    // ~ the standard number of cards). Drop slot 0 onto slot 10.
    await dragTile(page, '[data-hand-slot="0"]', '[data-hand-slot="10"]');

    // Slot 0 now empty (placeholder rendered, no card node).
    const slot0HasCard = await page.evaluate(() => {
      const el = document.querySelector('[data-hand-slot="0"]');
      return el?.classList.contains('irummy-hand-card') ?? false;
    });
    expect(slot0HasCard).toBe(false);

    // Slot 10 now has a card.
    const slot10HasCard = await page.evaluate(() => {
      const el = document.querySelector('[data-hand-slot="10"]');
      return el?.classList.contains('irummy-hand-card') ?? false;
    });
    expect(slot10HasCard).toBe(true);
  });

  test('hand sort with gaps: Sort 123 introduces an empty slot between groups', async ({ page }) => {
    await page.goto('/');
    await seedSavedGame(page, scenarios.twoGroupHand());
    await page.reload();
    await enterSeededGame(page, 4);

    // Click "Sort by sequence" — the Sort 123 button.
    await page.getByRole('button', { name: /sort.*seq|123|sequence/i }).first().click();

    // After sort there should be at least one empty slot positioned between
    // cards (not just trailing after all the cards).
    const pattern = await page.evaluate(() => {
      const nodes = Array.from(document.querySelectorAll('[data-hand-slot]'));
      return nodes.map((el) => el.classList.contains('irummy-hand-card') ? 'C' : 'E');
    });
    // There must be a pattern like ...C E... C... (an E between two Cs).
    const joined = pattern.join('');
    const hasInnerGap = /C+E+C/.test(joined);
    expect(hasInnerGap, `Expected inner gap after sort, got ${joined}`).toBe(true);
  });
});
