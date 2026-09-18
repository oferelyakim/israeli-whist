import { HE_NO_SOFIT } from '../data/sofit-exceptions';

/**
 * Hebrew final-letter (sofit) handling.
 *
 * Five letters have a second glyph used only at the end of a word. A crossword
 * cell can be the last letter of the across word and a middle letter of the
 * down word at once, and only one glyph fits there — so the grid stores the
 * NON-FINAL form everywhere (this is also how printed Hebrew crosswords are
 * set), and the final form is restored for anything the player reads as a word.
 */
const TO_PLAIN: Readonly<Record<string, string>> = {
  'ך': 'כ', // ך -> כ
  'ם': 'מ', // ם -> מ
  'ן': 'נ', // ן -> נ
  'ף': 'פ', // ף -> פ
  'ץ': 'צ', // ץ -> צ
};

const TO_FINAL: Readonly<Record<string, string>> = {
  'כ': 'ך',
  'מ': 'ם',
  'נ': 'ן',
  'פ': 'ף',
  'צ': 'ץ',
};

/** Grid/match key: every final glyph folded back to its ordinary form. */
export function toPlain(word: string): string {
  let out = '';
  for (const ch of word) out += TO_PLAIN[ch] ?? ch;
  return out;
}

/**
 * The spelling a player reads. Derived by rule rather than a lookup table: a
 * Hebrew word ending in one of the five letters is written with the final form,
 * apart from a handful of loanwords (קליפ, לפטופ, טרמפ …) listed in HE_NO_SOFIT.
 */
export function toDisplay(key: string): string {
  if (key.length === 0 || HE_NO_SOFIT.has(key)) return key;
  const last = key[key.length - 1];
  const final = TO_FINAL[last];
  return final ? key.slice(0, -1) + final : key;
}
