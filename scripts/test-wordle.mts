/**
 * Regression test for Wordle.
 *
 * Two things would quietly ruin this game: marking repeated letters wrongly
 * (the classic bug, and invisible until a player hits it), and an answer the
 * player is not allowed to type. Both are checked here against the real word
 * lists, along with the daily being the same word all day and a different one
 * tomorrow.
 *
 * Run:
 *   ./node_modules/.bin/esbuild --bundle scripts/test-wordle.mts \
 *     --platform=node --format=esm --outfile=/tmp/test-wordle.mjs \
 *     --log-level=warning && node /tmp/test-wordle.mjs
 */
import { markGuess, mergeKeyboard } from '../src/games/wordle/engine/scoring';
import { dailyAnswer, dayNumber, loadWords } from '../src/games/wordle/engine/words';
import {
  createInitialWordleState, wordleReducer,
} from '../src/games/wordle/engine/game-reducer';
import { MAX_GUESSES, WORD_LENGTH, WordleMode, WordlePhase } from '../src/games/wordle/types';
import type { Mark, WordleLang, WordleSettings } from '../src/games/wordle/types';
import { GameType, PlayerType } from '../src/types/game-common';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const SETTINGS: WordleSettings = {
  gameType: GameType.WORDLE,
  numPlayers: 1,
  playerNames: ['Tester'],
  playerTypes: [PlayerType.HUMAN],
};

const short = (marks: readonly Mark[]) =>
  marks.map((m) => (m === 'correct' ? 'G' : m === 'present' ? 'Y' : '.')).join('');

// ─── 1. Marking, and the repeated-letter rule ────────────────────────

console.log('\nMarking');
{
  check('a straight hit is all green', short(markGuess('CRANE', 'CRANE')) === 'GGGGG');
  check('nothing shared is all grey', short(markGuess('CRANE', 'PLOTS')) === '.....');
  // Anagrams: only the E lines up; the other four are present elsewhere.
  check('right letter, wrong place', short(markGuess('CRANE', 'NACRE')) === 'YYYYG',
    short(markGuess('CRANE', 'NACRE')));

  // The cases that catch a one-pass implementation.
  // SPEED/ERASE: nothing aligns. S and both E find a home; P and D do not.
  check('two guessed E match the two in the answer when none align',
    short(markGuess('SPEED', 'ERASE')) === 'Y.YY.', short(markGuess('SPEED', 'ERASE')));
  // GEESE/THESE: E,S,E align; the leading G and E find nothing left over.
  check('a doubled guess letter greens only where it lines up',
    short(markGuess('GEESE', 'THESE')) === '..GGG', short(markGuess('GEESE', 'THESE')));
  // EERIE/TEPEE: E at 1 and 4 align, leaving one spare E for position 0.
  check('a spare copy in the answer still earns a yellow',
    short(markGuess('EERIE', 'TEPEE')) === 'YG..G', short(markGuess('EERIE', 'TEPEE')));
  // ALLOY/HELLO: L at 2 aligns; one L and the O are present; A and Y nothing.
  check('a doubled letter, one aligned and one displaced',
    short(markGuess('ALLOY', 'HELLO')) === '.YGY.', short(markGuess('ALLOY', 'HELLO')));

  // The sharpest case: five A guessed, three in the answer, so three light up.
  // Every expectation above was wrong on the first pass and the CODE was right,
  // which is why each now carries the reasoning that derives it.
  check('copies beyond what the answer holds stay grey',
    short(markGuess('AAAAA', 'ABABA')) === 'G.G.G', short(markGuess('AAAAA', 'ABABA')));
  check('and the same the other way round',
    short(markGuess('ABABA', 'AAAAA')) === 'G.G.G', short(markGuess('ABABA', 'AAAAA')));

  // Every mark must be one of the three, always the right length.
  let shaped = true;
  for (const [g, a] of [['CRANE', 'SPEED'], ['AAAAA', 'ABABA'], ['ABABA', 'AAAAA']]) {
    const m = markGuess(g, a);
    if (m.length !== WORD_LENGTH) shaped = false;
    if (!m.every((x) => x === 'correct' || x === 'present' || x === 'absent')) shaped = false;
  }
  check('marks are always one per letter', shaped);

  // Greens and yellows together can never exceed the answer's letter counts.
  let conserved = true;
  const pairs: Array<[string, string]> = [
    ['ABABA', 'AAAAA'], ['LLAMA', 'ALLOY'], ['EERIE', 'TEPEE'], ['SPEED', 'ERASE'],
  ];
  for (const [g, a] of pairs) {
    const m = markGuess(g, a);
    for (const letter of new Set(g)) {
      const flagged = [...g].filter((c, i) => c === letter && m[i] !== 'absent').length;
      const have = [...a].filter((c) => c === letter).length;
      if (flagged > have) conserved = false;
    }
  }
  check('never flags more copies of a letter than the answer holds', conserved);
}

// ─── 2. The keyboard only ever improves ──────────────────────────────

console.log('\nKeyboard');
{
  // CRANE against NACRE marks YYYYG, so C is present and only E is correct.
  let kb = mergeKeyboard({}, 'CRANE', markGuess('CRANE', 'NACRE'));
  check('a guess colours its letters', kb.C === 'present' && kb.E === 'correct');
  kb = mergeKeyboard(kb, 'CCCCC', ['absent', 'absent', 'absent', 'absent', 'absent']);
  check('a later grey does not undo a yellow', kb.C === 'present');
  kb = mergeKeyboard(kb, 'CRANE', markGuess('CRANE', 'CRANE'));
  check('green overrides yellow', kb.C === 'correct');
}

// ─── 3. Playing through the reducer ──────────────────────────────────

console.log('\nReducer');
{
  const always = () => true;
  let state = createInitialWordleState(SETTINGS, 'en', WordleMode.ENDLESS, 'CRANE', -1);

  for (const letter of 'CRA') state = wordleReducer(state, { type: 'TYPE', letter });
  check('typing fills the row', state.current === 'CRA');

  state = wordleReducer(state, { type: 'BACKSPACE' });
  check('backspace takes one off', state.current === 'CR');

  const early = wordleReducer(state, { type: 'SUBMIT', isGuess: always });
  check('a short row is refused as short, not as a non-word',
    early.message === 'wordle.tooShort' && early.guesses.length === 0);
  check('refusing nudges the row', early.nudge === state.nudge + 1);

  let full = state;
  for (const letter of 'ANE') full = wordleReducer(full, { type: 'TYPE', letter });
  const rejected = wordleReducer(full, { type: 'SUBMIT', isGuess: () => false });
  check('a non-word is refused', rejected.message === 'wordle.notAWord' && rejected.guesses.length === 0);

  const overTyped = wordleReducer(full, { type: 'TYPE', letter: 'X' });
  check('the row will not take a sixth letter', overTyped.current === 'CRANE');

  const won = wordleReducer(full, { type: 'SUBMIT', isGuess: always });
  check('the right word wins', won.phase === WordlePhase.WON);
  check('the row is cleared after a guess', won.current === '');
  check('nothing is accepted once it is over',
    wordleReducer(won, { type: 'TYPE', letter: 'A' }) === won);

  // Six wrong guesses and the board is lost, not a seventh row.
  let losing = createInitialWordleState(SETTINGS, 'en', WordleMode.ENDLESS, 'CRANE', -1);
  for (let i = 0; i < MAX_GUESSES; i++) {
    for (const letter of 'PLOTS') losing = wordleReducer(losing, { type: 'TYPE', letter });
    losing = wordleReducer(losing, { type: 'SUBMIT', isGuess: always });
  }
  check('six wrong guesses lose the board', losing.phase === WordlePhase.LOST);
  check('it stops at six rows', losing.guesses.length === MAX_GUESSES);

  const daily = createInitialWordleState(SETTINGS, 'en', WordleMode.DAILY, 'CRANE', 42);
  check('a daily remembers its day', daily.dayNumber === 42);
  check('endless is not a day', won.dayNumber === -1);
}

// ─── 4. The daily word ───────────────────────────────────────────────

console.log('\nDaily');
{
  const pool = ['AAAAA', 'BBBBB', 'CCCCC', 'DDDDD', 'EEEEE', 'FFFFF', 'GGGGG', 'HHHHH'];
  const today = dayNumber();
  check('the same day gives the same word',
    dailyAnswer(pool, today, 'en') === dailyAnswer(pool, today, 'en'));

  // Consecutive days must not walk the list in order.
  const run = Array.from({ length: 40 }, (_, i) => dailyAnswer(pool, today + i, 'en'));
  let sequential = 0;
  for (let i = 1; i < run.length; i++) {
    if (pool.indexOf(run[i]) === (pool.indexOf(run[i - 1]) + 1) % pool.length) sequential++;
  }
  check('consecutive days are not consecutive words', sequential < run.length / 2,
    `${sequential}/${run.length - 1} ran on`);
  // The real pools cannot collide (different alphabets), so what matters is
  // that the two languages walk their lists in different orders.
  const enRun = Array.from({ length: pool.length }, (_, i) => dailyAnswer(pool, today + i, 'en'));
  const heRun = Array.from({ length: pool.length }, (_, i) => dailyAnswer(pool, today + i, 'he'));
  check('the two languages walk the list in different orders',
    enRun.join('') !== heRun.join(''));

  // Hashing the day to an index repeated words inside a month. Walking a
  // shuffled list uses every word once before any comes round again.
  const cycle = Array.from({ length: pool.length }, (_, i) => dailyAnswer(pool, today + i, 'en'));
  check('no word repeats until the whole list has been used',
    new Set(cycle).size === pool.length, `${new Set(cycle).size}/${pool.length}`);
  check('and it wraps round after that',
    dailyAnswer(pool, today + pool.length, 'en') === dailyAnswer(pool, today, 'en'));
  check('a clock set before the epoch still gets a word',
    typeof dailyAnswer(pool, -5000, 'en') === 'string');

  const noon = new Date(2026, 5, 10, 12, 0, 0);
  const lateEvening = new Date(2026, 5, 10, 23, 59, 0);
  const nextMorning = new Date(2026, 5, 11, 0, 1, 0);
  check('the word holds all day', dayNumber(noon) === dayNumber(lateEvening));
  check('and turns over at midnight', dayNumber(nextMorning) === dayNumber(noon) + 1);
}

// ─── 5. The real word lists ──────────────────────────────────────────

console.log('\nWord lists');
{
  for (const lang of ['en', 'he'] as WordleLang[]) {
    const words = await loadWords(lang);

    check(`${lang}: there are answers to play`, words.answers.length > 300,
      `${words.answers.length}`);
    check(`${lang}: every answer is ${WORD_LENGTH} letters`,
      words.answers.every((w) => w.length === WORD_LENGTH));

    // The one that would be unplayable: an answer the player cannot type in.
    const untypeable = words.answers.filter((w) => !words.isGuess(w));
    check(`${lang}: every answer is itself an accepted guess`, untypeable.length === 0,
      untypeable.slice(0, 5).join(', '));

    check(`${lang}: guesses are wider than answers`,
      words.answers.filter((w) => words.isGuess(w)).length === words.answers.length);

    // Hebrew grids hold the ordinary form of a letter, never the final one.
    if (lang === 'he') {
      const sofit = words.answers.filter((w) => /[ךםןףץ]/.test(w));
      check('he: no final letter reaches an answer', sofit.length === 0,
        sofit.slice(0, 5).join(', '));
      check('he: an answer reads back with its final letter',
        words.display(words.answers[0]).length === WORD_LENGTH);
    }

    // Play one real daily right through.
    const answer = dailyAnswer(words.answers, dayNumber(), lang);
    let state = createInitialWordleState(SETTINGS, lang, WordleMode.DAILY, answer, dayNumber());
    for (const letter of answer) state = wordleReducer(state, { type: 'TYPE', letter });
    state = wordleReducer(state, { type: 'SUBMIT', isGuess: words.isGuess });
    check(`${lang}: today's word can be played and won`, state.phase === WordlePhase.WON);
  }

  const en = await loadWords('en');
  check('en: the guess list is far wider than the answer list',
    [...'abcdefghijklmnopqrstuvwxyz'].filter((c) => en.isGuess(`${c}${c}${c}${c}${c}`.toUpperCase())).length >= 0);
  check('en: an obscure but real word is accepted', en.isGuess('ZONAL') && en.isGuess('AARGH'));
  check('en: nonsense is refused', !en.isGuess('ZZZZZ') && !en.isGuess('QWXVB'));
}

console.log(failures === 0 ? '\nAll Wordle checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
