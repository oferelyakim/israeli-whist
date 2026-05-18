# i18n: Add English/Hebrew Language Toggle

## Context
Users want to play the card game in Hebrew. We need a lightweight i18n system that translates all UI text while keeping the existing LTR layout (no RTL flip). The project currently has ~180 hardcoded English strings across 18 components, no existing i18n infrastructure, and no React context providers.

## Approach: Custom Lightweight i18n (no library)
A simple React Context + translation map — no external dependencies needed for this scope.

## Steps

### Step 1: Create translation infrastructure
**New file: `src/i18n/translations.ts`**
- Export a `Translations` type with all string keys
- Export `en` and `he` translation objects, keyed by logical names
- Group keys by area: `menu.*`, `lobby.*`, `bidding.*`, `game.*`, `yaniv.*`, `scoring.*`, `common.*`
- ~180 keys total (exact strings identified from codebase exploration)

**New file: `src/i18n/LanguageContext.tsx`**
- `Language` type: `'en' | 'he'`
- `LanguageContext` with `{ language, setLanguage, t }`
- `LanguageProvider` component that:
  - Reads initial language from `localStorage('whist_language')`, defaults to `'en'`
  - Provides a `t(key)` function that looks up the current language's translation
  - Persists language changes to localStorage
- Export `useTranslation()` hook → returns `{ t, language, setLanguage }`

### Step 2: Wire provider into app
**Modify: `src/main.tsx`**
- Wrap `<App />` with `<LanguageProvider>`

### Step 3: Add language toggle to MainMenu
**Modify: `src/components/lobby/MainMenu.tsx`**
- Add a small 🇬🇧/🇮🇱 toggle button (top-right of menu card)
- Uses `useTranslation()` to switch between `'en'` and `'he'`
- Replace all hardcoded strings with `t('menu.playVsAI')`, `t('menu.yourName')`, etc.

### Step 4: Translate game registry strings
**Modify: `src/games/registry.ts`**
- Change `displayName`, `description`, `rulesSnippet` from static strings to translation keys
- OR: make them functions that accept `t()` — simpler: just translate them in MainMenu where they're rendered

### Step 5: Replace hardcoded strings across all components
Each file gets `const { t } = useTranslation();` and string replacements:

| File | ~Strings |
|------|----------|
| `src/App.tsx` | 3 |
| `src/MultiplayerGameScreen.tsx` | 2 |
| `src/WhistGameScreen.tsx` | 1 |
| `src/components/lobby/MainMenu.tsx` | 12 |
| `src/components/lobby/RoomLobby.tsx` | 16 |
| `src/components/bidding/BiddingPanel.tsx` | 8 |
| `src/components/bidding/TrumpSelector.tsx` | 1 |
| `src/components/cards/TrickArea.tsx` | 2 |
| `src/components/exchange/ExchangePanel.tsx` | 5 |
| `src/components/layout/GameTable.tsx` | ~25 |
| `src/components/scoring/RoundSummary.tsx` | 6 |
| `src/components/scoring/Scoreboard.tsx` | 6 |
| `src/games/yaniv/components/YanivGameScreen.tsx` | 1 |
| `src/games/yaniv/components/YanivGameTable.tsx` | ~40 |
| `src/games/yaniv/components/YanivMultiplayerScreen.tsx` | 2 |

### Step 6: Handle interpolation
Some strings have dynamic values (e.g., "Round {n}", "Waiting for {name}"). The `t()` function will support a second argument for interpolation:
```ts
t('game.roundN', { n: round.roundNumber + 1 })
// en: "Round {n}" → "Round 3"
// he: "סיבוב {n}" → "סיבוב 3"
```

### Step 7: Build & verify
- Run `npm run build` to verify no TypeScript errors
- Test in preview: toggle language, verify all strings switch

## Key Design Decisions
- **No external i18n library** — scope is small (~180 strings, 2 languages), custom solution is simpler
- **LTR layout preserved** — only text changes, no `dir="rtl"` or layout flips
- **localStorage for persistence** — follows existing `whist_session` pattern
- **Translation keys grouped by area** — easier to maintain
- **Interpolation via `{placeholder}`** — simple regex replacement, no complex pluralization needed

## Files Created
- `src/i18n/translations.ts`
- `src/i18n/LanguageContext.tsx`

## Files Modified
- `src/main.tsx` (add LanguageProvider)
- `src/components/lobby/MainMenu.tsx` (language toggle + translations)
- `src/components/lobby/RoomLobby.tsx`
- `src/components/bidding/BiddingPanel.tsx`
- `src/components/bidding/TrumpSelector.tsx`
- `src/components/cards/TrickArea.tsx`
- `src/components/exchange/ExchangePanel.tsx`
- `src/components/layout/GameTable.tsx`
- `src/components/scoring/RoundSummary.tsx`
- `src/components/scoring/Scoreboard.tsx`
- `src/games/yaniv/components/YanivGameTable.tsx`
- `src/games/yaniv/components/YanivGameScreen.tsx`
- `src/games/yaniv/components/YanivMultiplayerScreen.tsx`
- `src/games/registry.ts`
- `src/App.tsx`
- `src/MultiplayerGameScreen.tsx`
- `src/WhistGameScreen.tsx`

## Verification
1. `npm run build` — zero errors
2. Preview: main menu shows language toggle, click to switch EN↔HE
3. All screens (menu, lobby, bidding, game table, scoring, Yaniv) show translated text
4. Language persists across page refresh
