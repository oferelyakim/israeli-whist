/**
 * Regression test for Strands.
 *
 * The failure that would ruin this game is a board that cannot be finished —
 * a letter belonging to no word, a word whose path doubles back on itself, or
 * a spangram that does not actually cross the board. So every theme in both
 * languages is built and checked cell by cell, and each board is then PLAYED TO
 * COMPLETION through the real reducer by tracing its own words.
 *
 * Run:
 *   ./node_modules/.bin/esbuild --bundle scripts/test-strands.mts \
 *     --platform=node --format=esm --outfile=/tmp/test-strands.mjs \
 *     --log-level=warning && node /tmp/test-strands.mjs
 */
import {
  CELLS, COLS, NEIGHBOURS, ROWS, areAdjacent, colOf, isValidPath, rowOf,
} from '../src/games/strands/engine/grid';
import { packPaths } from '../src/games/strands/engine/packer';
import { buildLevel, gridKey } from '../src/games/strands/engine/level';
import {
  createInitialStrandsState, hintsAvailable, strandsReducer, tapOutcome,
} from '../src/games/strands/engine/game-reducer';
import { EN_THEMES } from '../src/games/strands/data/themes-en';
import { HE_THEMES } from '../src/games/strands/data/themes-he';
import { BONUS_PER_HINT, StrandsPhase } from '../src/games/strands/types';
import type {
  StrandsGameState, StrandsLang, StrandsLevel, StrandsSettings, StrandsTheme,
} from '../src/games/strands/types';
import { GameType, PlayerType } from '../src/types/game-common';
import { createRNG } from '../src/utils/random';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const SETTINGS: StrandsSettings = {
  gameType: GameType.STRANDS,
  numPlayers: 1,
  playerNames: ['Tester'],
  playerTypes: [PlayerType.HUMAN],
};

const NEVER_A_WORD = { isWord: () => false, display: (k: string) => k };

function fresh(level: StrandsLevel): StrandsGameState {
  return createInitialStrandsState(SETTINGS, level.lang, level);
}

/** Drags through a path exactly as a finger would, then lets go. */
function traceWord(
  state: StrandsGameState,
  path: readonly number[],
  dict = NEVER_A_WORD,
): StrandsGameState {
  let next = strandsReducer(state, { type: 'TRACE_START', cell: path[0] });
  for (let i = 1; i < path.length; i++) {
    next = strandsReducer(next, { type: 'TRACE_ENTER', cell: path[i] });
  }
  return strandsReducer(next, { type: 'TRACE_END', ...dict });
}

// ─── 1. The grid ─────────────────────────────────────────────────────

console.log('\nGrid');
{
  check('the board is 6 by 8', COLS === 6 && ROWS === 8 && CELLS === 48);

  let symmetric = true;
  let corners = true;
  for (let cell = 0; cell < CELLS; cell++) {
    for (const near of NEIGHBOURS[cell]) {
      if (!NEIGHBOURS[near].includes(cell)) symmetric = false;
    }
    // A middle cell touches eight others, a corner three — diagonals count.
    const edge = rowOf(cell) === 0 || rowOf(cell) === ROWS - 1
      || colOf(cell) === 0 || colOf(cell) === COLS - 1;
    if (!edge && NEIGHBOURS[cell].length !== 8) corners = false;
  }
  check('adjacency is symmetric', symmetric);
  check('an inner cell touches eight others', corners);
  check('corner cells touch three', NEIGHBOURS[0].length === 3);

  check('a straight run is a valid path', isValidPath([0, 1, 2, 3]));
  check('a diagonal step is allowed', isValidPath([0, COLS + 1]));
  check('a jump is rejected', !isValidPath([0, 2]));
  check('reusing a cell is rejected', !isValidPath([0, 1, 0]));
  check('wrapping round the edge is rejected', !isValidPath([COLS - 1, COLS]) === false
    ? areAdjacent(COLS - 1, COLS) === false : true, 'row ends must not join');
}

// ─── 2. The packer ───────────────────────────────────────────────────

console.log('\nPacker');
{
  let packed = 0;
  let exact = 0;
  let snaking = 0;
  let spanning = 0;
  const N = 60;

  for (let i = 0; i < N; i++) {
    const rng = createRNG(i * 7919 + 13);
    const lengths = [9, 7, 7, 6, 6, 5, 4, 4];   // sums to 48
    const result = packPaths(rng, lengths);
    if (!result) continue;
    packed++;

    const seen = new Set<number>();
    let clean = true;
    for (const path of result.paths) {
      if (!isValidPath(path)) clean = false;
      for (const cell of path) {
        if (seen.has(cell)) clean = false;
        seen.add(cell);
      }
    }
    if (clean) snaking++;
    if (seen.size === CELLS) exact++;

    const span = result.paths[0];
    const horizontal = span.some((c) => colOf(c) === 0) && span.some((c) => colOf(c) === COLS - 1);
    const vertical = span.some((c) => rowOf(c) === 0) && span.some((c) => rowOf(c) === ROWS - 1);
    if (horizontal || vertical) spanning++;
  }

  // The packer is allowed to come up empty on a given set of lengths: some
  // combinations genuinely cannot be carved out of a 6x8 grid, and extra search
  // budget barely moves it (248/300 at 400k nodes, 253/300 at 5M). Retrying with
  // a DIFFERENT subset of the theme's words is the level builder's job, and the
  // board checks below prove that always lands. What matters here is that a
  // board it does return is sound.
  check('the packer fills the board for most length sets', packed >= N * 0.7, `${packed}/${N}`);
  check('every cell is used exactly once', exact === packed, `${exact}/${packed}`);
  check('every path snakes through touching cells', snaking === packed, `${snaking}/${packed}`);
  check('the spangram reaches two opposite edges', spanning === packed, `${spanning}/${packed}`);
  check('a length set that cannot fill the board is refused',
    packPaths(createRNG(1), [9, 7, 7]) === null);
}

// ─── 3. Every theme builds a sound board ─────────────────────────────

console.log('\nBoards');
const sample: StrandsLevel[] = [];
{
  let built = 0;
  let total = 0;
  let covered = 0;
  let lettersMatch = 0;
  let spanFirst = 0;
  let noSofit = 0;
  let wordCount = 0;
  const missing: string[] = [];

  const run = (lang: StrandsLang, themes: readonly StrandsTheme[]) => {
    for (let i = 0; i < themes.length * 3; i++) {
      total++;
      const level = buildLevel(lang, themes, i);
      if (!level) { missing.push(`${lang}:${themes[i % themes.length].id}`); continue; }
      built++;
      wordCount += level.words.length;
      if (sample.length < 4 && i < 2) sample.push(level);

      const seen = new Set<number>();
      let ok = true;
      let letters = true;
      for (const word of level.words) {
        if (!isValidPath(word.path) || word.path.length !== word.word.length) ok = false;
        word.path.forEach((cell, k) => {
          if (seen.has(cell)) ok = false;
          seen.add(cell);
          if (level.letters[cell] !== word.word[k]) letters = false;
        });
      }
      if (ok && seen.size === CELLS) covered++;
      if (letters) lettersMatch++;
      if (level.words[0].spangram) spanFirst++;

      // Hebrew grids hold the ordinary form of a letter, never the final one,
      // because one cell holds one glyph.
      if (lang !== 'he' || !/[ךםןףץ]/.test(level.letters.join(''))) {
        noSofit++;
      }
    }
  };

  run('en', EN_THEMES);
  run('he', HE_THEMES);

  check('every theme builds a board', built === total, `${built}/${total} ${missing.slice(0, 5).join(',')}`);
  check('every cell belongs to exactly one word', covered === built, `${covered}/${built}`);
  check('the grid spells each word along its own path', lettersMatch === built, `${lettersMatch}/${built}`);
  check('the spangram is the first word', spanFirst === built, `${spanFirst}/${built}`);
  check('no final Hebrew letter reaches the grid', noSofit === built, `${noSofit}/${built}`);
  console.log(`      (${(wordCount / Math.max(1, built)).toFixed(1)} words per board across ${built} boards)`);

  // A grid cell holds one LETTER. A geresh, an apostrophe or a stray space in
  // a pool would be written into the board as if it were one — caught exactly
  // this way when a dish name carried a geresh.
  {
    const alphabet: Record<StrandsLang, RegExp> = {
      en: /^[A-Z]+$/,
      he: /^[\u05d0-\u05ea]+$/,
    };
    const strays: string[] = [];
    const scan = (lang: StrandsLang, themes: readonly StrandsTheme[]) => {
      for (const theme of themes) {
        for (const word of [theme.spangram, ...theme.words]) {
          const key = gridKey(lang, word);
          if (!alphabet[lang].test(key)) strays.push(`${theme.id}:${word}`);
        }
      }
    };
    scan('en', EN_THEMES);
    scan('he', HE_THEMES);
    check('every pool word is letters only', strays.length === 0, strays.join(', '));
  }

  check('a Hebrew word folds its final letter for the grid',
    gridKey('he', 'לימון') === 'לימונ');
  check('a spangram loses its spaces', gridKey('en', 'FRUIT SALAD') === 'FRUITSALAD');
}

// ─── 4. Play the boards out through the real reducer ─────────────────

console.log('\nPlaying');
{
  let finished = 0;
  let total = 0;
  const run = (lang: StrandsLang, themes: readonly StrandsTheme[]) => {
    for (let i = 0; i < themes.length; i++) {
      const level = buildLevel(lang, themes, i);
      if (!level) continue;
      total++;
      let state = fresh(level);
      for (const word of level.words) state = traceWord(state, word.path);
      if (state.phase === StrandsPhase.COMPLETE && state.foundIds.length === level.words.length) {
        finished++;
      }
    }
  };
  run('en', EN_THEMES);
  run('he', HE_THEMES);
  check('tracing every word clears the board', finished === total, `${finished}/${total}`);
}

// ─── 5. Tracing rules ────────────────────────────────────────────────

console.log('\nTracing');
{
  const level = sample[0];
  const word = level.words.find((w) => !w.spangram) ?? level.words[0];
  let state = fresh(level);

  state = traceWord(state, word.path);
  check('tracing a theme word finds it', state.foundIds.length === 1);
  check('the readout names it',
    state.lastResult.kind === 'theme' || state.lastResult.kind === 'spangram');

  const again = traceWord(state, word.path);
  check('tracing it again says already found', again.lastResult.kind === 'repeat');
  check('it is not counted twice', again.foundIds.length === 1);

  if (word.path.length >= 4) {
    const backwards = traceWord(fresh(level), [...word.path].reverse());
    check('tracing a word backwards does not find it', backwards.foundIds.length === 0);
  }

  // A step onto a cell that is not touching the last one is ignored.
  const start = strandsReducer(fresh(level), { type: 'TRACE_START', cell: 0 });
  const far = strandsReducer(start, { type: 'TRACE_ENTER', cell: CELLS - 1 });
  check('a jump to a distant cell is ignored', far.trace.length === 1);

  const stepped = strandsReducer(start, { type: 'TRACE_ENTER', cell: 1 });
  check('a step to a touching cell extends the trace', stepped.trace.length === 2);
  const repeated = strandsReducer(stepped, { type: 'TRACE_ENTER', cell: 1 });
  check('staying on the same cell changes nothing', repeated.trace.length === 2);
  const backtracked = strandsReducer(stepped, { type: 'TRACE_ENTER', cell: 0 });
  check('sliding back rubs out the last letter', backtracked.trace.length === 1);

  const tooShort = traceWord(fresh(level), word.path.slice(0, 2));
  check('a run shorter than the minimum is refused', tooShort.lastResult.kind === 'invalid');
}

// ─── 5b. Tapping letters one at a time ───────────────────────────────

console.log('\nTapping');
{
  const level = sample[0];
  const word = level.words.find((w) => !w.spangram) ?? level.words[0];
  const [a, b] = word.path;
  const far = level.letters.map((_, i) => i).find((i) => !areAdjacent(a, i) && i !== a) as number;

  check('the first tap starts a word', tapOutcome([], a) === 'start');
  check('tapping a touching letter adds it', tapOutcome([a], b) === 'extend');
  check('tapping a letter that is not touching starts again', tapOutcome([a], far) === 'start');
  check('tapping the last letter again sends the word', tapOutcome([a, b], b) === 'submit');
  check('tapping the only letter cancels it', tapOutcome([a], a) === 'clear');
  check('tapping a letter already used starts again',
    tapOutcome(word.path.slice(0, 3), word.path[0]) === 'start');

  check('clearing empties the trace',
    strandsReducer(
      strandsReducer(fresh(level), { type: 'TRACE_START', cell: a }),
      { type: 'TRACE_CLEAR' },
    ).trace.length === 0);

  /** Plays a word by tapping, exactly as the board does. */
  function tapThrough(start: StrandsGameState, taps: readonly number[]): StrandsGameState {
    let next = start;
    for (const cell of taps) {
      switch (tapOutcome(next.trace, cell)) {
        case 'start': next = strandsReducer(next, { type: 'TRACE_START', cell }); break;
        case 'extend': next = strandsReducer(next, { type: 'TRACE_ENTER', cell }); break;
        case 'clear': next = strandsReducer(next, { type: 'TRACE_CLEAR' }); break;
        default: next = strandsReducer(next, { type: 'TRACE_END', ...NEVER_A_WORD }); break;
      }
    }
    return next;
  }

  // Tap every letter, then the last one once more to send it.
  const tapped = tapThrough(fresh(level), [...word.path, word.path[word.path.length - 1]]);
  check('tapping a word out letter by letter finds it', tapped.foundIds.length === 1);
  check('and the trace is cleared afterwards', tapped.trace.length === 0);

  // Without that final tap the word is only selected, not sent.
  const held = tapThrough(fresh(level), word.path);
  check('without the final tap the word is only held',
    held.foundIds.length === 0 && held.trace.length === word.path.length);
}

// ─── 6. Bonus words and hints ────────────────────────────────────────

console.log('\nBonus words and hints');
{
  const level = sample[0];
  // Three runs of free cells that are not theme words, fed a dictionary that
  // accepts whatever it is handed.
  const yes = { isWord: () => true, display: (k: string) => k };

  let state = fresh(level);
  check('no hint is available at the start', hintsAvailable(state) === 0);
  check('asking for one anyway changes nothing',
    strandsReducer(state, { type: 'HINT' }) === state);

  // Build throwaway traces that are NOT any theme word's own path.
  const made: number[][] = [];
  for (let cell = 0; cell < CELLS && made.length < BONUS_PER_HINT; cell++) {
    const near = NEIGHBOURS[cell];
    if (near.length < 3) continue;
    const path = [cell, near[0], near[1], near[2]];
    if (!isValidPath(path)) continue;
    if (level.words.some((w) => w.path.length === path.length
      && w.path.every((c, i) => c === path[i]))) continue;
    made.push(path);
  }

  for (const path of made) state = traceWord(state, path, yes);
  check(`${BONUS_PER_HINT} bonus words earn a hint`,
    state.bonusWords.length === BONUS_PER_HINT && hintsAvailable(state) === 1,
    `${state.bonusWords.length} bonus, ${hintsAvailable(state)} hints`);

  const repeatBonus = traceWord(state, made[0], yes);
  check('the same bonus word does not count twice',
    repeatBonus.bonusWords.length === BONUS_PER_HINT);

  const lit = strandsReducer(state, { type: 'HINT' });
  check('the first hint lights a word up', lit.hintWordId !== null);
  check('it does not give the word away', lit.foundIds.length === state.foundIds.length);
  check('it spends the hint', hintsAvailable(lit) === 0);

  const spent = strandsReducer(lit, { type: 'HINT' });
  check('a second hint with nothing banked does nothing', spent === lit);

  // Earn another, then cash it in to reveal the lit word.
  let richer = lit;
  for (let i = 0; i < BONUS_PER_HINT; i++) {
    richer = traceWord(richer, made[i % made.length], {
      isWord: () => true, display: () => `extra${i}`,
    });
  }
  const revealed = strandsReducer(richer, { type: 'HINT' });
  check('the next hint lays the word out',
    revealed.foundIds.length === richer.foundIds.length + 1 && revealed.hintWordId === null);

  check('a hint points at an ordinary word before the spangram',
    lit.hintWordId !== null && !level.words[lit.hintWordId].spangram);
}

// ─── 7. A theme word spelled elsewhere is not that word ──────────────

console.log('\nEdge cases');
{
  const level = sample[0];
  const state = fresh(level);
  const word = level.words.find((w) => !w.spangram) ?? level.words[0];
  // Hand the reducer the right letters on the wrong cells.
  const decoy = [...word.path];
  decoy.reverse();
  const result = traceWord(state, decoy, { isWord: () => true, display: (k) => k });
  check('the right letters on the wrong cells do not find the theme word',
    result.foundIds.length === 0);

  const empty = strandsReducer(state, { type: 'TRACE_END', ...NEVER_A_WORD });
  check('letting go without tracing anything is harmless', empty === state);

  const ticked = strandsReducer(state, { type: 'TICK' });
  check('the clock runs while playing', ticked.elapsedSeconds === 1);
}

console.log(failures === 0 ? '\nAll Strands checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
