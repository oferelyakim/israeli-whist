/**
 * Picks the seed words each Word Wonders level is built from.
 *
 * Candidates arrive frequency-ranked from `scripts/wordlists/gen_data.py`; this
 * script keeps only the ones the REAL engine can turn into a good board, so a
 * shipped seed can never strand a player on an ungeneratable level.
 *
 * Run:
 *   ./node_modules/.bin/esbuild --bundle scripts/gen-wordwonders-seeds.mts \
 *     --platform=node --format=esm --outfile=/tmp/gen-seeds.mjs \
 *     --log-level=warning && node /tmp/gen-seeds.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { loadDictionary } from '../src/games/wordwonders/engine/dictionary';
import { buildLevel } from '../src/games/wordwonders/engine/level';
import type { WordLang } from '../src/games/wordwonders/types';

const MAX_SEEDS = 320;
const MIN_GRID_WORDS = 5;

// Paths resolve against the repo root: esbuild bundles this to a temp file, so
// import.meta.url points at the bundle, not at scripts/.
const ROOT = process.cwd();
const candidates = JSON.parse(
  readFileSync(`${ROOT}/scripts/wordlists/seed_candidates.json`, 'utf8'),
) as Record<WordLang, string[]>;

async function generate(lang: WordLang): Promise<string[]> {
  const dict = await loadDictionary(lang);
  const kept: string[] = [];
  let tried = 0;

  for (const seed of candidates[lang]) {
    if (kept.length >= MAX_SEEDS) break;
    tried++;
    // A seed has to work at whatever level number it lands on, and the index is
    // mixed into the generator's RNG — so check a few before trusting it.
    let ok = true;
    for (const index of [0, 1, 2, 7]) {
      const level = buildLevel(dict, seed, index);
      if (!level || level.words.length < MIN_GRID_WORDS) { ok = false; break; }
    }
    if (ok) kept.push(seed);
  }

  console.log(`${lang}: kept ${kept.length} of ${tried} candidates tried`);
  return kept;
}

function emit(lang: WordLang, seeds: string[]): void {
  const name = lang.toUpperCase();
  const body = seeds.map((s) => `  '${s}',`).join('\n');
  const file = `// GENERATED FILE — do not edit by hand.
// Built by scripts/gen-wordwonders-seeds.mts; every seed here was verified to
// produce a full board through the real engine. See CLAUDE.md.

export const ${name}_SEEDS: ReadonlyArray<string> = [
${body}
];
`;
  writeFileSync(`${ROOT}/src/games/wordwonders/data/seeds-${lang}.ts`, file, 'utf8');
}

const en = await generate('en');
const he = await generate('he');
emit('en', en);
emit('he', he);
console.log('written: seeds-en.ts, seeds-he.ts');
