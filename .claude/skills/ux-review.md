---
name: ux-review
description: >
  Thorough mobile-first UI/UX review of WhistAchim card games.
  Checks card rendering, touch targets, layout, responsiveness,
  RTL/Hebrew, animations, game-over screens, and visual consistency
  across all 7 games.
user-invocable: true
---

# UX Review Skill — WhistAchim

Run a comprehensive UI/UX audit of the WhistAchim card game app.
Project: `C:\tmp\israeli-whist` | Live: `https://whist---elyakim.web.app`

## Usage

- `/ux-review` — Full audit across all games
- `/ux-review <game>` — Audit one game (whist, yaniv, quartets, solitaire, shithead, rummy, israeli-rummy)
- `/ux-review mobile` — Focus on mobile viewport & touch targets
- `/ux-review rtl` — Focus on Hebrew/RTL layout issues
- `/ux-review cards` — Focus on card rendering, sizing, readability

## Architecture Reference

- **Styling**: Vanilla CSS with CSS custom properties (`src/styles/variables.css`)
- **No framework**: No Tailwind, no CSS-in-JS — plain `.css` files per component
- **Card component**: `src/components/cards/Card.tsx` + `Card.css`
- **Shared layout**: `src/components/layout/GameTable.tsx` + `GameTable.css`
- **i18n**: English + Hebrew via `src/i18n/translations.ts`
- **No router**: State machine in `App.tsx` (`AppScreen` type)
- **PWA**: Service worker via vite-plugin-pwa

## Implementation Steps

### 1. Start Dev Server

Use `preview_start` with the `whist-dev` config from `.claude/launch.json`.

### 2. For Each Game in Scope

Navigate to the game via the main menu. For each game:

#### a. Card Rendering & Readability
- **Suit visibility**: Rank + suit symbol in top-left AND bottom-right corners
- **Color contrast**: Red suits (`#cc0000`) and black suits (`#1a1a1a`) on white card background
- **Royal cards (J/Q/K)**: RoyalFaceIllustration renders at usable size; suit still identifiable from corners
- **Small cards**: `.card-small` variant (50x72px) — still readable?
- **Card fan overlap**: Cards in hand don't overlap so much that rank/suit is hidden
- **Joker cards**: Distinguishable from regular cards

Files to check:
- `src/components/cards/Card.tsx` / `Card.css`
- `src/components/cards/CardFan.tsx` / `CardFan.css`
- `src/components/cards/RoyalFaceIllustration.tsx`

#### b. Touch Targets (Mobile)
- All interactive cards have min 44px touch area
- Buttons in bidding panel, game-over screens, menus are finger-friendly
- No overlapping clickable elements
- Drag-and-drop targets (Israeli Rummy hand reorder) have clear affordance

Use `preview_resize` with `preset: mobile` (375x812) to test.

#### c. Layout & Spacing
- Player areas positioned correctly (top, left, right, bottom)
- No content hidden behind fixed elements or screen edges
- Game table uses full viewport height without scrolling during play
- Score panel / bid panel doesn't obscure cards
- Reshuffle button (Israeli Rummy) doesn't overlap with hand cards

Per-game layout files:
- Whist: `src/components/layout/GameTable.tsx` + CSS
- Yaniv: `src/games/yaniv/components/YanivGameTable.tsx` + CSS
- Quartets: `src/games/quartets/components/QuartetsGameTable.tsx` + CSS
- Solitaire: `src/games/solitaire/components/SolitaireGameTable.tsx` + CSS
- Shithead: `src/games/shithead/components/ShitheadGameTable.tsx` + CSS
- Israeli Rummy: `src/games/israeli-rummy/components/IsraeliRummyGameTable.tsx` + CSS
- Rummy/Gin: `src/games/rummy/components/RummyGameTable.tsx` + CSS

#### d. Game-Over / Round-End Screens
- Winner announcement clear and prominent
- Score display readable
- "New Game" / "Back to Menu" buttons obvious
- Round summary shows relevant info (scores, tricks won, etc.)

Files: `src/components/scoring/RoundSummary.tsx`, `Scoreboard.tsx`

#### e. Animations & Transitions
- Card play animations smooth (no jank)
- State transitions (bidding → playing → scoring) feel natural
- AI thinking doesn't freeze the UI
- No layout shifts during phase changes

#### f. RTL / Hebrew (if in scope)
- Toggle language via main menu button
- All game labels, buttons, menus flip correctly
- Card rank/suit stay LTR (numbers don't flip)
- Bidding panel, score display respect RTL
- Player name labels positioned correctly

File: `src/i18n/translations.ts`, `src/i18n/LanguageContext.tsx`

### 3. Main Menu & Lobby Review

- Game selector buttons clear and distinct
- Player name input works
- "Play vs AI" / "Create Room" / "Join Room" hierarchy clear
- Quick Rules section readable
- Language toggle accessible

Files: `src/components/lobby/MainMenu.tsx` + CSS, `src/components/lobby/RoomLobby.tsx` + CSS

### 4. Cross-Game Consistency

- Card backs look the same across all games
- Panel backgrounds (`.panel-bg`) consistent
- Button styles (primary, secondary) consistent
- Color scheme matches across games
- Font usage consistent

File: `src/styles/variables.css`, `src/styles/reset.css`

### 5. Responsive Breakpoints

Test at these viewports:
- **Mobile**: 375x812 (iPhone/Pixel)
- **Tablet**: 768x1024 (iPad)
- **Desktop**: 1280x800

CSS breakpoints defined in component CSS files (check for `@media` queries).

### 6. Generate Report

Structure the output as:

```markdown
## UX Audit Report — WhistAchim
**Date**: [date] | **Scope**: [games audited] | **Viewport**: [sizes tested]

### Critical Issues (blocks usability)
[Numbered list with file:line references]

### Significant Issues (degrades experience)
[Numbered list with file:line references]

### Polish Items (nice to have)
[Numbered list]

### Per-Game Scores (1-5)
| Game | Cards | Layout | Touch | States | RTL | Overall |
|------|-------|--------|-------|--------|-----|---------|

### Top 5 Quick Wins (<30 min each)
### Top 5 Larger Improvements (1-4 hours each)
```

### 7. Verification

For each issue found:
1. Use `preview_screenshot` or `preview_inspect` to capture evidence
2. Reference exact file paths and line numbers
3. Suggest specific CSS/TSX fix

## Game-Specific Checklist

### WhistAchim (Whist)
- [ ] Bidding panel: number selector + trump suit selector usable on mobile
- [ ] Card exchange: 3-card selection + confirm flow clear
- [ ] Trick area: 4 cards visible with clear winner highlight
- [ ] Score panel: current bids, tricks won, scores all visible

### Yaniv
- [ ] Hand value display prominent
- [ ] Discard pile clear (which cards can be picked up)
- [ ] "Call Yaniv" button obvious when available
- [ ] Assaf notification visible

### Quartets
- [ ] DrumPicker (player/set/card selector) usable on mobile
- [ ] Completed quartets display clear
- [ ] Ask/receive animation visible
- [ ] Card set images/emojis render correctly

### Solitaire
- [ ] Stock pile clickable area sufficient
- [ ] Foundation piles visible (not hidden by hand)
- [ ] Hint toast message readable
- [ ] Undo button accessible
- [ ] Win detection + celebration screen

### Shithead
- [ ] Face-down/face-up/hand card layers distinguishable
- [ ] Pile pickup action clear
- [ ] Special card effects visible (2=reset, 10=burn)
- [ ] Turn indicator clear

### Israeli Rummy
- [ ] Table melds readable (not too small)
- [ ] Hand card sizing adapts to card count
- [ ] Sort buttons (suit/sequence) accessible
- [ ] Drag-and-drop hand reorder works on touch
- [ ] Rearrange mode: clear visual distinction from normal play
- [ ] First meld threshold (30pts) communicated to player
- [ ] Draw pile / reshuffle button not overlapping hand

### Rummy / Gin Rummy
- [ ] Discard pile top card visible
- [ ] Meld/layoff actions clear
- [ ] Gin/Knock/Undercut results displayed properly
