import { createRNG } from '../../../utils/random';
import { toPlain } from '../../wordwonders/engine/hebrew';
import { CELLS, COLS } from './grid';
import { packPaths } from './packer';
import type { PlacedWord, StrandsLang, StrandsLevel, StrandsTheme } from '../types';
import { ROWS } from './grid';

/** Word lengths a board will ask for, per language. */
const LIMITS: Readonly<Record<StrandsLang, { min: number; max: number; maxWords: number }>> = {
  en: { min: 4, max: 9, maxWords: 9 },
  he: { min: 3, max: 8, maxWords: 12 },
};

function shuffle<T>(items: T[], rng: () => number): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * The spelling the grid stores.
 *
 * Spaces come out — a spangram like "FRUIT SALAD" is one run of cells — and
 * Hebrew folds its final letters back, because a cell holds one glyph and the
 * same letter may end this word while sitting mid-word in the player's head.
 */
export function gridKey(lang: StrandsLang, text: string): string {
  const closed = text.replace(/\s+/g, '');
  return lang === 'he' ? toPlain(closed) : closed.toUpperCase();
}

interface Candidate {
  key: string;
  display: string;
}

/**
 * Picks words whose lengths total `target` exactly.
 *
 * Randomised so the same theme gives a different board each time, and capped
 * at `maxWords` so an English board does not end up with a dozen four-letter
 * entries.
 */
function pickSubset(
  rng: () => number,
  pool: readonly Candidate[],
  target: number,
  maxWords: number,
): Candidate[] | null {
  const order = shuffle(pool.map((_, i) => i), rng);
  const chosen: number[] = [];
  let sum = 0;
  let steps = 20_000;

  function search(at: number): boolean {
    if (sum === target) return true;
    if (steps-- <= 0 || at >= order.length || sum > target) return false;
    if (chosen.length >= maxWords) return false;

    const index = order[at];
    const length = pool[index].key.length;
    if (sum + length <= target) {
      chosen.push(index);
      sum += length;
      if (search(at + 1)) return true;
      chosen.pop();
      sum -= length;
    }
    return search(at + 1);
  }

  if (!search(0)) return null;
  return chosen.map((i) => pool[i]);
}

function seedFor(index: number, attempt: number): number {
  let hash = (2166136261 ^ (index * 131 + attempt + 1)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 16777619) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507) >>> 0;
  return (hash >>> 1) % 2147483647;
}

/**
 * Builds the board for a level.
 *
 * There are two ways an attempt can come to nothing — no subset of the theme's
 * words totals the free cells, or the lengths that do cannot be carved into the
 * grid — and both are cheap, so it simply tries again with a different subset
 * rather than trying to be clever about which lengths pack well.
 */
export function buildLevel(
  lang: StrandsLang,
  themes: readonly StrandsTheme[],
  index: number,
): StrandsLevel | null {
  if (themes.length === 0) return null;
  const theme = themes[index % themes.length];
  const limits = LIMITS[lang];

  const spangramKey = gridKey(lang, theme.spangram);
  if (spangramKey.length < COLS || spangramKey.length > CELLS - limits.min) return null;

  const pool: Candidate[] = [];
  const seen = new Set<string>();
  for (const word of theme.words) {
    const key = gridKey(lang, word);
    if (key.length < limits.min || key.length > limits.max) continue;
    if (key === spangramKey || seen.has(key)) continue;
    seen.add(key);
    pool.push({ key, display: word });
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    const rng = createRNG(seedFor(index, attempt));
    const subset = pickSubset(rng, pool, CELLS - spangramKey.length, limits.maxWords);
    if (!subset) continue;

    const packed = packPaths(rng, [spangramKey.length, ...subset.map((c) => c.key.length)]);
    if (!packed) continue;

    // Only the spangram's path is fixed; the rest come back in search order, so
    // words are matched to paths by length.
    const spare = new Map<number, number[][]>();
    packed.paths.slice(1).forEach((path) => {
      const bucket = spare.get(path.length);
      if (bucket) bucket.push(path);
      else spare.set(path.length, [path]);
    });

    const words: PlacedWord[] = [{
      word: spangramKey,
      display: theme.spangram,
      path: packed.paths[0],
      spangram: true,
    }];

    let complete = true;
    for (const candidate of subset) {
      const bucket = spare.get(candidate.key.length);
      const path = bucket?.pop();
      if (!path) { complete = false; break; }
      words.push({ word: candidate.key, display: candidate.display, path, spangram: false });
    }
    if (!complete) continue;

    // No crossings in this game, so letters never have to agree: any word can
    // be written along any path of its length.
    const letters = new Array<string>(CELLS).fill('');
    for (const placed of words) {
      placed.path.forEach((cell, i) => { letters[cell] = placed.word[i]; });
    }
    if (letters.some((letter) => letter === '')) continue;

    return {
      lang,
      index,
      themeId: theme.id,
      clue: theme.clue,
      rows: ROWS,
      cols: COLS,
      letters,
      words,
    };
  }
  return null;
}
