export enum Suit {
  CLUBS = 'CLUBS',
  DIAMONDS = 'DIAMONDS',
  HEARTS = 'HEARTS',
  SPADES = 'SPADES',
  JOKER_RED = 'JOKER_RED',
  JOKER_BLACK = 'JOKER_BLACK',
}

/** The 4 standard suits (no jokers) — used by Whist and for standard deck iteration */
export const STANDARD_SUITS = [Suit.CLUBS, Suit.DIAMONDS, Suit.HEARTS, Suit.SPADES] as const;
/** Backward-compat alias */
export const SUITS = STANDARD_SUITS;
export const JOKER_SUITS = [Suit.JOKER_RED, Suit.JOKER_BLACK] as const;

/** Type for only the 4 standard suits (no jokers) — used by Whist and standard deck code */
export type StandardSuit = typeof STANDARD_SUITS[number];

export enum Rank {
  JOKER = 0,
  TWO = 2,
  THREE = 3,
  FOUR = 4,
  FIVE = 5,
  SIX = 6,
  SEVEN = 7,
  EIGHT = 8,
  NINE = 9,
  TEN = 10,
  JACK = 11,
  QUEEN = 12,
  KING = 13,
  ACE = 14,
}

/** The 13 standard ranks (no joker) — used by Whist and for standard deck iteration */
export const RANKS = [
  Rank.TWO, Rank.THREE, Rank.FOUR, Rank.FIVE, Rank.SIX,
  Rank.SEVEN, Rank.EIGHT, Rank.NINE, Rank.TEN,
  Rank.JACK, Rank.QUEEN, Rank.KING, Rank.ACE,
] as const;

export interface Card {
  suit: Suit;
  rank: Rank;
}

export type CardKey = `${Suit}_${Rank}`;

export function cardKey(card: Card): CardKey {
  return `${card.suit}_${card.rank}`;
}

export function parseCardKey(key: CardKey): Card {
  const lastUnderscore = key.lastIndexOf('_');
  const suit = key.substring(0, lastUnderscore) as Suit;
  const rank = Number(key.substring(lastUnderscore + 1)) as Rank;
  return { suit, rank };
}

export function cardEquals(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export function isJoker(card: Card): boolean {
  return card.suit === Suit.JOKER_RED || card.suit === Suit.JOKER_BLACK;
}

export const SUIT_SYMBOLS: Record<Suit, string> = {
  [Suit.SPADES]: '\u2660',
  [Suit.HEARTS]: '\u2665',
  [Suit.DIAMONDS]: '\u2666',
  [Suit.CLUBS]: '\u2663',
  [Suit.JOKER_RED]: '\u2605',
  [Suit.JOKER_BLACK]: '\u2606',
};

export const SUIT_NAMES: Record<Suit, string> = {
  [Suit.SPADES]: 'Spades',
  [Suit.HEARTS]: 'Hearts',
  [Suit.DIAMONDS]: 'Diamonds',
  [Suit.CLUBS]: 'Clubs',
  [Suit.JOKER_RED]: 'Joker',
  [Suit.JOKER_BLACK]: 'Joker',
};

export const RANK_NAMES: Record<Rank, string> = {
  [Rank.JOKER]: '\u2605',
  [Rank.TWO]: '2',
  [Rank.THREE]: '3',
  [Rank.FOUR]: '4',
  [Rank.FIVE]: '5',
  [Rank.SIX]: '6',
  [Rank.SEVEN]: '7',
  [Rank.EIGHT]: '8',
  [Rank.NINE]: '9',
  [Rank.TEN]: '10',
  [Rank.JACK]: 'J',
  [Rank.QUEEN]: 'Q',
  [Rank.KING]: 'K',
  [Rank.ACE]: 'A',
};

export function isRedSuit(suit: Suit): boolean {
  return suit === Suit.HEARTS || suit === Suit.DIAMONDS || suit === Suit.JOKER_RED;
}
