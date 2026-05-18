---
name: irummy-ux-review
description: >
  Focused UX review of the Israeli Rummy board — manual screenshots + a
  checklist for the known-good layout, combined with the Playwright
  regression suite. Triggers on "review the rummy ux", "ux review",
  "irummy ux", or "rummy ux check".
user-invocable: true
---

# Israeli Rummy — UX Review Skill

A targeted UX audit of the Israeli Rummy board. Combines quick visual checks
via `mcp__Claude_Preview__preview_*` with the automated Playwright regression
suite for measurable assertions.

Project: `C:\tmp\israeli-whist` | Dev preview port: **5175**

## When to use this skill

- User says "review the rummy ux", "ux review", "irummy ux",
  "rummy ux check".
- After visual/CSS work on the Israeli Rummy table.
- Before a release, as a last sanity pass.

## Steps

### 1. Start (or reuse) the dev preview

```js
mcp__Claude_Preview__preview_start({ name: 'whist-dev' });
```

### 2. Capture the baseline screenshots

Navigate into Israeli Rummy vs AI with 4 players, then screenshot at each
reference viewport:

```js
mcp__Claude_Preview__preview_resize({ width: 375,  height: 812 });
mcp__Claude_Preview__preview_screenshot({ path: '.claude/screenshots/irummy-375.png' });

mcp__Claude_Preview__preview_resize({ width: 768,  height: 1024 });
mcp__Claude_Preview__preview_screenshot({ path: '.claude/screenshots/irummy-768.png' });

mcp__Claude_Preview__preview_resize({ width: 1200, height: 800 });
mcp__Claude_Preview__preview_screenshot({ path: '.claude/screenshots/irummy-1200.png' });
```

For the stress scenarios, use `preview_eval` to seed a dense board via
localStorage before reloading:

```js
mcp__Claude_Preview__preview_eval({
  code: `
    localStorage.setItem('israeli-rummy-saved-game', JSON.stringify(/* 15-meld fixture */));
    location.reload();
  `,
});
```

(See `tests/helpers/irummy.ts` — `scenarios.fifteenMeldsSevenCardHand()` for
the exact shape.)

### 3. Manual checklist

For each viewport screenshot, verify:

- [ ] **Hand grid**: shows at least **14 slots** (even with fewer cards).
  Empty slots appear as translucent placeholders, not invisible gaps.
- [ ] **Opponent chips**: 3 chips for a 4-player game, positioned **left,
  top, and right**. Active player has `irummy-opponent-active` styling.
- [ ] **Melds never overlap**:
  - Opponent chips (left/right)
  - The hand rack (`.irummy-hand-row`)
  - The top bar (`.irummy-top-bar`)
- [ ] **No workbench element exists**. Jokers being replaced should land in
  the **working area** or the persistent **"+ New meld"** slot. If you see
  a `.irummy-workbench` anywhere, that's a regression.
- [ ] **Melds area never scrolls**: `clientHeight === scrollHeight` on
  `.irummy-melds-area`. The sizing algorithm should handle dense boards by
  switching to the `rows`/`dense` layout — not by overflowing.
- [ ] **Suit colors are correct**: spades/clubs black, hearts red, and
  **diamonds are green** (the app's distinctive choice). Jokers have their
  own star motif.
- [ ] **Turn affordances**:
  - Draw pile glows / has a clear "Draw" label when it's the human's turn
  - Sort by suit / Sort 123 buttons visible and clickable
  - Rearrange mode has a clear Done/Cancel action surface
- [ ] **Mobile (375px)**: no horizontal scroll on the root; no tiny
  unreadable cards; opponent chips collapse to badges not full cards.
- [ ] **Landscape (812×375)**: every block visible — top bar, opponents
  anchored under the top bar (`top: 32px`, NOT vertically centered),
  draw pile, melds, sort buttons, single-row hand grid, rearrange bar.
  No clipping, no scrollbar in `.irummy-melds-area`. Tile sizes follow
  the 3-tier system (≤35 LARGE, 36–70 MEDIUM, 71+ SMALL) for melds; hand
  uses 36×50 tiles in landscape.
- [ ] **Builder commit guard**: tiles dropped into the "+ New Set" frame
  in arbitrary order must still validate as a run/set when the user
  clicks Done. Builder validation must run against
  `sortMeldCards(builder)` — see `handleCommit` and `firstMeldProgress`.
  Regression: `[11♥, 13♥, joker]` (insertion order) should commit fine.

### 4. Run the automated regression suite

Manual checks catch visual issues; the Playwright suite catches geometric
ones.

```bash
npm run test:e2e
```

See `.claude/skills/irummy-layout-test.md` for details. At minimum the
**Initial state** case must pass before shipping.

### 5. Common issues to watch for

| Symptom | Likely cause | File |
|---------|--------------|------|
| Melds bleed into opponent chips on desktop | `.irummy-melds-area` padding regression | `IsraeliRummyGameTable.css` ~line 402 |
| Scrollbar in melds area | Sizing algorithm hitting MIN_SCALE | `IsraeliRummyGameTable.tsx` `computeMeldAreaSizing` |
| Hand slots collapse to fewer than 14 | `MIN_SLOTS` constant or `HAND_COLS` math | `IsraeliRummyGameTable.tsx` ~line 1540 |
| Displaced joker lands in workbench | `findJokerToReplace` routing regression | `engine/validation.ts` |
| Green diamonds render red | `isRedSuit` or suit CSS overrides | `types/card.ts` + `RummyTile.css` |

### 6. Write up findings

Structure the output as a markdown report:

```markdown
## Israeli Rummy UX Review — <date>

### Critical (blocks play)
- ...

### Significant (degrades feel)
- ...

### Polish
- ...

### Automated suite status
- `npm run test:e2e`: <pass/fail counts>
```

Use `file:line` references for every finding so the fix is one click away.
