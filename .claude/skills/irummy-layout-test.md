---
name: irummy-layout-test
description: >
  Run the Israeli Rummy Playwright layout regression suite. Triggers on
  "test the rummy layout", "layout check", "run rummy e2e", "irummy test".
user-invocable: true
---

# Israeli Rummy — Layout Test Skill

Automated Playwright regression harness for the Israeli Rummy board layout.
Guards against the classic issues: meld overflow, opponent-chip collisions,
scrolling meld area, workbench regressions, and broken hand spacing.

Project: `C:\tmp\israeli-whist` | Dev preview port: **5175**

## When to use this skill

- User says "test the rummy layout", "layout check", "run rummy e2e", or
  "irummy test".
- After any change to `src/games/israeli-rummy/components/IsraeliRummyGameTable.{tsx,css}`.
- Before shipping a fix that touched meld sizing, hand rendering, or the
  opponent-chip layer.

## Prerequisites

1. Dev preview running on port 5175. The Playwright config has
   `reuseExistingServer: true`, so it will reuse the Claude Preview instance
   if one is already running — otherwise it spawns `npm run dev -- --port 5175`.
2. Playwright + Chromium installed:
   ```bash
   npm install
   npx playwright install chromium
   ```

## Steps

### 1. Ensure dev preview is running

```js
// Optional — only if not already running:
mcp__Claude_Preview__preview_start({ name: 'whist-dev' });
```

### 2. Run the suite

```bash
cd C:/tmp/israeli-whist
npm run test:e2e
```

For an interactive debug session:
```bash
npm run test:e2e:ui
```

To view the last HTML report:
```bash
npm run test:e2e:report
```

### 3. Interpret results

The suite has the following cases (in `tests/irummy-layout.spec.ts`):

| Test | What it guards |
|------|----------------|
| Initial state | 14 hand slots, 3 opponent chips, no melds, no workbench. |
| Layout fit @ 375/768/1200 — 8 melds + 10 hand | Melds don't overlap chips/hand/top bar and don't scroll. |
| Layout fit @ 375/768/1200 — 15 melds + 7 hand | Same, stress-case meld density. |
| Joker replacement | Dropping a card on a joker slot routes the displaced joker into building/new-meld area, never a workbench. |
| Hand sparse positioning | Dragging from slot 0 to empty slot 10 leaves slot 0 empty. |
| Hand sort with gaps | Sort 123 produces `C+E+C` pattern (inner empty slot). |

### Landscape & builder regressions to add

These aren't yet in the harness — add when introducing related changes:

| Test | What it guards |
|------|----------------|
| Layout fit @ 812×375 landscape | All blocks visible (top bar, opponents, draw pile, melds, hand, rearrange bar). Hand fits in a single row. Melds area `clientHeight === scrollHeight`. |
| Builder commit with unsorted run | Drop hand tiles into "+ New Set" in non-sorted order (e.g. 11♥ then 13♥ then joker), click Done — should commit without `israeliRummy.builderBlocksCommit` error. |
| First-meld progress includes builder | Builder holding a valid 30-pt meld during rearrange should advance `firstMeldProgress` — bar shows 30/30, not 0/30. |

## Common failures & quick fixes

### Tests flake because dev preview wasn't up

**Symptom**: `page.goto: ERR_CONNECTION_REFUSED`.
**Fix**: start the preview, then rerun.
```js
mcp__Claude_Preview__preview_start({ name: 'whist-dev' });
```

### Stale localStorage from previous runs

**Symptom**: "Initial state" test fails because the game restores a saved
seeded game from a previous run.
**Fix**: every test calls `clearSavedGame(page)` in `beforeEach`, so this
should be automatic — but if a test reloads after seeding and starts
without the clear call, that's the bug. See `tests/helpers/irummy.ts`.

### Meld-overlap tests fail

**Symptom**: `assertNoOverlap` reports collisions between `.irummy-meld` and
`.irummy-opponent-left` / `.irummy-hand-row` / `.irummy-top-bar`.
**Fix**: the dynamic sizing in `computeMeldAreaSizing` (near line 151 of
`IsraeliRummyGameTable.tsx`) or the `.irummy-melds-area` CSS padding is
producing a layout that bleeds into neighbors. Start by:
1. Open `preview_screenshot` at the failing viewport width.
2. Check `getComputedStyle(meldsArea).padding` matches `4px clamp(16px, 6vw, 80px)`.
3. Verify the `--meld-card-scale` CSS variable is being set.

### Joker replacement test fails

**Symptom**: "Displaced joker should appear in working/new-meld area" fails
OR "No workbench" fails (workbench element exists).
**Fix**: the drag logic (`findJokerToReplace` in `engine/validation.ts` and
the drop-handler in `IsraeliRummyGameTable.tsx`) regressed to pushing the
joker into a workbench. The design requires routing to the working area.

## Updating the harness

- **Add a new test**: append to `tests/irummy-layout.spec.ts`. Reuse helpers
  in `tests/helpers/irummy.ts`.
- **Add a new scenario fixture**: extend `scenarios` in `tests/helpers/irummy.ts`.
- **Add a viewport**: update the `for (const width of [375, 768, 1200])` loop.
