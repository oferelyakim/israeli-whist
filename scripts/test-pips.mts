/**
 * Regression test for Pips.
 *
 * The failure that would ruin this game is a board that cannot be finished, or
 * one with a second answer the clues never rule out — so every generated
 * puzzle is brute-force checked for a unique layout, and the generator's own
 * answer is replayed through the REAL reducer. A bug in the constraint rules,
 * the placement rules or the win check fails here rather than stranding a
 * player on an unwinnable board.
 *
 * Run:
 *   ./node_modules/.bin/esbuild --bundle scripts/test-pips.mts \
 *     --platform=node --format=esm --outfile=/tmp/test-pips.mjs \
 *     --log-level=warning && node /tmp/test-pips.mjs
 */
import {
  MAX_PIP,
  cellValues,
  isSolved,
  parseKey,
  regionStatus,
} from '../src/games/pips/engine/board';
import { DIFFICULTY_SPEC, generatePuzzle } from '../src/games/pips/engine/generate';
import { solve } from '../src/games/pips/engine/solver';
import { buildLevel, seedForLevel } from '../src/games/pips/engine/levels';
import { createInitialPipsState, pipsReducer } from '../src/games/pips/engine/game-reducer';
import { PipsDifficulty, PipsPhase } from '../src/games/pips/types';
import type { CellKey, PipsGameState, PipsPuzzle, PipsSettings } from '../src/games/pips/types';
import { GameType, PlayerType } from '../src/types/game-common';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const SETTINGS: PipsSettings = {
  gameType: GameType.PIPS,
  numPlayers: 1,
  playerNames: ['Tester'],
  playerTypes: [PlayerType.HUMAN],
};

const DIFFICULTIES = [PipsDifficulty.EASY, PipsDifficulty.MEDIUM, PipsDifficulty.HARD];
const PER_DIFFICULTY = 25;

/** Plays a whole solution through the reducer, one PLACE at a time. */
function replay(puzzle: PipsPuzzle): { state: PipsGameState; earlyWin: boolean } {
  let state = createInitialPipsState(SETTINGS, 0, puzzle);
  let earlyWin = false;
  puzzle.solution.forEach((placement, i) => {
    const [anchorRow, anchorCol] = parseKey(placement.cells[0]);
    const [tailRow, tailCol] = parseKey(placement.cells[1]);
    const dr = tailRow - anchorRow;
    const dc = tailCol - anchorCol;
    const orientation = dc === 1 ? 0 : dr === 1 ? 1 : dc === -1 ? 2 : 3;
    state = pipsReducer(state, {
      type: 'PLACE',
      dominoId: placement.dominoId,
      anchor: placement.cells[0],
      orientation,
    });
    if (state.phase === PipsPhase.SOLVED && i < puzzle.solution.length - 1) earlyWin = true;
  });
  return { state, earlyWin };
}

// ─── 1. Generated boards are well formed ─────────────────────────────

console.log('\nBoards');
{
  let covered = 0;
  let realTiles = 0;
  let distinctTiles = 0;
  let adjacency = 0;
  let allUsed = 0;
  let total = 0;

  for (const difficulty of DIFFICULTIES) {
    const spec = DIFFICULTY_SPEC[difficulty];
    for (let i = 0; i < PER_DIFFICULTY; i++) {
      total++;
      const puzzle = generatePuzzle(i * 7919 + 31, difficulty);

      // The solution must cover every cell exactly once.
      const seen = new Set<CellKey>();
      let doubled = false;
      for (const placed of puzzle.solution) {
        for (const cell of placed.cells) {
          if (seen.has(cell)) doubled = true;
          seen.add(cell);
        }
      }
      if (!doubled && seen.size === puzzle.cells.length
        && puzzle.cells.every((c) => seen.has(c))) covered++;

      // Every tile is a real double-six tile, and no tile is dealt twice.
      if (puzzle.dominoes.every((d) => d.a >= 0 && d.b >= 0 && d.a <= spec.maxPip && d.b <= spec.maxPip)) realTiles++;
      const faces = new Set(puzzle.dominoes.map((d) => `${Math.min(d.a, d.b)}|${Math.max(d.a, d.b)}`));
      if (faces.size === puzzle.dominoes.length) distinctTiles++;

      // Each placement's two cells must actually be neighbours.
      if (puzzle.solution.every((p) => {
        const [r1, c1] = parseKey(p.cells[0]);
        const [r2, c2] = parseKey(p.cells[1]);
        return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
      })) adjacency++;

      const ids = new Set(puzzle.solution.map((p) => p.dominoId));
      if (ids.size === puzzle.dominoes.length) allUsed++;
    }
  }

  check('the answer covers every cell exactly once', covered === total, `${covered}/${total}`);
  check('every tile comes from the difficulty’s domino set', realTiles === total, `${realTiles}/${total}`);
  check('no tile is dealt twice', distinctTiles === total, `${distinctTiles}/${total}`);
  check('both halves of a tile land on neighbouring cells', adjacency === total, `${adjacency}/${total}`);
  check('every dealt tile is used by the answer', allUsed === total, `${allUsed}/${total}`);
}

// ─── 2. Clues are true, and leave exactly one answer ─────────────────

console.log('\nClues');
{
  let satisfied = 0;
  let unique = 0;
  let proven = 0;
  let total = 0;
  const kinds: Record<string, number> = {};

  for (const difficulty of DIFFICULTIES) {
    for (let i = 0; i < PER_DIFFICULTY; i++) {
      total++;
      const puzzle = generatePuzzle(i * 104_729 + 17, difficulty);
      const values = cellValues(puzzle.dominoes, puzzle.solution);
      if (puzzle.regions.every((r) => regionStatus(r, values) === 'ok')) satisfied++;
      for (const region of puzzle.regions) kinds[region.kind] = (kinds[region.kind] ?? 0) + 1;

      // Brute force: the clues must admit exactly one pip layout, and the
      // search must have finished rather than run out of budget.
      const outcome = solve(puzzle, 3);
      if (outcome.complete) proven++;
      if (outcome.complete && outcome.count === 1) unique++;
    }
  }

  check('the generator’s own answer satisfies every clue', satisfied === total, `${satisfied}/${total}`);
  check('the search always finishes inside its budget', proven === total, `${proven}/${total}`);
  check('every board has exactly one answer', unique === total, `${unique}/${total}`);
  check('no clue kind is NONE once the board is built', !('NONE' in kinds));
  console.log(`      (clue mix: ${Object.entries(kinds).map(([k, v]) => `${k}=${v}`).join(' ')})`);
}

// ─── 3. Constraint rules ─────────────────────────────────────────────

console.log('\nConstraint rules');
{
  const cells = ['0,0', '0,1'];
  const values = new Map<CellKey, number>([['0,0', 3]]);
  const full = new Map<CellKey, number>([['0,0', 3], ['0,1', 4]]);

  const sum7 = { id: 'r', cells, kind: 'SUM' as const, value: 7, colour: 0 };
  check('a half-filled sum stays open', regionStatus(sum7, values) === 'open');
  check('the exact sum passes', regionStatus(sum7, full) === 'ok');

  const sum2 = { id: 'r', cells, kind: 'SUM' as const, value: 2, colour: 0 };
  check('a sum already overshot fails early', regionStatus(sum2, values) === 'bad');

  const sum12 = { id: 'r', cells, kind: 'SUM' as const, value: 12, colour: 0 };
  check('a sum no longer reachable fails early', regionStatus(sum12, values) === 'bad');

  const gt6 = { id: 'r', cells, kind: 'GT' as const, value: 6, colour: 0 };
  check('> is open while still reachable', regionStatus(gt6, values) === 'open');
  check('> passes a total that clears it', regionStatus(gt6, full) === 'ok');

  const gt8 = { id: 'r', cells, kind: 'GT' as const, value: 8, colour: 0 };
  check('> rejects a total that falls short', regionStatus(gt8, full) === 'bad');
  const gt11 = { id: 'r', cells, kind: 'GT' as const, value: 11, colour: 0 };
  check('> fails early once it is out of reach', regionStatus(gt11, values) === 'bad');

  const lt6 = { id: 'r', cells, kind: 'LT' as const, value: 6, colour: 0 };
  check('< fails the moment the total reaches it', regionStatus(lt6, full) === 'bad');
  check('< passes under the limit',
    regionStatus(lt6, new Map([['0,0', 2], ['0,1', 3]])) === 'ok');

  const equal = { id: 'r', cells, kind: 'EQUAL' as const, value: 0, colour: 0 };
  check('= rejects two different pips', regionStatus(equal, full) === 'bad');
  check('= passes a matching pair',
    regionStatus(equal, new Map([['0,0', 5], ['0,1', 5]])) === 'ok');

  const distinct = { id: 'r', cells, kind: 'DISTINCT' as const, value: 0, colour: 0 };
  check('≠ rejects a repeat',
    regionStatus(distinct, new Map([['0,0', 5], ['0,1', 5]])) === 'bad');
  check('≠ passes two different pips', regionStatus(distinct, full) === 'ok');

  // Every rule above has to be monotone, or the solver's pruning is unsound:
  // a region that reads `bad` on a partial board must never come good.
  let monotone = true;
  for (const difficulty of DIFFICULTIES) {
    const puzzle = generatePuzzle(5150, difficulty);
    for (const region of puzzle.regions) {
      const grid = cellValues(puzzle.dominoes, puzzle.solution);
      const partial = new Map<CellKey, number>();
      for (const cell of region.cells) {
        partial.set(cell, grid.get(cell) ?? 0);
        // Walking the real answer must never pass through a `bad` reading.
        if (regionStatus(region, partial) === 'bad') monotone = false;
      }
    }
  }
  check('the winning answer never reads `bad` on the way in', monotone);
}

// ─── 4. Replay the answer through the real reducer ───────────────────

console.log('\nReducer');
{
  let solved = 0;
  let early = 0;
  let total = 0;

  for (const difficulty of DIFFICULTIES) {
    for (let i = 0; i < PER_DIFFICULTY; i++) {
      total++;
      const puzzle = generatePuzzle(i * 31_337 + 5, difficulty);
      const { state, earlyWin } = replay(puzzle);
      if (state.phase === PipsPhase.SOLVED) solved++;
      if (earlyWin) early++;
    }
  }

  check('replaying the answer wins the board', solved === total, `${solved}/${total}`);
  check('the board is never declared won early', early === 0, `${early} early`);

  const puzzle = generatePuzzle(777, PipsDifficulty.MEDIUM);
  let state = createInitialPipsState(SETTINGS, 0, puzzle);

  // Off-board and overlapping drops must be refused, not quietly accepted.
  const first = puzzle.solution[0];
  const outside = pipsReducer(state, {
    type: 'PLACE', dominoId: puzzle.dominoes[0].id, anchor: '99,99', orientation: 0,
  });
  check('a drop outside the board is refused', outside === state);

  state = pipsReducer(state, {
    type: 'PLACE', dominoId: first.dominoId, anchor: first.cells[0], orientation:
      parseKey(first.cells[1])[1] - parseKey(first.cells[0])[1] === 1 ? 0
        : parseKey(first.cells[1])[0] - parseKey(first.cells[0])[0] === 1 ? 1
          : parseKey(first.cells[1])[1] - parseKey(first.cells[0])[1] === -1 ? 2 : 3,
  });
  check('a tile goes down', state.placements.length === 1);

  const other = puzzle.dominoes.find((d) => d.id !== first.dominoId)!;
  const overlap = pipsReducer(state, {
    type: 'PLACE', dominoId: other.id, anchor: first.cells[0], orientation: 0,
  });
  check('a drop onto an occupied square is refused', overlap.placements.length === 1);

  const lifted = pipsReducer(state, { type: 'LIFT', cell: first.cells[1] });
  check('lifting takes the whole tile off', lifted.placements.length === 0);
  check('lifting leaves the tile in hand', lifted.selectedId === first.dominoId);

  // A tile already down can be moved without being lifted first.
  const moved = pipsReducer(state, {
    type: 'PLACE', dominoId: first.dominoId, anchor: first.cells[0], orientation: 1,
  });
  check('a placed tile can be moved straight to a new square',
    moved.placements.length === 1);

  check('clearing empties the board',
    pipsReducer(state, { type: 'CLEAR_BOARD' }).placements.length === 0);
}

// ─── 5. Hints always finish the board ────────────────────────────────

console.log('\nHints');
{
  let finished = 0;
  let total = 0;
  for (const difficulty of DIFFICULTIES) {
    for (let i = 0; i < 8; i++) {
      total++;
      const puzzle = generatePuzzle(i * 911 + 3, difficulty);
      let state = createInitialPipsState(SETTINGS, 0, puzzle);
      for (let n = 0; n < puzzle.dominoes.length + 2; n++) {
        state = pipsReducer(state, { type: 'HINT' });
        if (state.phase === PipsPhase.SOLVED) break;
      }
      if (state.phase === PipsPhase.SOLVED) finished++;
    }
  }
  check('hints alone solve the board', finished === total, `${finished}/${total}`);

  // A hint has to clear whatever is sitting in its way, not give up.
  const puzzle = generatePuzzle(2024, PipsDifficulty.MEDIUM);
  let state = createInitialPipsState(SETTINGS, 0, puzzle);
  const wrong = puzzle.dominoes[puzzle.dominoes.length - 1];
  state = pipsReducer(state, {
    type: 'PLACE', dominoId: wrong.id, anchor: puzzle.solution[0].cells[0], orientation: 0,
  });
  const after = pipsReducer(state, { type: 'HINT' });
  check('a hint displaces a tile blocking its square', after.hintsUsed === 1 && after.placements.length >= 1);
}

// ─── 6. Levels are deterministic, and generation is quick enough ─────

console.log('\nLevels');
{
  const a = buildLevel(7, PipsDifficulty.MEDIUM);
  const b = buildLevel(7, PipsDifficulty.MEDIUM);
  check('the same puzzle number rebuilds the same board',
    JSON.stringify(a) === JSON.stringify(b));

  // The player picks the difficulty, so a puzzle number means nothing on its
  // own — it must build the difficulty it was asked for.
  check('a puzzle is built at the difficulty asked for',
    DIFFICULTIES.every((d) => buildLevel(3, d).difficulty === d));

  // Same number on two tracks must not reuse a seed, or the boards come back
  // with the same shape and it reads as a bug.
  const seeds = new Set(DIFFICULTIES.map((d) => seedForLevel(4, d)));
  check('each difficulty seeds its own board', seeds.size === DIFFICULTIES.length);

  let worst = 0;
  let total = 0;
  const RUNS = 24;
  for (let i = 0; i < RUNS; i++) {
    const started = Date.now();
    const level = buildLevel(i, DIFFICULTIES[i % DIFFICULTIES.length]);
    const took = Date.now() - started;
    total += took;
    if (took > worst) worst = took;
    if (!isSolved(level, level.solution)) check(`level ${i} is winnable`, false);
  }
  // Boards are built on the fly when a level opens, so a slow one is a visible
  // stall on a phone.
  check('a level builds well inside a second', worst < 1000, `worst ${worst}ms`);
  console.log(`      (average ${(total / RUNS).toFixed(0)}ms, worst ${worst}ms over ${RUNS} levels)`);
  check('pips never exceed a double-six tile', MAX_PIP === 6);
}

console.log(failures === 0 ? '\nAll Pips checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
