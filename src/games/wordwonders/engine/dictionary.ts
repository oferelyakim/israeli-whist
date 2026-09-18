import type { WordLang } from '../types';
import { toDisplay } from './hebrew';

/**
 * A loaded language dictionary.
 *
 * `grid` holds the words common enough for the crossword to demand; `all` also
 * holds the rarer ones, which count only as bonus finds. `bySignature` maps a
 * word's sorted letters to its words, which is how a letter set is turned into
 * every word it can spell.
 */
export interface Dictionary {
  lang: WordLang;
  all: ReadonlySet<string>;
  grid: ReadonlySet<string>;
  bySignature: ReadonlyMap<string, string[]>;
  /** The spelling shown to the player for a grid key. */
  display: (key: string) => string;
}

function signature(word: string): string {
  return [...word].sort().join('');
}

function build(lang: WordLang, blob: string, gridCount: number): Dictionary {
  const words = blob.split(' ');
  const all = new Set(words);
  const grid = new Set(words.slice(0, gridCount));

  const bySignature = new Map<string, string[]>();
  for (const w of words) {
    const sig = signature(w);
    const bucket = bySignature.get(sig);
    if (bucket) bucket.push(w);
    else bySignature.set(sig, [w]);
  }

  return {
    lang,
    all,
    grid,
    bySignature,
    display: lang === 'he' ? toDisplay : (key: string) => key,
  };
}

const cache = new Map<WordLang, Dictionary>();
const inFlight = new Map<WordLang, Promise<Dictionary>>();

/**
 * Dictionaries are split out of the main bundle and fetched per language — a
 * player who never opens the Hebrew boards never downloads the Hebrew list.
 * The built chunks are `.js`, so the service worker precaches them and the game
 * still works offline.
 */
export async function loadDictionary(lang: WordLang): Promise<Dictionary> {
  const cached = cache.get(lang);
  if (cached) return cached;

  const pending = inFlight.get(lang);
  if (pending) return pending;

  const promise = (async () => {
    // Each branch imports its own module so TypeScript keeps the two module
    // shapes apart instead of unioning them.
    let dict: Dictionary;
    if (lang === 'en') {
      const mod = await import('../data/words-en');
      dict = build('en', mod.EN_WORDS, mod.EN_GRID_COUNT);
    } else {
      const mod = await import('../data/words-he');
      dict = build('he', mod.HE_WORDS, mod.HE_GRID_COUNT);
    }
    cache.set(lang, dict);
    inFlight.delete(lang);
    return dict;
  })();

  inFlight.set(lang, promise);
  return promise;
}

export function peekDictionary(lang: WordLang): Dictionary | null {
  return cache.get(lang) ?? null;
}

/** Distinct combinations of `letters` taken `size` at a time, as signatures. */
function combinationSignatures(sorted: string[], size: number): string[] {
  const out: string[] = [];
  const pick: string[] = [];
  const walk = (start: number) => {
    if (pick.length === size) {
      out.push(pick.join(''));
      return;
    }
    for (let i = start; i < sorted.length; i++) {
      // `sorted` may repeat a letter; only take the first of each run at a
      // given depth or the same combination is produced many times over.
      if (i > start && sorted[i] === sorted[i - 1]) continue;
      pick.push(sorted[i]);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return out;
}

/** Every dictionary word spellable from `letters`, each tile used at most once. */
export function wordsFromLetters(
  dict: Dictionary,
  letters: readonly string[],
  minLength = 3,
): string[] {
  const sorted = [...letters].sort();
  const found = new Set<string>();
  for (let n = minLength; n <= sorted.length; n++) {
    for (const sig of combinationSignatures(sorted, n)) {
      const bucket = dict.bySignature.get(sig);
      if (bucket) for (const w of bucket) found.add(w);
    }
  }
  return [...found];
}
