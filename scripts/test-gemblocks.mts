/**
 * Regression test for Gem Blocks.
 *
 * The failure that would actually ruin a game is an unreachable goal: gems stop
 * arriving, or a clear fails to collect the gems sitting in it. So this checks
 * the clearing rules directly and then plays full games with a greedy bot to
 * confirm the goal is reachable rather than merely plausible.
 *
 * Run:
 *   ./node_modules/.bin/esbuild --bundle scripts/test-gemblocks.mts \
 *     --platform=node --format=esm --outfile=/tmp/test-gb.mjs \
 *     --log-level=warning && node /tmp/test-gb.mjs
 */
import {
  BOARD_SIZE,
  GEM_GOAL,
  canPlace,
  countGems,
  createEmptyGrid,
  findCompletedLines,
  hasAnyPlacement,
  makeOffer,
  placeAndClear,
  placementsFor,
} from '../src/games/gemblocks/engine/board';
import { PIECE_CATALOGUE } from '../src/games/gemblocks/engine/pieces';
import {
  createInitialGemState,
  gemBlocksReducer,
} from '../src/games/gemblocks/engine/game-reducer';
import { GemPhase } from '../src/games/gemblocks/types';
import type { GemBlocksGameState, GemBlocksSettings } from '../src/games/gemblocks/types';
import { GameType, PlayerType } from '../src/types/game-common';

let failures = 0;
function check(label: string, ok: boolean, detail = ''): void {
  if (ok) console.log(`  ✓ ${label}`);
  else { failures++; console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); }
}

const SETTINGS: GemBlocksSettings = {
  gameType: GameType.GEM_BLOCKS,
  numPlayers: 1,
  playerNames: ['Tester'],
  playerTypes: [PlayerType.HUMAN],
};

// ─── 1. The shape catalogue ──────────────────────────────────────────

console.log('\nShapes');
{
  const seen = new Set<string>();
  let dupes = 0;
  let detached = 0;
  let unnormalised = 0;

  for (const piece of PIECE_CATALOGUE) {
    if (seen.has(piece.id)) dupes++;
    seen.add(piece.id);

    // Every shape must touch its own top-left origin, or placement maths drifts.
    const minR = Math.min(...piece.cells.map(([r]) => r));
    const minC = Math.min(...piece.cells.map(([, c]) => c));
    if (minR !== 0 || minC !== 0) unnormalised++;

    // Every shape must be one connected piece (no diagonal-only links).
    const keys = new Set(piece.cells.map(([r, c]) => `${r},${c}`));
    const queue = [piece.cells[0]];
    const found = new Set([`${piece.cells[0][0]},${piece.cells[0][1]}`]);
    while (queue.length) {
      const [r, c] = queue.pop()!;
      for (const [nr, nc] of [[r + 1, c], [r - 1, c], [r, c + 1], [r, c - 1]]) {
        const k = `${nr},${nc}`;
        if (keys.has(k) && !found.has(k)) { found.add(k); queue.push([nr, nc]); }
      }
    }
    if (found.size !== piece.cells.length) detached++;
  }

  check(`${PIECE_CATALOGUE.length} shapes, all ids unique`, dupes === 0, `${dupes} duplicated`);
  check('every shape is anchored at its top-left', unnormalised === 0, `${unnormalised} adrift`);
  check('every shape is orthogonally connected', detached === 0, `${detached} detached`);
  check('no shape is larger than the board',
    PIECE_CATALOGUE.every((p) => placementsFor(createEmptyGrid(), p).length > 0));
}

// ─── 2. Clearing rules ───────────────────────────────────────────────

console.log('\nClearing');
{
  // A row one cell short of full, with a gem waiting in the gap.
  const board = createEmptyGrid();
  for (let c = 0; c < BOARD_SIZE - 1; c++) board[4][c] = true;
  const gems = createEmptyGrid();
  gems[4][0] = true;
  gems[4][8] = true;

  const before = findCompletedLines(board);
  check('an incomplete row is not a line', before.rows.length === 0);

  const result = placeAndClear(
    board, gems,
    { key: 'k', piece: { id: 'i1', cells: [[0, 0]] }, gemIndex: null },
    4, 8,
  );
  check('completing a row clears it', result.board[4].every((cell) => !cell));
  check('gems in the cleared row are collected', result.clear.gems === 2, `got ${result.clear.gems}`);
  check('collected gems leave the board', countGems(result.gems) === 0);

  // A gem riding the piece that completes the line is collected in that move.
  const board2 = createEmptyGrid();
  for (let c = 0; c < BOARD_SIZE - 1; c++) board2[0][c] = true;
  const carried = placeAndClear(
    board2, createEmptyGrid(),
    { key: 'k', piece: { id: 'i1', cells: [[0, 0]] }, gemIndex: 0 },
    0, 8,
  );
  check('a gem delivered by the clearing piece counts', carried.clear.gems === 1);

  // A full 3x3 box clears too.
  const board3 = createEmptyGrid();
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) if (!(r === 2 && c === 2)) board3[r][c] = true;
  const gems3 = createEmptyGrid();
  gems3[1][1] = true;
  const boxed = placeAndClear(
    board3, gems3,
    { key: 'k', piece: { id: 'i1', cells: [[0, 0]] }, gemIndex: null },
    2, 2,
  );
  check('completing a 3x3 box clears it', boxed.clear.boxes.length === 1);
  check('gems in a cleared box are collected', boxed.clear.gems === 1);

  // Placing without completing anything leaves the board alone.
  const quiet = placeAndClear(
    createEmptyGrid(), createEmptyGrid(),
    { key: 'k', piece: { id: 'i1', cells: [[0, 0]] }, gemIndex: null },
    5, 5,
  );
  check('a placement that completes nothing clears nothing',
    quiet.clear.cells.length === 0 && quiet.board[5][5]);
}

// ─── 3. Gem supply keeps coming ──────────────────────────────────────

console.log('\nGem supply');
{
  // Gems must keep being offered until enough have been handed out to finish,
  // regardless of how many are stranded on the board.
  let seed = 12345;
  let serial = 0;
  let handedOut = 0;
  for (let batch = 0; batch < 60 && handedOut < GEM_GOAL; batch++) {
    const offer = makeOffer(seed, 0, GEM_GOAL, serial);
    handedOut += offer.offered.filter((o) => o.gemIndex !== null).length;
    seed = offer.nextSeed;
    serial = offer.nextSerial;
  }
  check('supply reaches the goal even with nothing collected', handedOut >= GEM_GOAL, `${handedOut} handed out`);

  const satisfied = makeOffer(999, GEM_GOAL, GEM_GOAL, 0);
  check('no more gems once the goal is met',
    satisfied.offered.every((o) => o.gemIndex === null));

  const capped = makeOffer(777, 0, GEM_GOAL, 0);
  check('at most two gems ride one tray',
    capped.offered.filter((o) => o.gemIndex !== null).length <= 2);

  const keys = new Set(capped.offered.map((o) => o.key));
  check('offered pieces get distinct keys', keys.size === 3);
}

// ─── 4. Play whole games with a greedy bot ───────────────────────────

/** Scores a candidate move: clearing is good, collecting gems is better. */
function scoreMove(state: GemBlocksGameState, index: number, row: number, col: number): number {
  const offer = state.offered[index]!;
  const result = placeAndClear(state.board, state.gems, offer, row, col);
  const lines = result.clear.rows.length + result.clear.cols.length + result.clear.boxes.length;
  let occupied = 0;
  for (const r of result.board) for (const cell of r) if (cell) occupied++;
  return result.clear.gems * 1000 + lines * 60 - occupied;
}

function playGame(seed: number): GemBlocksGameState {
  let state = createInitialGemState(SETTINGS, seed);
  for (let turn = 0; turn < 600 && state.phase === GemPhase.PLAYING; turn++) {
    let best: { index: number; row: number; col: number; score: number } | null = null;
    for (let index = 0; index < state.offered.length; index++) {
      const offer = state.offered[index];
      if (!offer) continue;
      for (const [row, col] of placementsFor(state.board, offer.piece)) {
        const score = scoreMove(state, index, row, col);
        if (!best || score > best.score) best = { index, row, col, score };
      }
    }
    if (!best) break;
    state = gemBlocksReducer(state, { type: 'PLACE_PIECE', index: best.index, row: best.row, col: best.col });
  }
  return state;
}

console.log('\nFull games (greedy bot, 40 seeds)');
{
  let won = 0;
  let lost = 0;
  let stalled = 0;
  let totalMoves = 0;
  for (let i = 0; i < 40; i++) {
    const end = playGame(i * 7919 + 101);
    if (end.phase === GemPhase.WON) { won++; totalMoves += end.moves; }
    else if (end.phase === GemPhase.GAME_OVER) lost++;
    else stalled++;
  }
  check('every game reaches a real ending', stalled === 0, `${stalled} stalled mid-game`);
  check('the goal is reachable', won > 0, `${won} wins, ${lost} losses`);
  // A competent player should nearly always get there; if this drops the gem
  // supply or the clearing rules have regressed.
  check('a greedy player wins at least 3 games in 4', won >= 30, `${won}/40 won`);
  console.log(`      (${won} won, ${lost} lost of 40)`);
  if (won > 0) console.log(`      (average ${(totalMoves / won).toFixed(1)} moves per win)`);
}

// ─── 5. Reducer rules ────────────────────────────────────────────────

console.log('\nReducer rules');
{
  const start = createInitialGemState(SETTINGS, 4242);
  check('board starts empty', start.board.every((r) => r.every((c) => !c)));
  check('the opening board is seeded with gems', countGems(start.gems) === 4, `${countGems(start.gems)}`);
  check('three shapes are offered', start.offered.filter(Boolean).length === 3);
  check('a fresh board has a legal move', hasAnyPlacement(start.board, start.offered));

  const picked = gemBlocksReducer(start, { type: 'SELECT_PIECE', index: 0 });
  check('a shape can be selected', picked.selectedIndex === 0);

  const offer = start.offered[0]!;
  const spot = placementsFor(start.board, offer.piece)[0];
  const placed = gemBlocksReducer(picked, { type: 'PLACE_PIECE', index: 0, row: spot[0], col: spot[1] });
  check('placing consumes the shape', placed.offered[0] === null);
  check('placing counts a move', placed.moves === 1);

  // Dropping onto occupied squares must be refused, not silently allowed.
  const blocked = gemBlocksReducer(placed, { type: 'PLACE_PIECE', index: 1, row: spot[0], col: spot[1] });
  const overlaps = !canPlace(placed.board, placed.offered[1]!.piece, spot[0], spot[1]);
  check('an overlapping placement is refused', !overlaps || blocked === placed);

  // The tray only refills once all three have gone.
  let s = placed;
  for (let i = 1; i < 3; i++) {
    const o = s.offered[i];
    if (!o) continue;
    const at = placementsFor(s.board, o.piece)[0];
    const mid = gemBlocksReducer(s, { type: 'PLACE_PIECE', index: i, row: at[0], col: at[1] });
    if (i < 2) check(`tray is not refilled after ${i + 1} of 3`, mid.offered.filter(Boolean).length === 2 - i);
    s = mid;
  }
  check('tray refills once all three are used', s.offered.filter(Boolean).length === 3);
}

console.log(failures === 0 ? '\nAll Gem Blocks checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
