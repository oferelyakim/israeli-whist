import { MahjongSuit } from '../types';
import type { MahjongTile } from '../types';

/**
 * Standard 144-tile Mahjong Solitaire set:
 *   3 suits x 9 ranks x 4 copies = 108
 *   4 winds x 4 copies           =  16
 *   3 dragons x 4 copies         =  12
 *   4 flowers (one each)         =   4
 *   4 seasons (one each)         =   4
 */
export const TOTAL_TILES = 144;
export const TOTAL_PAIRS = TOTAL_TILES / 2;

const SUITED: MahjongSuit[] = [MahjongSuit.CHARACTERS, MahjongSuit.BAMBOO, MahjongSuit.CIRCLES];

export function matchKeyFor(suit: MahjongSuit, value: number): string {
  // Every flower matches every other flower; likewise for seasons.
  if (suit === MahjongSuit.FLOWER) return 'FLOWER';
  if (suit === MahjongSuit.SEASON) return 'SEASON';
  return `${suit}-${value}`;
}

export function tilesMatch(a: MahjongTile, b: MahjongTile): boolean {
  return a.id !== b.id && a.matchKey === b.matchKey;
}

/**
 * Builds the full set already grouped into 72 removable pairs. Grouping here
 * (rather than shuffling loose tiles) is what lets the dealer hand a matching
 * pair to a matching pair of free positions.
 */
export function buildTilePairs(): [MahjongTile, MahjongTile][] {
  const pairs: [MahjongTile, MahjongTile][] = [];
  let serial = 0;

  const make = (suit: MahjongSuit, value: number): MahjongTile => ({
    id: `t${serial++}`,
    suit,
    value,
    matchKey: matchKeyFor(suit, value),
  });

  const addCopies = (suit: MahjongSuit, value: number, copies: number) => {
    for (let i = 0; i < copies / 2; i++) {
      pairs.push([make(suit, value), make(suit, value)]);
    }
  };

  for (const suit of SUITED) {
    for (let value = 1; value <= 9; value++) addCopies(suit, value, 4);
  }
  for (let value = 1; value <= 4; value++) addCopies(MahjongSuit.WIND, value, 4);
  for (let value = 1; value <= 3; value++) addCopies(MahjongSuit.DRAGON, value, 4);

  // Flowers/seasons are four distinct faces that all match inside their group,
  // so pair them up arbitrarily (1-2, 3-4).
  for (const suit of [MahjongSuit.FLOWER, MahjongSuit.SEASON]) {
    for (let base = 1; base <= 3; base += 2) {
      pairs.push([make(suit, base), make(suit, base + 1)]);
    }
  }

  return pairs;
}

/**
 * Re-groups arbitrary tiles into matching pairs. Used by SHUFFLE — removal is
 * always by matching pair, so every matchKey always has an even count left.
 */
export function regroupIntoPairs(tiles: MahjongTile[]): [MahjongTile, MahjongTile][] {
  const byKey = new Map<string, MahjongTile[]>();
  for (const tile of tiles) {
    const bucket = byKey.get(tile.matchKey);
    if (bucket) bucket.push(tile);
    else byKey.set(tile.matchKey, [tile]);
  }

  const pairs: [MahjongTile, MahjongTile][] = [];
  for (const bucket of byKey.values()) {
    if (bucket.length % 2 !== 0) {
      throw new Error(`Cannot regroup tiles: odd count for matchKey ${bucket[0].matchKey}`);
    }
    for (let i = 0; i < bucket.length; i += 2) {
      pairs.push([bucket[i], bucket[i + 1]]);
    }
  }
  return pairs;
}
