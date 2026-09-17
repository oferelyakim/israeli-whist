/**
 * Regression test for Mahjong Solitaire board generation.
 *
 * The dealer claims every board is winnable. This replays the line it built the
 * board around through the REAL reducer (TAP_TILE actions), so a bug in the
 * free-tile topology, the match rule, or the reducer fails here — not in front
 * of a player who cannot finish a board.
 *
 * Run:
 *   ./node_modules/.bin/esbuild --bundle scripts/test-mahjong-solvable.mts \
 *     --platform=node --format=esm --outfile=/tmp/test-mahjong.mjs \
 *     --log-level=warning && node /tmp/test-mahjong.mjs
 */
import { MAHJONG_LAYOUTS, MAHJONG_LAYOUT_IDS, validateLayouts } from '../src/games/mahjong/engine/layouts';
import { generateSolvableDeal, reshuffleRemaining } from '../src/games/mahjong/engine/deal';
import { availableMatches, freeTileIds } from '../src/games/mahjong/engine/board';
import { TOTAL_TILES, buildTilePairs } from '../src/games/mahjong/engine/tiles';
import { mahjongReducer, createInitialMahjongState } from '../src/games/mahjong/engine/game-reducer';
import { MahjongPhase, MahjongSuit } from '../src/games/mahjong/types';
import type { MahjongGameSettings, MahjongLayoutId } from '../src/games/mahjong/types';
import { GameType, PlayerType } from '../src/types/game-common';

let failures = 0;

function check(label: string, condition: boolean, detail = ''): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const SETTINGS: MahjongGameSettings = {
  gameType: GameType.MAHJONG,
  numPlayers: 1,
  playerNames: ['Tester'],
  playerTypes: [PlayerType.HUMAN],
};

// ─── 1. Tile set ─────────────────────────────────────────────────────

console.log('\nTile set');
const pairs = buildTilePairs();
const allTiles = pairs.flat();
check('144 tiles in 72 pairs', allTiles.length === TOTAL_TILES && pairs.length === TOTAL_TILES / 2,
  `got ${allTiles.length} tiles / ${pairs.length} pairs`);
check('every tile id is unique', new Set(allTiles.map((t) => t.id)).size === allTiles.length);
check('every pair matches', pairs.every(([a, b]) => a.matchKey === b.matchKey));
check('every matchKey has an even count',
  [...allTiles.reduce((m, t) => m.set(t.matchKey, (m.get(t.matchKey) ?? 0) + 1), new Map<string, number>()).values()]
    .every((n) => n % 2 === 0));
check('all four flowers share one matchKey',
  new Set(allTiles.filter((t) => t.suit === MahjongSuit.FLOWER).map((t) => t.matchKey)).size === 1);
check('all four seasons share one matchKey',
  new Set(allTiles.filter((t) => t.suit === MahjongSuit.SEASON).map((t) => t.matchKey)).size === 1);

// Flowers and seasons are the ONLY families where different faces match. Any
// other matchKey collision would let the board accept a visibly wrong pair.
{
  const facesPerKey = new Map<string, Set<string>>();
  for (const tile of allTiles) {
    const faces = facesPerKey.get(tile.matchKey) ?? new Set<string>();
    faces.add(`${tile.suit}-${tile.value}`);
    facesPerKey.set(tile.matchKey, faces);
  }
  const grouped = [...facesPerKey.entries()].filter(([, faces]) => faces.size > 1).map(([key]) => key).sort();
  check('only FLOWER and SEASON group distinct faces',
    JSON.stringify(grouped) === JSON.stringify(['FLOWER', 'SEASON']), `grouped keys: ${grouped.join(', ')}`);
}

// ─── 2. Layouts ──────────────────────────────────────────────────────

console.log('\nLayouts');
const problems = validateLayouts();
check('all layouts validate', problems.length === 0, JSON.stringify(problems));
for (const id of MAHJONG_LAYOUT_IDS) {
  const layout = MAHJONG_LAYOUTS[id];
  check(`${id}: ${TOTAL_TILES} slots`, layout.positions.length === TOTAL_TILES,
    `got ${layout.positions.length}`);
}

// ─── 3. Every deal is winnable, replayed through the reducer ─────────

const SEEDS_PER_LAYOUT = 12;

for (const layoutId of MAHJONG_LAYOUT_IDS) {
  console.log(`\n${layoutId}: replaying ${SEEDS_PER_LAYOUT} deals through the reducer`);
  const layout = MAHJONG_LAYOUTS[layoutId];
  let solvedCount = 0;
  let firstFailure = '';

  for (let seed = 1; seed <= SEEDS_PER_LAYOUT; seed++) {
    const deal = generateSolvableDeal(layout, seed * 1013);
    if (!deal.solution) {
      firstFailure = firstFailure || `seed ${seed}: dealer fell back to an unordered deal`;
      continue;
    }

    let state = mahjongReducer(
      createInitialMahjongState(SETTINGS, layoutId as MahjongLayoutId),
      { type: 'DEAL', seed: seed * 1013, layoutId: layoutId as MahjongLayoutId },
    );
    // DEAL regenerates from the same seed, so the boards are identical.
    if (state.tiles.length !== deal.tiles.length) {
      firstFailure = firstFailure || `seed ${seed}: DEAL produced a different tile count`;
      continue;
    }

    let ok = true;
    for (const [idA, idB] of deal.solution) {
      const free = freeTileIds(layout, state.tiles);
      if (!free.has(idA) || !free.has(idB)) {
        ok = false;
        firstFailure = firstFailure || `seed ${seed}: ${idA}/${idB} not both free at ${state.moves} moves`;
        break;
      }
      const before = state.tiles.length;
      state = mahjongReducer(state, { type: 'TAP_TILE', tileId: idA });
      state = mahjongReducer(state, { type: 'TAP_TILE', tileId: idB });
      if (state.tiles.length !== before - 2) {
        ok = false;
        firstFailure = firstFailure || `seed ${seed}: reducer refused pair ${idA}/${idB}`;
        break;
      }
    }

    if (ok && state.tiles.length === 0 && state.phase === MahjongPhase.WON) solvedCount++;
    else if (ok) firstFailure = firstFailure || `seed ${seed}: line ran out with ${state.tiles.length} tiles left`;
  }

  check(`${SEEDS_PER_LAYOUT}/${SEEDS_PER_LAYOUT} deals played to a cleared board`,
    solvedCount === SEEDS_PER_LAYOUT, firstFailure || `only ${solvedCount} solved`);
}

// ─── 4. Opening boards always offer a move ───────────────────────────

console.log('\nOpening positions');
for (const layoutId of MAHJONG_LAYOUT_IDS) {
  const layout = MAHJONG_LAYOUTS[layoutId];
  let worst = Number.POSITIVE_INFINITY;
  for (let seed = 1; seed <= 20; seed++) {
    const { tiles } = generateSolvableDeal(layout, seed * 31);
    worst = Math.min(worst, availableMatches(layout, tiles).length);
  }
  check(`${layoutId}: every opening has a legal match`, worst > 0, `worst opening had ${worst}`);
}

// ─── 5. Reducer rules ────────────────────────────────────────────────

console.log('\nReducer rules');
{
  const layoutId = MAHJONG_LAYOUT_IDS[0];
  const layout = MAHJONG_LAYOUTS[layoutId];
  let state = mahjongReducer(
    createInitialMahjongState(SETTINGS, layoutId),
    { type: 'DEAL', seed: 4242, layoutId },
  );

  const free = freeTileIds(layout, state.tiles);
  const blocked = state.tiles.find((p) => !free.has(p.tile.id));
  check('a covered tile exists to test with', blocked !== undefined);
  if (blocked) {
    const after = mahjongReducer(state, { type: 'TAP_TILE', tileId: blocked.tile.id });
    check('tapping a blocked tile does nothing', after.selectedId === null && after.tiles.length === state.tiles.length);
  }

  const [idA, idB] = availableMatches(layout, state.tiles)[0];
  const nonMatch = state.tiles.find(
    (p) => free.has(p.tile.id) && p.tile.id !== idA && p.tile.id !== idB
      && p.tile.matchKey !== state.tiles.find((q) => q.tile.id === idA)!.tile.matchKey,
  );

  state = mahjongReducer(state, { type: 'TAP_TILE', tileId: idA });
  check('first tap selects', state.selectedId === idA);
  if (nonMatch) {
    const moved = mahjongReducer(state, { type: 'TAP_TILE', tileId: nonMatch.tile.id });
    check('tapping a non-matching free tile moves the selection',
      moved.selectedId === nonMatch.tile.id && moved.tiles.length === state.tiles.length);
  }
  const deselected = mahjongReducer(state, { type: 'TAP_TILE', tileId: idA });
  check('tapping the selected tile deselects', deselected.selectedId === null);

  const beforeMatch = state.tiles.length;
  state = mahjongReducer(state, { type: 'TAP_TILE', tileId: idB });
  check('matching pair is removed', state.tiles.length === beforeMatch - 2 && state.moves === 1);

  const undone = mahjongReducer(state, { type: 'UNDO' });
  check('undo restores the pair', undone.tiles.length === beforeMatch && undone.moves === 0);

  const hinted = mahjongReducer(state, { type: 'HINT' });
  check('hint returns a legal pair', hinted.hintPair !== null
    && freeTileIds(layout, hinted.tiles).has(hinted.hintPair[0])
    && freeTileIds(layout, hinted.tiles).has(hinted.hintPair[1]));

  const shuffled = mahjongReducer(state, { type: 'SHUFFLE' });
  check('shuffle keeps every tile on the board', shuffled.tiles.length === state.tiles.length);
  check('shuffle leaves a legal match', availableMatches(layout, shuffled.tiles).length > 0);
  check('shuffle preserves the tile multiset',
    JSON.stringify(shuffled.tiles.map((p) => p.tile.id).sort())
      === JSON.stringify(state.tiles.map((p) => p.tile.id).sort()));

  // A shuffled board must still be finishable, not merely unstuck.
  const reshuffled = reshuffleRemaining(layout, state.tiles, 99);
  check('reshuffle fills exactly the slots it was given',
    JSON.stringify(reshuffled.map((p) => `${p.pos.layer}:${p.pos.x}:${p.pos.y}`).sort())
      === JSON.stringify(state.tiles.map((p) => `${p.pos.layer}:${p.pos.x}:${p.pos.y}`).sort()));
}

console.log(failures === 0 ? '\nAll Mahjong checks passed.\n' : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
