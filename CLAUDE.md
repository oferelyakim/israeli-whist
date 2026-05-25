# Israeli-Whist (multi-game card app)

Vite + React 19 + TypeScript card-game suite. Ten game modes share a common
lobby/scoring/multiplayer infrastructure: WhistAchim, Yaniv, Quartets,
Solitaire, Shithead, Israeli Rummy (Rummikub-style), Backgammon, Checkers,
Woodoku (solo block puzzle), and Escape Room (solo timed puzzle stages).
Multiplayer is built on Firebase Realtime DB; bots run client-side.
PWA via vite-plugin-pwa.

## Layout

| Path | What lives here |
|---|---|
| `src/games/<game>/` | Per-game engine, components, AI, hooks. Each game owns its own reducer + types. |
| `src/games/registry.ts` | Game registry consumed by `MainMenu`. |
| `src/components/` | Cross-game UI: `lobby/`, `bidding/`, `cards/`, `exchange/`, `layout/`, `scoring/`, `common/`. |
| `src/multiplayer/` | Firebase room manager + game-state sync. |
| `src/i18n/` | Custom English/Hebrew translations + LanguageContext. |
| `tests/` | Playwright e2e (no unit-test runner configured). |
| `scripts/` | Standalone Node test scripts (run via `esbuild --bundle ... | node`). |
| `.claude/skills/` | Project-scoped skills (`irummy-layout-test`, `irummy-ux-review`). |
| `.claude/plans/` | One-off implementation plans (kept for history). |

## Conventions

- **TypeScript strict** — no `any`, prefer functional patterns, descriptive names, explicit error handling.
- **Reducer-per-game** — each game has its own pure reducer (e.g. `israeli-rummy/engine/game-reducer.ts`); UI dispatches actions, never mutates state directly.
- **i18n required for new strings** — every user-visible string goes through `useTranslation().t('group.key')`. Both `en` and `he` entries must exist in `src/i18n/translations.ts`.
- **localStorage saves** — each game persists to its own key (e.g. `israeli-rummy-saved-game`, `whist_session`). On mount the screen restores from this if present.
- **Pointer events for DnD** — Israeli Rummy uses raw `pointerdown/move/up`, NOT HTML5 drag. Tests must dispatch via `page.mouse.*`.
- **CSS custom props for sizing** — meld tile sizing is driven by `--meld-card-w/-h/-font` set from JS tier constants; CSS reads them. Don't hardcode tile sizes in CSS unless inside a media query.

## Israeli Rummy specifics

The biggest game and where most bugs surface.

### Three-tier meld sizing

`pickMeldTier(totalTableTiles)` in `src/games/israeli-rummy/components/IsraeliRummyGameTable.tsx` selects one of three preset tile sizes for the **meld area** based on total table tile count:

| Tier | Range | Tile size (W×H) |
|---|---|---|
| LARGE | ≤ 20 tiles | 38×54 |
| MEDIUM | 21–50 tiles | 28×40 |
| SMALL | ≥ 51 tiles | 22×32 |

Thresholds lowered from 35/70 → 20/50 on 2026-04-23: at the old values, tall meld cards clipped at the top of the block (rank number visible but tile body cut off) once the table filled up but still below 35 tiles. Don't raise these without re-testing the clipping regression.

During rearrange the tier is frozen at `START_REARRANGE` (`frozenMeldStyle`) and **held until commit/revert** — the renderer no longer downgrades mid-rearrange. Player feedback (2026-05-02): the old downgrade reflowed every meld simultaneously and the player lost track of the set they were assembling. The grid also switches to `justify-content: flex-start` (via `.irummy-melds-stable-rows`) during rearrange/drag so growing one meld doesn't re-center every other meld on its row. Trade-off: a player who adds many tiles in one rearrange may see the meld area overflow (it is `overflow: hidden`); after commit the tier recomputes and the board adjusts. Don't reintroduce a mid-rearrange downgrade without first checking with the player.

The `+ New Set` builder shares the same tier (consumes the same CSS custom props). The hand rack uses an independent `--hand-card-w/-h` (44×62 default, 40×56 on phones).

### Orientation: portrait, melds wrap into multiple rows

Israeli Rummy runs in **portrait** on every viewport (PWA manifest `orientation: 'portrait'`). To fit many melds without vertical scrolling we rely on two things:

1. **Three-tier tile sizing** (`pickMeldTier`, see above) — tiles automatically shrink as the table fills so more fit per row.
2. **Melds grid wraps side-by-side** — `.irummy-melds-grid` uses `display: flex; flex-wrap: wrap; justify-content: center; align-content: flex-start`, so melds flow across and wrap naturally into multiple rows.

On narrow phones (`@media (max-width: 699px)`) we reclaim the side padding that used to be reserved for vertical left/right opponent chips: chips switch to a compact horizontal single-line layout anchored at `top: 44px` under the top bar (`flex-direction: row`, `max-width: 44vw`), and `.irummy-melds-area` drops its padding from `clamp(76px, 20vw, 100px)` to `32px 8px 4px` (top padding reserves space for the chip row). That gives the meld grid the full viewport width for wrapping — the "stacked" portrait layout we had before is gone.

We do NOT force landscape anywhere — no `RotateDeviceOverlay`, no `screen.orientation.lock(...)`, no landscape-specific `@media` block.

### New-set builder ("+ New Set" frame)

Lives at the top of the meld area (`order: -1` so it never reflows existing melds). Holds tiles dropped from the hand or from a meld during rearrange. On Done, if the builder has ≥ 3 tiles forming a valid meld, it's folded into `workingMelds`.

**Critical invariant**: `isValidMeld` for runs is **positional** — `cards[i]` must equal `base + i`. The builder array stays in insertion order for stable drag-source identification, but VALIDATION must always run against `sortMeldCards(builder)`. If you skip the sort, a builder displayed as `[11♥, joker, 13♥]` but stored as `[11♥, 13♥, joker]` will reject as invalid (false-negative). See `handleCommit` and `firstMeldProgress` for the canonical pattern.

### First meld (and the two-deck collision pitfall)

A player who hasn't met the first meld must place ≥ 30 points entirely from hand (no rearranging table melds). Builder tiles count toward `firstMeldProgress` once the builder forms a valid meld.

**Critical**: identify "new" melds by **ID**, not by card values. Israeli Rummy uses two decks, so a tile placed from hand can share its `(suit, rank)` with a tile already on the table (e.g. existing `[5♥, 5♣, 5♠]` + new run `[3♥, 4♥, 5♥]` — both contain a `5♥`). The earlier value-based "find melds containing newly-placed cards" classifier misidentified the unchanged existing meld as "new" and then failed it for "rearranging from the table", producing a false `firstMeldNoRearrange` error.

The current pattern (in both `game-reducer.ts` `COMMIT_MELDS` and `IsraeliRummyGameTable.tsx` `handleCommit`):

1. Verify each snapshot meld is preserved (multiset comparison of cards, not just length).
2. Identify new melds by `id not in snapshotMeldIds`.
3. Run `meetsFirstMeldRequirement` on those new melds.

Once snapshot melds are preserved AND total cards are conserved, by construction any new meld must be entirely from the hand — no separate "all from hand" check is needed (and the previous implementation of that check was the bug).

### AI joker / tile identity (also a two-deck pitfall)

In the bot's table-rearrangement code (`ai-player.ts` `tryTableRearrangement`),
when a tile is taken from the table and re-placed in a new meld with hand
tiles, the bot must identify the table tile by **object reference (`===`)**,
not by `cardKey`. Two jokers of the same colour share the same cardKey, as do
duplicate same-suit/rank tiles in the second deck — a cardKey-based
"this came from the table" filter mis-assigns ownership and the resulting
proposal violates card conservation, which `selfValidateCommit` then catches
as an invalid commit and silently reverts. Symptom: bot's hand grows
unbounded turn after turn because every rearrange aborts.

The fix: place the table tile **first** in the trial hand passed to
`findPossibleMelds` (so its construction picks that tile preferentially), then
filter the candidate melds with `m.includes(tableTile)` and compute consumed
hand cards as `meld.filter(c => c !== tableTile)`. Regression: `scripts/test-bot-2deck-joker.mts`.

Also in this area: when the bot's hand is large (`≥ STUCK_HAND_THRESHOLD = 16`), the AI's mistake-rate is forced to 0 — a player who has fallen behind doesn't randomly skip plays. And `MAX_MELDS_TO_CONSIDER` scales with hand size (40 + 2/card, capped at 120) so a 30-tile hand isn't artificially capped to 30 candidate melds.

If `selfValidateCommit` fails after the speculative pipeline runs, `computeRearrangement` falls back to a pure layoff sweep (`layoffOnlyFallback`) from the original snapshot. This guarantees that a bot with even one valid layoff can always make legal progress, even if a Step-1 strategy bug corrupts the working state.

## Common workflows

### Run the dev preview
```bash
npx vite --port 5175
```
Or use the `whist-dev` server in `.claude/launch.json` via `mcp__Claude_Preview__preview_start({ name: 'whist-dev' })`.

### Build & deploy
```bash
npm run build       # tsc -b && vite build → dist/
firebase deploy     # manual deploy to Firebase Hosting (project whist---elyakim)
```

CI/CD: every push to `master` on GitHub auto-deploys via `.github/workflows/deploy.yml`.
Requires `FIREBASE_SERVICE_ACCOUNT` secret in GitHub repo settings.
GitHub: https://github.com/oferelyakim/israeli-whist
Live: https://whist---elyakim.web.app

**Firebase config** (`src/multiplayer/firebase-config.ts`): the production Firebase credentials are hardcoded as `PROD_CONFIG` fallbacks in `getFirebaseConfig()`. `.env` env-vars override them for local dev but are NOT required for the build — the deployed app always has a working config. Firebase client config is intentionally public; security is enforced by Realtime Database rules (`auth != null`), not by hiding these values.

**Version check on load** (`src/hooks/useVersionCheck.ts` + `src/components/common/UpdateBanner.tsx`): the Vite build emits `dist/version.json` (via the `emit-version-json` plugin in `vite.config.ts`) containing the current package version. On app load, `useVersionCheck` fetches `/version.json` with `cache: 'no-store'` (bypasses the service worker — `.json` is excluded from the SW glob patterns) and compares against `__APP_VERSION__` (injected at build time via `define`). A mismatch shows a green "New version available / Update" banner that calls `window.location.reload()`. **Always bump `package.json` version with every code change** — that's what triggers the banner on the user's device.

**Version convention**: bump `package.json` with every code change (patch for fixes, minor for features). Current: see `package.json`.

### Run e2e
```bash
npm run test:e2e            # full suite, Chromium
npm run test:e2e:ui         # interactive
npm run test:e2e:report     # last HTML report
```
The Israeli Rummy harness lives in `tests/irummy-layout.spec.ts` with helpers in `tests/helpers/irummy.ts`. Several drag-flow tests are flaky on Windows due to pointer-event timing — re-run before declaring a regression.

### Run reducer regression test (first-meld bug)

There's no Vitest in this project. The first-meld two-deck-collision regression test lives at `scripts/test-first-meld.mts` and is bundled with esbuild before running:

```bash
./node_modules/.bin/esbuild --bundle scripts/test-first-meld.mts \
  --platform=node --format=esm --outfile=/tmp/test-bundle.mjs \
  --log-level=warning && node /tmp/test-bundle.mjs
```

It exercises the `israeliRummyReducer` directly with the exact failing scenario (existing `[5♥,5♣,5♠]`, new run `[3♥,4♥,5♥]`, new set `[10♣,10♥,10♠]`) plus a negative case (still rejects rearranging an existing meld during first turn). Add new cases to this file when you touch the first-meld validation.

### Lint
```bash
npm run lint
```
There's a backlog of pre-existing `no-explicit-any` errors in `src/multiplayer/*` and `src/games/yaniv/components/YanivGameTable.tsx`. Fix only what you touch.

## Backgammon, Checkers, Woodoku (added 2026-05-16)

Three new games added to the registry. Key facts:

- **Backgammon** (`src/games/backgammon/`): white moves index 23→0, black moves index 0→23. Bar entry = white uses `24 - pip`, black uses `pip - 1`. Bear-off target is `-1`. Dice doubles give 4 dice. AI has 3 difficulty levels (Low=DFS 400 nodes + heuristic fallback, Medium=DFS 2000 nodes + categorical move ordering, Hard=DFS 5000 nodes + 1-ply eval-based move ordering). localStorage keys: `backgammon-saved-game` (game state), `backgammon-settings` (player prefs). Multiplayer hook follows `useYanivMultiplayer` pattern.

**Backgammon board initial setup (standard):**
- idx 0 = 2 black (pt 1), idx 5 = 5 white (pt 6), idx 7 = 3 white (pt 8), idx 11 = 5 black (pt 12)
- idx 12 = 5 white (pt 13), idx 16 = 3 black (pt 17), idx 18 = 5 black (pt 19), idx 23 = 2 white (pt 24)

**Backgammon settings** (`BackgammonSettings` + `BG_DEFAULTS` in `types.ts`): `playerColor` (white|black), `homeRight` (bool), `difficulty` (1|2|3), `showMoveHints` (bool). Gear ⚙ button in `BackgammonScreen.tsx` opens a settings modal that persists to `backgammon-settings` in localStorage. Direction is implemented via `topIndices`/`bottomIndices` array reversal in `BackgammonTable.tsx`. `displayNum = pointIdx + 1` for all points (do NOT use `12 - pointIdx` or `pointIdx + 13`). **Triangle colors**: both halves use `pointIdx % 2 === 0` for `isLight` — same formula gives opposite colors on facing triangles because bottom_idx + top_idx always = 23 (different parities). Do NOT revert to `isBottom ? ===0 : ===1` which mirrors instead of alternates.
- **Checkers** (`src/games/checkers/`): standard 8×8 American rules. Board[row][col], dark squares = (row+col)%2===1. Red moves first (seat 0 = red). Forced captures enforced via `forcedPieces`. Multi-jump via `jumpingPiece`. AI is minimax with alpha-beta; depth 2 (Easy) / 4 (Medium) / 7 (Hard). Hard uses quiescence search (QUIESCENCE_DEPTH=4 extra plies of captures at leaf nodes to prevent the horizon effect) plus a richer evaluation: king ×1.8, tempo bonus (pieces 1-2 rows from promotion), back-row anchor, center control, mobility (legal-move count difference), piece safety (hanging-piece penalty). `CheckersSettings.difficulty` (1|2|3), saved to `checkers-settings` localStorage. Gear ⚙ button in `CheckersScreen.tsx` opens settings modal. Multiplayer hook follows the same pattern.
- **Woodoku** (`src/games/woodoku/`): 9×9 grid, 3 offered pieces at a time. **Currently hidden from the menu** (entry removed from `GAME_REGISTRY` in `registry.ts`) — work in progress, will be restored later. Code is intact under `src/games/woodoku/`.

The pip count display in `BackgammonTable.tsx` uses `t('backgammon.pips', { n: pipCount })` — the `{n}` template must be passed.

**Backgammon UI invariants (learned from bugs):**
- `CheckerStack` buttons must call `e.stopPropagation()` before their `onClick`. Without it, the click bubbles to the parent `BoardPoint` div and fires `handleClick` twice — React's functional updater chains the two `setSelectedFrom` calls as `null→from→null`, toggling the selection back to nothing so checkers can never be moved.
- `legalMoves` in both backgammon hooks must be **empty when `selectedFrom` is null**. If all legal targets are surfaced before a checker is selected, tapping any destination square (including squares that have your own checker) routes through `onMoveChecker` (which no-ops silently) instead of `onSelectChecker`.
- `allLegalSources` (distinct source squares) is exposed from both hooks for move hint highlighting. Highlights render when `showMoveHints=true` and `selectedFrom === null`, via the `bg-point--hinted` CSS class + pulse animation.

**Backgammon combined-dice moves (added 2026-05-16):**
- `getLegalMoves` returns `BgMove[]` (type exported from `types.ts`). Each entry has `{ from, to, via? }`. When `via` is set, the move uses both dice on one checker and skips the intermediate point automatically.
- `COMBINED_MOVE { from, via, to }` action in `BackgammonAction` — reducer applies it as two sequential `applyMoveChecker` calls in one tick, so the turn never ends prematurely mid-move.
- Both hooks detect `move.via` in `moveChecker` and dispatch `COMBINED_MOVE` instead of `MOVE_CHECKER`.
- Combined moves are generated for non-doubles and doubles (2-die combinations only). Intermediate must not be blocked; bear-off cannot be the intermediate point.
- AI also uses `COMBINED_MOVE` for first-move dispatch when the DFS picks a combined sequence.

**Backgammon undo (added 2026-05-17):**
- `useBackgammonGame` maintains a `historyRef: BackgammonGameState[]` snapshot stack. Every human `dispatch` call (roll, move, combined move) pushes the pre-action state before applying it. AI actions never push — undo always lands on a human-controlled state.
- `undo()` pops the last snapshot, cancels any pending AI timer, restores state + saves to localStorage.
- `canUndo: boolean` (reactive via `useState`) drives the button's disabled state.
- History is cleared on `newGame`.
- `BackgammonTable` has optional props `onUndo` and `canUndo`; the undo button is rendered only when `onUndo` is provided (single-player only; multiplayer screen omits it).
- i18n keys: `backgammon.undo` (en: "Undo", he: "בטל").

**Backgammon AI (improved 2026-05-16):**
- Phase detection via `isRunningGame(state)` — checks for no cross-contact and no bar checkers. Switches evaluator accordingly.
- **Race evaluator**: pip lead ×1.0, crossover advantage ×0.5, bearing-off progress ×2.0, stacked-high-point penalty.
- **Contact evaluator**: pip ×0.4, blot exposure (directional shot count, 1.5/attacker direct, 0.5 indirect), made-point bonuses (×2 + golden 5pt bonus +4), exponential prime scoring (5-prime→+15, 6-prime→+25), anchor values in opponent home (golden anchor=+5), opponent-blot/bar bonuses, home-board strength, opponent prime penalty.
- **Low (difficulty 1)**: full-turn DFS capped at 400 nodes + per-move heuristic fallback.
- **Medium (difficulty 2)**: full-turn DFS capped at 2000 nodes + categorical first-move ordering (hits > point-making > pip movers).
- **Hard (difficulty 3)**: full-turn DFS capped at 5000 nodes + 1-ply evaluation-based first-move ordering (each candidate first-move is evaluated via `evaluatePosition` before the DFS explores it, spending budget on the most promising lines first).

## Escape Room (added 2026-05-18)

Solo timed puzzle game at `src/games/escape-room/`. Designed as an **extractable module** — it imports only from itself + `src/i18n/` + the registry/types files, so the whole folder can be lifted into a standalone app later with minimal surgery.

### Architecture

- **Archetype contract** (`archetypes/types.ts`): every puzzle type implements `PuzzleArchetype<S, I>` with pure `init(params)`, `validate(state, input)`, `hint(state, idx)`, `serialize/restore`, and a React `Component`. State is always JSON-safe so round state persists through localStorage.
- **Round runner FSM** (`engine/round-runner.ts`): pure reducer with phases `IDLE → RUNNING ⇄ STAGE_SOLVED → ROUND_COMPLETE` plus `PAUSED`/`ABANDONED`. Timer ticks (`TICK` action) only fire while `RUNNING`.
- **Manifests** (`manifest/rounds.ts`): TS data, NOT JSON — `tsconfig.app.json` does not enable `resolveJsonModule`. `validateManifest()` runs at startup and refuses to start a round with an unknown archetype or unsupported difficulty.
- **Seeded RNG** (`engine/seed.ts`): mulberry32. **Never call `Math.random()` inside an archetype** — all randomness must derive from `params.seed`. Retry-with-reseed in `RESTART_ROUND` calls `nextSeed(baseSeed, attemptNumber)` so the same archetype shows in the same slot but the puzzle regenerates.
- **Save/restore**: `escape-room-saved-game` in localStorage. On rehydrate the round always lands in `PAUSED` so the player explicitly resumes (avoids stale-timer surprise).

### MVP scope (current)

- **Four archetypes**, all text-only and seedable: `multi-clue-padlock` (3/4/5-digit code, constraint-solved clues), `anagram` (themed word lists), `number-sequence` (find next term: arithmetic / geometric / fibonacci / quadratic / alternating), `caesar-cipher` (decode shifted word/phrase; easy reveals shift, hard hides it).
- The round is **7 stages**, one of each archetype at easy then escalating to medium for repeats — see `manifest/rounds.ts` for the canonical curve.
- Solo only; `EscapeRoomMultiplayerScreen.tsx` is a stub mirroring `SolitaireMultiplayerScreen`. Co-op/race can be added later via the same Firebase plumbing other games use.
- Text-only visuals (CSS/SVG primitives). Asset-heavy archetypes deferred until the loop is proven.

### Padlock invariant: every clue set must uniquely determine the code

`multi-clue-padlock` is NOT a "pick N random true clues" puzzle — that was the first cut and it produced unsolvable boards (you could only narrow to 1-2 digits). The current generator (`archetype.ts`):

1. Generates a random code.
2. Builds a pool of typed `Constraint` objects that are all true for that code (sum, product, per-position parity/digit/range, all-different, all-same, contains/no digit, position-to-position comparisons, abs-diff, count-of).
3. **Greedy uniqueness solver**: repeatedly picks the constraint that shrinks the candidate codes (all of `[0-9]^N`) the most until exactly one remains.
4. **Redundancy pass**: tries removing each chosen clue, keeps it only if removal breaks uniqueness.

The result is the **minimum sufficient** clue set — every clue is load-bearing. Clue counts in practice: 2-3 (easy/3-digit), 2-4 (medium/4-digit), 3-5 (hard/5-digit). Stage-init cost is ~60 ms even for hard puzzles (100k candidate codes) — acceptable as a one-time cost when entering a stage.

**Regression test:** `scripts/test-padlock-uniqueness.mts` runs 120 trials across all 3 difficulties and brute-force-verifies the puzzle has exactly one solution. Run it any time the constraint pool or solver is touched:
```
./node_modules/.bin/esbuild --bundle scripts/test-padlock-uniqueness.mts --platform=node --format=esm --outfile=/tmp/test-padlock.mjs --log-level=warning && node /tmp/test-padlock.mjs
```

**Don't** revert to a random-pick-from-pool generator without first updating the regression test target — underdetermined clues are the most player-frustrating bug class in this archetype.

### Adding a new game (registry + MainMenu wiring)

When adding any new game (not just an archetype here), there are **four** wiring points — miss the fourth and the menu silently launches Yaniv:

1. `src/types/game-common.ts` — add the `GameType` enum entry.
2. `src/games/registry.ts` — add the `GAME_REGISTRY[...]` entry with lazy-loaded screens.
3. `src/components/lobby/MainMenu.tsx` `GAME_I18N` — required by the strict `Record<GameType, ...>` type, build fails without it.
4. `src/components/lobby/MainMenu.tsx` `handleSinglePlayer` — **add an explicit branch (or early return) for the new game.** The function ends with a bare `else` that dispatches Yaniv settings; any game not explicitly listed falls through and launches Yaniv. Solitaire/Woodoku/Escape Room each have their own early-return blocks at the top. If your game is solo, also add it to the `selectedGame !== SOLITAIRE && selectedGame !== WOODOKU && ...` guards that hide the multiplayer controls.

### Adding a new archetype

1. Create `archetypes/<id>/archetype.ts` and `Component.tsx`.
2. Implement `PuzzleArchetype<S, I>` — all randomness must go through `mulberry32(params.seed)`.
3. Register in `archetypes/index.ts` (`ARCHETYPES[id] = ...`).
4. Add stages referencing the new `archetypeId` to a manifest in `manifest/rounds.ts`.
5. Add i18n keys under `escape.archetype.<id>.*` (plus `escape.archetype.<id>.short` for the round-complete table). EN and HE both required.
6. Add a `validateManifest` regression to the runner — the validator already checks `supportedDifficulties`.

### Critical: render stage host with a key

`StageHost.tsx` mounts the active archetype's `Component` with `key={`${attemptNumber}:${currentStageIndex}`}`. This forces a fresh mount on stage advance and retry, so component-local `useState` (input fields) initializes empty. **Do not replace this with a `useEffect(() => setValue(''), [state])` reset** — react-x lint flags it as "cascading renders" and the key-based approach is the idiomatic fix.

### i18n composite values

Archetype `hint()` and `validate()` return strings like `'escape.padlock.clue.digitAt|3|7'` — a key + pipe-separated params. The Component (not the archetype) splits and calls `t(key, { pos, digit })`. This keeps archetypes pure (no React/i18n dependency) while letting Components localize. Helper signature is `(t: TFn, raw: string) => string` where `TFn = (k: TranslationKey, p?) => string` — using `string` for `k` is a type error because `t` is strictly typed against `TranslationKey`.

## Things to NOT do

- Don't hardcode tile sizes — use the tier system / CSS custom props.
- Don't validate the builder without sorting first.
- Don't add new `any` types — fix the pre-existing ones if you touch the file.
- Don't mock the Firebase room manager in tests — use the real Firebase emulator if you must.
- Don't skip i18n. Hebrew is a first-class language.
- Don't classify "new" Israeli Rummy melds by card value — use ID-based identification (see "First meld" above).
- Don't reintroduce a rotation/landscape overlay — the portrait + wrapping-rows layout is the target.
- Don't call `screen.orientation.lock(...)` — it requires fullscreen and silently rejects on most devices.
- Don't naively append in the bot layoff loop. `canLayOff` is true if EITHER append OR prepend yields a valid meld (low-end run extensions like 10♣→[J♣,Q♣,K♣] only work as prepend). Always test both `[...meld.cards, card]` and `[card, ...meld.cards]` against `isValidMeld` and pick the valid arrangement — appending blindly produced positionally-invalid runs and `selfValidateCommit` then reverted the entire turn (the "bots only play sets, never lay off" symptom). Regression: `scripts/test-bot-layoff.mts`.
