/**
 * Regression test for Word Wonders.
 *
 * The thing that would actually strand a player is a level that cannot be
 * generated, or a board demanding a word the wheel cannot spell. So this walks
 * every shipped seed through the real generator and then plays each board to
 * completion through the real reducer.
 *
 * Run:
 *   ./node_modules/.bin/esbuild --bundle scripts/test-wordwonders.mts \
 *     --platform=node --format=esm --outfile=/tmp/test-ww.mjs \
 *     --log-level=warning && node /tmp/test-ww.mjs
 */
import { loadDictionary, wordsFromLetters } from '../src/games/wordwonders/engine/dictionary';
import { buildLevel, seedForLevel } from '../src/games/wordwonders/engine/level';
import { packWords } from '../src/games/wordwonders/engine/packer';
import {
  buildGrid,
  createInitialWordState,
  wordWondersReducer,
  HINT_COST,
} from '../src/games/wordwonders/engine/game-reducer';
import { toDisplay, toPlain } from '../src/games/wordwonders/engine/hebrew';
import { EN_SEEDS } from '../src/games/wordwonders/data/seeds-en';
import { HE_SEEDS } from '../src/games/wordwonders/data/seeds-he';
import { WordPhase } from '../src/games/wordwonders/types';
import type { WordLang, WordWondersGameSettings } from '../src/games/wordwonders/types';
import { GameType, PlayerType } from '../src/types/game-common';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const SETTINGS: WordWondersGameSettings = {
  gameType: GameType.WORD_WONDERS,
  numPlayers: 1,
  playerNames: ['Tester'],
  playerTypes: [PlayerType.HUMAN],
};

// ─── 1. Hebrew final letters ─────────────────────────────────────────

console.log('\nHebrew sofit handling');
check('final glyphs fold to their plain form', toPlain('מכתבים') === 'מכתבימ');
check('plain key renders with its final glyph', toDisplay('מכתבימ') === 'מכתבים');
check('round trip is stable', toPlain(toDisplay('שמימ')) === 'שמימ');
check('a loanword keeps its non-final letter', toDisplay('קליפ') === 'קליפ');
check('a word not ending in those letters is unchanged', toDisplay('גשמי') === 'גשמי');

// ─── 2. The packer's own rules ───────────────────────────────────────

console.log('\nPacker');
{
  const packed = packWords(['SILVER', 'LIVES', 'EVIL'], 42);
  check('packs a small set', packed !== null && packed.placements.length === 3);
  if (packed) {
    // Every crossing must agree on its letter, or the board is nonsense.
    const cells = new Map<string, string>();
    let conflict = false;
    for (const p of packed.placements) {
      for (let i = 0; i < p.word.length; i++) {
        const r = p.row + (p.horiz ? 0 : i);
        const c = p.col + (p.horiz ? i : 0);
        const key = `${r},${c}`;
        const prev = cells.get(key);
        if (prev !== undefined && prev !== p.word[i]) conflict = true;
        cells.set(key, p.word[i]);
      }
    }
    check('crossings agree on their letter', !conflict);
    check('placements sit inside the reported bounds',
      packed.placements.every((p) => {
        const endR = p.row + (p.horiz ? 0 : p.word.length - 1);
        const endC = p.col + (p.horiz ? p.word.length - 1 : 0);
        return p.row >= 0 && p.col >= 0 && endR < packed.rows && endC < packed.cols;
      }));
  }
  check('an unplaceable set is refused', packWords(['ABCDE', 'FGHIJ'], 1) === null);
}

// ─── 3. Every shipped seed builds, and every board is spellable ──────

const LANGS: { lang: WordLang; seeds: ReadonlyArray<string> }[] = [
  { lang: 'en', seeds: EN_SEEDS },
  { lang: 'he', seeds: HE_SEEDS },
];

for (const { lang, seeds } of LANGS) {
  console.log(`\n${lang.toUpperCase()}: ${seeds.length} seeds`);
  const dict = await loadDictionary(lang);

  let built = 0;
  let unspellable = 0;
  let notInDict = 0;
  let oversized = 0;
  let firstBad = '';

  for (let index = 0; index < seeds.length; index++) {
    const seed = seedForLevel(seeds, index);
    const level = buildLevel(dict, seed, index);
    if (!level) { firstBad = firstBad || `seed ${seed} at index ${index} produced no level`; continue; }
    built++;

    if (level.rows > 9 || level.cols > 9) oversized++;

    const spellable = new Set(wordsFromLetters(dict, level.letters));
    for (const w of level.words) {
      // A grid word the wheel cannot spell is an unwinnable board.
      if (!spellable.has(w.key)) { unspellable++; firstBad = firstBad || `${w.key} not spellable from ${seed}`; }
      if (!dict.grid.has(w.key)) { notInDict++; firstBad = firstBad || `${w.key} is not a grid-tier word`; }
    }
  }

  check(`all ${seeds.length} seeds build a level`, built === seeds.length, firstBad || `${built} built`);
  check('every grid word is spellable from its wheel', unspellable === 0, `${unspellable} bad`);
  check('every grid word is common enough for a grid', notInDict === 0, `${notInDict} bad`);
  check('no board exceeds 9x9', oversized === 0, `${oversized} oversized`);
}

// ─── 4. Playing a board to completion through the reducer ────────────

for (const { lang, seeds } of LANGS) {
  console.log(`\n${lang.toUpperCase()}: playing 25 boards through the reducer`);
  const dict = await loadDictionary(lang);
  let cleared = 0;
  let firstBad = '';

  for (let index = 0; index < 25; index++) {
    const level = buildLevel(dict, seedForLevel(seeds, index), index);
    if (!level) continue;
    let state = wordWondersReducer(
      createInitialWordState(SETTINGS, lang),
      { type: 'LOAD_LEVEL', level },
    );

    for (const word of level.words) {
      // Trace the word by picking the wheel slots that spell it.
      const used = new Set<number>();
      let ok = true;
      for (const ch of word.key) {
        const slot = state.wheelOrder.findIndex(
          (letterIndex, s) => !used.has(s) && level.letters[letterIndex] === ch,
        );
        if (slot === -1) { ok = false; break; }
        used.add(slot);
        state = wordWondersReducer(state, { type: 'TRACE_ENTER', wheelIndex: slot });
        if (state.picked.length === 0) {
          state = wordWondersReducer(state, { type: 'TRACE_START', wheelIndex: slot });
        }
      }
      if (!ok) { firstBad = firstBad || `could not trace ${word.key}`; break; }
      state = wordWondersReducer(state, {
        type: 'TRACE_END',
        isWord: (k) => dict.all.has(k),
        display: (k) => dict.display(k),
      });
    }

    if (state.phase === WordPhase.COMPLETE && state.foundIds.length === level.words.length) cleared++;
    else firstBad = firstBad || `level ${index} ended with ${state.foundIds.length}/${level.words.length}`;
  }

  check('25/25 boards played to completion', cleared === 25, firstBad || `${cleared} cleared`);
}

// ─── 5. Reducer rules ────────────────────────────────────────────────

console.log('\nReducer rules');
{
  const dict = await loadDictionary('en');
  const level = buildLevel(dict, seedForLevel(EN_SEEDS, 0), 0)!;
  const base = wordWondersReducer(
    createInitialWordState(SETTINGS, 'en'),
    { type: 'LOAD_LEVEL', level },
  );

  check('board starts fully hidden', buildGrid(base).every((c) => c === null || !c.shown));
  check('wheel has one slot per letter', base.wheelOrder.length === level.letters.length);

  let s = wordWondersReducer(base, { type: 'TRACE_START', wheelIndex: 0 });
  s = wordWondersReducer(s, { type: 'TRACE_ENTER', wheelIndex: 1 });
  check('tracing collects letters', s.picked.length === 2);
  s = wordWondersReducer(s, { type: 'TRACE_ENTER', wheelIndex: 0 });
  check('dragging back removes the last letter', s.picked.length === 1, `got ${s.picked.length}`);

  const reject = wordWondersReducer(
    wordWondersReducer(base, { type: 'TRACE_START', wheelIndex: 0 }),
    { type: 'TRACE_END', isWord: () => false, display: (k) => k },
  );
  check('a word under 3 letters is dropped silently',
    reject.picked.length === 0 && reject.lastResult.kind === 'none');

  const hinted = wordWondersReducer(base, { type: 'HINT' });
  check('a hint uncovers exactly one cell', hinted.revealedCells.length === 1);
  check('a hint costs coins', hinted.coins === base.coins - HINT_COST);
  check('the uncovered cell shows in the grid',
    buildGrid(hinted).filter((c) => c && c.shown).length === 1);

  const broke = wordWondersReducer({ ...base, coins: 0 }, { type: 'HINT' });
  check('no hint without the coins', broke.revealedCells.length === 0);

  const shuffled = wordWondersReducer(base, { type: 'SHUFFLE' });
  check('shuffle keeps every letter',
    [...shuffled.wheelOrder].sort().join() === [...base.wheelOrder].sort().join());
}

console.log(failures === 0 ? '\nAll Word Wonders checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
