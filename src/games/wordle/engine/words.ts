import { createRNG } from '../../../utils/random';
import { loadDictionary } from '../../wordwonders/engine/dictionary';
import { toPlain } from '../../wordwonders/engine/hebrew';
import { WORD_LENGTH } from '../types';
import type { WordleLang } from '../types';

export interface WordleWords {
  lang: WordleLang;
  /** Words that can be the answer: the common tier only, so nothing unfair. */
  answers: string[];
  /** Everything accepted as a guess — far wider than the answer list. */
  isGuess: (word: string) => boolean;
  /** How a grid spelling is read (restores Hebrew final letters). */
  display: (word: string) => string;
}

const cache = new Map<WordleLang, WordleWords>();
const inFlight = new Map<WordleLang, Promise<WordleWords>>();

export async function loadWords(lang: WordleLang): Promise<WordleWords> {
  const cached = cache.get(lang);
  if (cached) return cached;
  const pending = inFlight.get(lang);
  if (pending) return pending;

  const promise = (async () => {
    const dict = await loadDictionary(lang);
    const right = (word: string) => word.length === WORD_LENGTH;

    const guesses = new Set([...dict.all].filter(right));

    // English answers come straight from the common tier, which lands on
    // exactly the right register. Hebrew cannot: its list is a spell-checker
    // lexicon full of inflections and proper nouns, so its answers are
    // curated. See data/answers-he.ts for why heuristics do not work there.
    let answers: string[];
    if (lang === 'he') {
      const curated = await import('../data/answers-he');
      answers = curated.HE_ANSWERS.split(' ').filter((word) => guesses.has(word));
    } else {
      // Names and brands clear the frequency bar easily, so they are barred
      // from being the answer while staying valid guesses.
      const barred = await import('../data/not-answers-en');
      answers = [...dict.grid]
        .filter((word) => right(word) && !barred.EN_NOT_ANSWERS.has(word))
        .sort();
    }

    if (lang === 'en') {
      // The frequency filter that keeps answers fair would also reject
      // perfectly good guesses, so guesses draw on the unfiltered list.
      const extra = await import('../data/guesses-en');
      for (const word of extra.EN_GUESSES_5.split(' ')) guesses.add(word.toUpperCase());
    }

    const words: WordleWords = {
      lang,
      answers,
      isGuess: (word) => guesses.has(word),
      display: dict.display,
    };
    cache.set(lang, words);
    inFlight.delete(lang);
    return words;
  })();

  inFlight.set(lang, promise);
  return promise;
}

/** Folds a typed letter to the form the grid stores. */
export function normaliseLetter(lang: WordleLang, letter: string): string {
  return lang === 'he' ? toPlain(letter) : letter.toUpperCase();
}

// ─── The daily word ──────────────────────────────────────────────────

/** Local midnight of the day numbering starts from. */
const EPOCH = new Date(2026, 0, 1).getTime();

/**
 * Days since the epoch, by the device's OWN calendar.
 *
 * Local rather than UTC so the word turns over at the player's midnight, not
 * at 2am. Rounding absorbs the hour that daylight saving adds or removes.
 */
export function dayNumber(at: Date = new Date()): number {
  const midnight = new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  return Math.round((midnight - EPOCH) / 86_400_000);
}

const ORDER_SEED: Readonly<Record<WordleLang, number>> = { en: 19_700_101, he: 20_260_101 };
const orders = new Map<string, string[]>();

/**
 * The answer list in a fixed, shuffled order.
 *
 * Hashing the day straight to an index looked fine but repeated words inside a
 * month — with a few hundred answers, collisions are common. Walking a shuffled
 * list instead gives no repeat at all until every word has been used, while
 * consecutive days stay unrelated because the order is shuffled, not alphabetical.
 */
function dailyOrder(answers: readonly string[], lang: WordleLang): string[] {
  const key = `${lang}:${answers.length}`;
  const cached = orders.get(key);
  if (cached) return cached;

  const out = [...answers];
  const rng = createRNG(ORDER_SEED[lang]);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  orders.set(key, out);
  return out;
}

export function dailyAnswer(answers: readonly string[], day: number, lang: WordleLang): string {
  const order = dailyOrder(answers, lang);
  // A device whose clock sits before the epoch still has to get a word.
  return order[((day % order.length) + order.length) % order.length];
}
