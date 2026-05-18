# Israeli Rummy: landscape support + builder commit fix

## Date
2026-04-22

## Context
User reported (with screenshots) two issues during play:

1. **"Finish the new set (3+ valid tiles) or move its tiles back before
   finishing."** — toast shown on clicking Done, even when the visible builder
   contained a valid run/set. Reproduced on first-meld attempts and on
   later turns.
2. **Layout** — wanted landscape supported alongside portrait, and confirmation
   that the three meld-area tile-size tiers (≤35 / 36–70 / >70) were
   actually implemented and never let any block get hidden.

## Diagnosis (sub-agent: explorer)

### Bug 1 — root cause
`isValidMeld` is positional for runs (`cards[i]` must equal `base + i`).
`newMeldBuilder` stores tiles in **insertion order**, but the UI displays
them via `sortMeldCards(builder)`. Three drop paths append raw without
sorting (`IsraeliRummyGameTable.tsx:927, 967, 1023`), so `[11♥, 13♥, joker]`
in storage fails validation (`base = 11` from idx 0; `13 - 1 = 12` from idx
1 → mismatch) even though the user sees a valid `[11♥, joker, 13♥]`.

The same false-negative hit:
- `handleCommit` validation (line 1163)
- `builderValid` visual indicator (line 1461)
- The type derivation right after (line 1167)

### Bug 2 — root cause
`firstMeldProgress` (line 1577) iterates only `workingMelds`, ignoring
`newMeldBuilder`. A valid 30-pt run sitting in the builder shows "0 / 30".

### Layout audit (sub-agent: explorer)
- Three-tier meld sizing CONFIRMED implemented at thresholds ≤35 / 36–70 / >70.
- Builder shares the meld tier (same CSS custom props).
- Hand rack uses independent fixed sizing, not tier-coupled.
- Landscape (812×375) vertical budget overflows by ~115 px without changes:
  top-bar 48 + turn-indicator 32 + draw-pile 116 + melds-min 140 + player-area
  154 ≈ 490 vs 375 available.

## Fix

### `src/games/israeli-rummy/components/IsraeliRummyGameTable.tsx`

1. `handleCommit` — sort builder before validating; derive `type` from the
   sorted check.
2. `builderValid` indicator — derive from `sortMeldCards(builderCards)`.
3. Builder render — use `sortedBuilderCards` and a per-key occurrence map
   so duplicate-card double-deck tiles get distinct `origIdx` (not the same
   `indexOf` result twice).
4. `firstMeldProgress` — add a second pass that includes the builder when
   it forms a valid meld.

### `src/games/israeli-rummy/components/IsraeliRummyGameTable.css`

Append `@media (orientation: landscape) and (max-height: 600px)` block:

- Top bar 28 px, turn indicator 12 px font, draw-pile 40×58.
- Hand row: single-row 14 cols at 36×50 tiles.
- Opponent chips anchored at `top: 32px` (under top bar) instead of vertical
  center.
- Rearrange-bar single-row, 4 px bottom margin.
- Player-area padding shrunk; rearrange-mode bottom padding 56 px (down
  from 80/112).
- Reshuffle button 32×32.

Goal: every block visible at every game stage, nothing clipped, no scroll
in melds area.

## Verification

| Layer | Method | Result |
|---|---|---|
| Validation logic | Standalone tsx script with `isValidMeld + sortMeldCards` on `[11H, 13H, joker]` and `[8H, 6H, 9H, 7H]`. | Raw → invalid; sorted → valid run. ✓ |
| Build | `npm run build` (`tsc -b && vite build`) | Pass, no new TS errors. ✓ |
| Lint | `npm run lint` | Zero new errors in IsraeliRummyGameTable.tsx/css. (58 pre-existing in multiplayer/*.) ✓ |
| Landscape preview | `preview_start whist-dev`, resize 812×375, navigate Israeli Rummy game. | All blocks visible — top bar, opponents (anchored top), draw pile, meld, sort row, hand row (single row), reshuffle. No scroll. ✓ |
| Portrait preview | resize 393×852. | Layout unchanged — no regression. ✓ |
| E2E (`npm run test:e2e`) | 7 pass / 3 fail. | The 3 failures are pre-existing (drag-flow timing on Windows) and unrelated to my changes. |

## Files changed

- `src/games/israeli-rummy/components/IsraeliRummyGameTable.tsx`
- `src/games/israeli-rummy/components/IsraeliRummyGameTable.css`
- `CLAUDE.md` (new — codebase guide)
- `.claude/plans/landscape-and-builder-commit.md` (this file)

## Follow-ups (out of scope)
- Pre-existing `no-explicit-any` lint debt in `src/multiplayer/*` and
  `YanivGameTable.tsx`.
- Pre-existing flaky e2e tests around DnD timing on Windows.
- The `couldFitInMeld` heuristic (line 159 of `validation.ts`) doesn't sort
  before checking — same class of bug as above. Not user-visible because it's
  a heuristic, but a candidate for future hardening.
