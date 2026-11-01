import { GameType } from '../../types/game-common';

/**
 * Each game's colour, as space-separated RGB.
 *
 * Kept as components rather than hex so one value drives both the icon and the
 * selected tile's tint: CSS can take an alpha off it with `rgb(var(--x) / .2)`,
 * which it cannot do with a hex string.
 */
const COLOURS: Partial<Record<GameType, string>> = {
  [GameType.WHIST]: '224 88 106',
  [GameType.YANIV]: '240 148 59',
  [GameType.QUARTETS]: '168 123 224',
  [GameType.SOLITAIRE]: '76 184 122',
  [GameType.SHITHEAD]: '200 154 90',
  [GameType.ISRAELI_RUMMY]: '63 176 184',
  [GameType.BACKGAMMON]: '224 112 74',
  [GameType.CHECKERS]: '111 147 232',
  [GameType.MAHJONG]: '63 184 148',
  [GameType.WORD_WONDERS]: '224 102 170',
  [GameType.GEM_BLOCKS]: '79 200 234',
  [GameType.PIPS]: '138 127 232',
  [GameType.STRANDS]: '242 196 61',
};

/** Falls back to the muted text colour for a game with no entry. */
export function gameColourRgb(game: GameType): string {
  return COLOURS[game] ?? '148 163 184';
}
