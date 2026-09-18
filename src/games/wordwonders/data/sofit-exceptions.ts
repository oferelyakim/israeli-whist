// GENERATED FILE — do not edit by hand.
// Split out of words-he.ts on purpose: hebrew.ts needs this set eagerly, and
// importing it from the big word-list module would pull the whole Hebrew
// dictionary into the main chunk instead of letting it load on demand.

/** Loanwords that really do end in a non-final letter, so the sofit rule
 *  (final כמנפצ -> ךםןףץ) must not be applied to them. */
export const HE_NO_SOFIT: ReadonlySet<string> = new Set(["ומכ", "טיפ", "טלסקופ", "טרמפ", "לפטופ", "סטנדאפ", "סירופ", "סקופ", "פופ", "פלופ", "קטשופ", "קליפ", "קרפ"]);
