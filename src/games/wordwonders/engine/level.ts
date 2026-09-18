import { createRNG } from '../../../utils/random';
import type { Dictionary } from './dictionary';
import { wordsFromLetters } from './dictionary';
import { packWords } from './packer';
import type { PlacedWord, WordLevel } from '../types';

/** How many words a board asks for. Short seeds simply cannot support eight. */
function targetWordCount(seedLength: number): number {
  if (seedLength <= 4) return 5;
  if (seedLength === 5) return 6;
  return 7;
}

function hashSeed(text: string, index: number): number {
  let h = 2166136261 ^ index;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Builds the crossword for one level.
 *
 * Only grid-tier (common) words are eligible, so a board never demands a word
 * the player has no chance of knowing — the rarer half of the dictionary still
 * counts, but only as bonus finds.
 *
 * Deterministic in (seed, index): the same level always regenerates identically,
 * which is what lets progress be stored as nothing but a level number.
 */
export function buildLevel(
  dict: Dictionary,
  seed: string,
  index: number,
): WordLevel | null {
  const letters = [...seed];
  const rngSeed = hashSeed(seed, index);

  const pool = wordsFromLetters(dict, letters).filter((w) => dict.grid.has(w));
  const full = pool.filter((w) => w.length === letters.length);
  if (full.length === 0) return null;

  const rest = pool.filter((w) => w.length < letters.length);
  const want = targetWordCount(letters.length);
  if (rest.length + 1 < want) return null;

  for (let attempt = 0; attempt < 16; attempt++) {
    const rng = createRNG(rngSeed + attempt * 104729);
    // Always lead with a word that uses every letter, then bias toward longer
    // words so the board interlocks instead of sprawling.
    const lead = full[Math.floor(rng() * full.length)];
    const others = shuffle(rest, rng)
      .sort((a, b) => b.length - a.length)
      .slice(0, want - 1);
    const chosen = [lead, ...others];
    if (chosen.length < want) continue;

    const packed = packWords(chosen, rngSeed + attempt);
    if (!packed) continue;

    const words: PlacedWord[] = packed.placements.map((p, id) => ({
      id,
      key: p.word,
      display: dict.display(p.word),
      row: p.row,
      col: p.col,
      horiz: p.horiz,
    }));

    return {
      lang: dict.lang,
      index,
      seed,
      seedDisplay: dict.display(seed),
      letters,
      rows: packed.rows,
      cols: packed.cols,
      words,
    };
  }
  return null;
}

/** Picks the seed for a level number, cycling once the list runs out. */
export function seedForLevel(seeds: readonly string[], index: number): string {
  return seeds[index % seeds.length];
}
