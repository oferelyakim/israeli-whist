# Israeli Rummy: first-meld two-deck fix + landscape lock

## Date
2026-04-22 → 2026-04-23

## Why

Two regressions reported by the user:

1. **First meld blocked falsely**. Placing two valid melds entirely from
   hand on the first turn — e.g. run `[3♥, 4♥, 5♥]` + set
   `[10♣, 10♥, 10♠]` — was rejected with `firstMeldNoRearrange` ("can't
   use blocks from the table") even though no table tiles were touched.

2. **Melds appearing stacked above each other on phones**. The user
   wanted the table to lay out side-by-side meld rows that fit without
   scrolling, with the existing 3-tier sizing handling tile size.

## Bug 1: first-meld validation

### Root cause

`game-reducer.ts` (`COMMIT_MELDS` handler) and the parallel UI guard in
`IsraeliRummyGameTable.tsx` (`handleCommit`) both classified melds as
"new" by checking whether any of their cards' `(suit, rank)` matched a
card in the "newly-placed-cards" multiset. They then verified those
"new" melds were entirely from hand.

This works in a single-deck game but Israeli Rummy uses **two decks** —
a tile placed from hand can share its `(suit, rank)` with a tile already
on the table. With existing meld `[5♥, 5♣, 5♠]` and new run
`[3♥, 4♥, 5♥]`, the existing meld got misclassified as "new" (it
contains a `5♥`) and then failed because its `5♣` / `5♠` weren't in the
"new cards" map.

### Fix

Identify new melds by **ID**, not by value:

- `meldsToCommit.filter(m => !snapshotMeldIds.has(m.id))`

Once `snapshotMeldsPreserved` (multiset comparison, not just length)
holds AND total cards are conserved (already enforced by the reducer),
any meld whose ID isn't in the snapshot is — by construction — entirely
from the player's hand. The separate "all from hand" check is therefore
redundant and was removed in both files.

The dead helper `findMeldsContainingNewCards` was deleted from the
reducer.

### Regression test

`scripts/test-first-meld.mts` exercises the reducer directly with both
the bug scenario and a negative case (still rejects rearranging an
existing meld during first turn). Bundled with esbuild and run via
node — see CLAUDE.md "Run reducer regression test" section.

## Bug 2: landscape layout / stacked melds

### Root cause

The "stacked" appearance was a phone-portrait artifact. The
`.irummy-melds-area` reserves `clamp(76px, 20vw, 100px)` of side padding
on each side to avoid colliding with the absolutely-positioned opponent
chips, leaving only ~200–250px of usable width on a phone in portrait.
A single LARGE-tier 3-tile meld is ~140px wide, so two melds (~290px)
can't fit side-by-side and wrap to a new row, looking "stacked".

The existing `@media (orientation: landscape) and (max-height: 600px)`
block already drops side padding to `2px 12px` and reformats every
component for compact landscape — so the actual fix is to ensure
players are in landscape on phones.

### Fix

New component: `src/games/israeli-rummy/components/RotateDeviceOverlay.tsx`
(plus `.css`).

- Mounted from `IsraeliRummyGameScreen.tsx` (alongside both the loading
  state and the game table) so it renders for the entire game lifecycle.
- Renders a full-screen blocker with an animated phone-rotate icon
  whenever the viewport is < 700px wide AND in portrait.
- Listens to **three** signals because mobile browsers are inconsistent:
  - `(orientation: portrait)` matchMedia change (most reliable)
  - `orientationchange` event (re-checked at 0/100/350ms because Android
    Chrome reports stale `innerWidth/innerHeight` immediately after
    rotation)
  - `resize` (covers desktop window resizing as a backup)
- Exposes a "Continue anyway" button as a safety net so users are never
  stuck if detection misfires on a specific device.
- Tablets in portrait are NOT blocked (`Math.min(w, h) < 700` gate) —
  they have enough room for the table.

We do **not** call `screen.orientation.lock('landscape')` — it requires
fullscreen and was silently rejecting on most devices anyway.

PWA manifest in `vite.config.ts` changed from `orientation: 'portrait'`
to `orientation: 'any'`. Other games (Whist, Yaniv, etc.) work fine in
either orientation; per-game guidance lives at the screen level via the
overlay.

i18n keys added (English + Hebrew):
- `israeliRummy.rotateTitle`
- `israeliRummy.rotateBody`
- `israeliRummy.rotateContinue`

## Verification

- `npx tsc -b` clean
- `npm run lint` clean
- `scripts/test-first-meld.mts` passes both the multi-meld first-turn
  case and the negative (rearrangement-rejection) case
- Visual verification on real device requires manual rotation (no
  Playwright orientation harness yet)

## Files touched

- `src/games/israeli-rummy/engine/game-reducer.ts`
  (COMMIT_MELDS handler, removed `findMeldsContainingNewCards`)
- `src/games/israeli-rummy/components/IsraeliRummyGameTable.tsx`
  (`handleCommit`, strengthened snapshot-meld check + ID-based new-meld
  identification)
- `src/games/israeli-rummy/components/IsraeliRummyGameScreen.tsx`
  (mount `<RotateDeviceOverlay />`)
- `src/games/israeli-rummy/components/RotateDeviceOverlay.tsx` (new)
- `src/games/israeli-rummy/components/RotateDeviceOverlay.css` (new)
- `vite.config.ts` (manifest orientation 'portrait' → 'any')
- `src/i18n/translations.ts` (rotateTitle / rotateBody / rotateContinue
  in both languages)
- `scripts/test-first-meld.mts` (new regression test)
- `CLAUDE.md` (documented all of the above)
