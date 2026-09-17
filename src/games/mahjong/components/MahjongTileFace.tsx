import { MahjongSuit } from '../types';
import type { MahjongTile } from '../types';

/**
 * Pip placement on a 3x3 grid (cells numbered 1-9, row-major). Circles render
 * these as dots, bamboo as vertical sticks — same geometry, different mark.
 */
const PIP_CELLS: Record<number, number[]> = {
  1: [5],
  2: [2, 8],
  3: [1, 5, 9],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
  7: [1, 2, 3, 4, 6, 7, 9],
  8: [1, 2, 3, 4, 6, 7, 8, 9],
  9: [1, 2, 3, 4, 5, 6, 7, 8, 9],
};

const WIND_GLYPHS = ['東', '南', '西', '北']; // E S W N
const DRAGON_GLYPHS = ['中', '發', '白']; // red, green, white
const FLOWER_GLYPHS = ['梅', '蘭', '菊', '竹']; // plum orchid chrys. bamboo
const SEASON_GLYPHS = ['春', '夏', '秋', '冬']; // spring summer autumn winter

function Pips({ value, kind }: { value: number; kind: 'dot' | 'bar' }) {
  const cells = PIP_CELLS[value] ?? [];
  const filled = new Set(cells);
  return (
    <div className="mj-pips">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className="mj-pip-cell">
          {filled.has(i + 1) ? <span className={`mj-pip mj-pip-${kind}`} /> : null}
        </span>
      ))}
    </div>
  );
}

export function MahjongTileFace({ tile }: { tile: MahjongTile }) {
  switch (tile.suit) {
    case MahjongSuit.CIRCLES:
      return (
        <div className="mj-face mj-face-circles">
          <Pips value={tile.value} kind="dot" />
        </div>
      );
    case MahjongSuit.BAMBOO:
      return (
        <div className="mj-face mj-face-bamboo">
          <Pips value={tile.value} kind="bar" />
        </div>
      );
    case MahjongSuit.CHARACTERS:
      return (
        <div className="mj-face mj-face-characters">
          <span className="mj-numeral">{tile.value}</span>
          <span className="mj-glyph-small">{'萬'}</span>
        </div>
      );
    case MahjongSuit.WIND:
      return (
        <div className="mj-face mj-face-wind">
          <span className="mj-glyph">{WIND_GLYPHS[tile.value - 1]}</span>
        </div>
      );
    case MahjongSuit.DRAGON:
      return (
        <div className={`mj-face mj-face-dragon mj-dragon-${tile.value}`}>
          <span className="mj-glyph">{DRAGON_GLYPHS[tile.value - 1]}</span>
        </div>
      );
    case MahjongSuit.FLOWER:
      return (
        <div className="mj-face mj-face-flower">
          <span className="mj-glyph">{FLOWER_GLYPHS[tile.value - 1]}</span>
        </div>
      );
    case MahjongSuit.SEASON:
      return (
        <div className="mj-face mj-face-season">
          <span className="mj-glyph">{SEASON_GLYPHS[tile.value - 1]}</span>
        </div>
      );
    default:
      return <div className="mj-face" />;
  }
}
