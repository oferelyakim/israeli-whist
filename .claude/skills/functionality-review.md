---
name: functionality-review
description: >
  Deep functionality and game logic review of WhistAchim.
  Tests AI behavior, game rules enforcement, state machine correctness,
  reducer edge cases, save/load, and game flow for all 7 games.
user-invocable: true
---

# Functionality Review Skill — WhistAchim

Comprehensive game logic and functionality audit of the WhistAchim card game app.
Project: `C:\tmp\israeli-whist` | Live: `https://whist---elyakim.web.app`

## Usage

- `/functionality-review` — Full audit across all games
- `/functionality-review <game>` — Audit one game (whist, yaniv, quartets, solitaire, shithead, rummy, israeli-rummy)
- `/functionality-review ai` — Focus on AI player behavior across all games
- `/functionality-review reducers` — Focus on state machine correctness
- `/functionality-review save` — Focus on save/load and session persistence

## Architecture Reference

- **Pattern**: Pure reducer `(state, action) => newState` per game
- **AI**: Separate `ai-player.ts` per game, called from game hooks via setTimeout
- **State machine**: `useEffect` in game hooks schedules AI turns
- **Save/load**: localStorage per game (key varies)
- **Seeded random**: `src/utils/random.ts` for deterministic dealing
- **No tests exist**: Zero test coverage — review must be thorough

## Implementation Steps

### 1. Game Engine Audit — Per Game

For each game, read the reducer, types, and validation files. Check:

#### a. State Machine Correctness
- All action types handled in reducer switch
- Invalid actions return unchanged state (no crashes)
- Phase transitions are valid (no skipping phases)
- Turn advancement wraps correctly (`nextSeatN`)
- Win/end conditions trigger at the right time
- No infinite loops possible in reducer

#### b. Card Conservation
- Total cards after deal = deck size (no cards lost or duplicated)
- Drawing removes from source, adds to hand (1:1)
- Playing removes from hand, adds to table (1:1)
- Discard/draw operations are atomic in the reducer
- Reshuffling conserves cards

#### c. Rule Enforcement
- Only valid moves accepted by reducer
- Turn order enforced (can't act out of turn)
- Game-specific rules (see per-game checklist below)

#### d. Edge Cases
- Empty draw pile handling
- Single card remaining in hand
- All players pass in sequence
- Disconnected player during their turn
- Very large hand sizes (15+ cards)
- Joker interactions with all rule types

### 2. AI Player Audit — Per Game

For each `ai-player.ts`, check:

#### a. Decision Quality
- AI makes legal moves (never returns invalid actions)
- AI doesn't get stuck in loops (START_REARRANGE → REVERT cycle)
- AI uses time budget (`performance.now()` deadline)
- AI has fallback behavior when computation exceeds budget
- AI doesn't always make the same move (some variety)

#### b. Performance
- No unbounded loops (all loops have iteration caps)
- `findPossibleMelds` doesn't explode combinatorially with large hands
- Time budget enforced with `overBudget()` checks in hot paths
- Watchdog timer in hook catches stuck AI

#### c. Self-Validation
- AI validates proposed actions before returning them
- `selfValidateCommit()` mirrors reducer validation (Israeli Rummy)
- AI checks draw pile size before returning DRAW_CARD

#### d. AI Files to Review

| Game | AI File | Hook File |
|------|---------|-----------|
| Whist | `src/ai/ai-player.ts` | `src/hooks/useGame.ts` |
| Yaniv | `src/games/yaniv/ai/ai-player.ts` | `src/games/yaniv/hooks/useYanivGame.ts` |
| Quartets | `src/games/quartets/ai/ai-player.ts` | `src/games/quartets/hooks/useQuartetsGame.ts` |
| Shithead | `src/games/shithead/ai/ai-player.ts` | `src/games/shithead/hooks/useShitheadGame.ts` |
| Israeli Rummy | `src/games/israeli-rummy/ai/ai-player.ts` | `src/games/israeli-rummy/hooks/useIsraeliRummyGame.ts` |
| Rummy | `src/games/rummy/ai/ai-player.ts` | `src/games/rummy/hooks/useRummyGame.ts` |
| Gin Rummy | `src/games/rummy/ai/gin-ai.ts` | `src/games/rummy/hooks/useGinRummyGame.ts` |

### 3. Save/Load Audit

For each game hook, check:
- Game state saved to localStorage on every state change
- Saved game restored on component mount
- Saved game cleared on game end / new game
- Corrupted save data handled gracefully (try/catch)
- Save key is unique per game (no collisions)

Pattern to look for in each `use*Game.ts`:
```typescript
const SAVE_KEY = '...-saved-game';
function saveGame(state) { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
function loadSavedGame() { /* parse + validate */ }
function clearSavedGame() { localStorage.removeItem(SAVE_KEY); }
```

### 4. i18n Completeness

- Read `src/i18n/translations.ts`
- Check all game-specific strings have both `en` and `he` translations
- Check for hardcoded English strings in component TSX files
- Check that dynamic values (scores, names) aren't translated as part of keys

### 5. Game Flow Testing (via Preview)

Start the dev server and play through each game:

1. **Start game** → Verify dealing animation, initial state
2. **Play several turns** → AI responds, state updates correctly
3. **Trigger edge cases** → Empty draw pile, winning move, etc.
4. **End game** → Score displayed, new game works
5. **Refresh page** → Save/load works, game resumes

Use `preview_console_logs` after each action to check for errors/warnings.

### 6. Generate Report

```markdown
## Functionality Audit Report — WhistAchim
**Date**: [date] | **Scope**: [games audited]

### Critical Bugs (game-breaking)
[Numbered list — things that crash, hang, or violate rules]

### Logic Issues (incorrect behavior)
[Numbered list — wrong scoring, bad AI decisions, rule violations]

### Edge Case Gaps (untested paths)
[Numbered list — scenarios that might fail under specific conditions]

### AI Assessment
| Game | Decision Quality | Performance | Stuck Risk | Overall |
|------|-----------------|-------------|------------|---------|

### Save/Load Status
| Game | Saves? | Restores? | Clears? | Handles Corruption? |
|------|--------|-----------|---------|---------------------|

### i18n Completeness
| Area | EN | HE | Missing Keys |
|------|----|----|--------------|

### Top 5 Critical Fixes
### Top 5 Improvements
```

## Per-Game Rule Checklist

### WhistAchim (Whist)
- [ ] 52 cards dealt evenly to 4 players (13 each)
- [ ] Bidding: min 0, max 13; someone must bid 5+ for trump
- [ ] Last bidder can't make total = 13 (restricted bid)
- [ ] If no 5+ bid: exchange 3 cards, re-bid
- [ ] Trump suit set by highest bidder
- [ ] Must follow suit if possible
- [ ] Trump beats non-trump; highest of led suit wins otherwise
- [ ] Scoring: hit bid = bid^2 + 10; miss = -10 per trick off

### Yaniv
- [ ] Call Yaniv when hand value <= 7
- [ ] Assaf: another player with equal or lower value wins instead
- [ ] Valid discards: single, pair, sequence (3+)
- [ ] Draw from deck or top of discard pile
- [ ] Score accumulation across rounds; elimination at threshold

### Quartets
- [ ] Can only ask for cards of sets you hold at least one card from
- [ ] Successful ask = another turn; failed ask = turn passes
- [ ] Completed quartet (4 cards) removed and scored
- [ ] Game ends when all quartets completed

### Solitaire (Klondike)
- [ ] 7 tableau columns, top card face-up
- [ ] Foundation builds Ace → King per suit
- [ ] Tableau builds King → Ace alternating colors
- [ ] Stock cycles 1 card at a time
- [ ] Empty tableau column: only King can be placed
- [ ] Hint system: no pointless suggestions, no back-and-forth
- [ ] Joker: wildcard usable as any card (special rule)

### Shithead
- [ ] 3 face-down + 3 face-up + 3 hand cards per player
- [ ] Must play equal or higher than pile top
- [ ] Special cards: 2 (reset), 3 (invisible), 7 (next must play <=7), 10 (burn pile)
- [ ] Can't see face-down cards until played
- [ ] Pick up pile if can't play
- [ ] Last player with cards loses ("shithead")

### Israeli Rummy
- [ ] 2 decks + jokers; 14 cards per player
- [ ] First meld: 30+ points, only from hand, must include a run
- [ ] Valid melds: runs (3+ consecutive same suit) or sets (3-4 same rank diff suits)
- [ ] Ace = 1 only (no A after K)
- [ ] Can rearrange ALL table melds on your turn (after first meld met)
- [ ] All original table cards must remain on table after rearrangement
- [ ] Drawing ends turn immediately; melding then passes turn
- [ ] Win by emptying hand
- [ ] Empty draw pile: can still meld/rearrange or pass

### Rummy / Gin Rummy
- [ ] Valid melds: sets (3-4 same rank) and runs (3+ consecutive same suit)
- [ ] Draw from stock or discard pile each turn
- [ ] Discard one card to end turn
- [ ] Gin: all cards in melds, no deadwood
- [ ] Knock: deadwood <= 10 points
- [ ] Undercut: defender's deadwood <= knocker's
- [ ] Layoff on opponent's melds after knock (unless gin)
