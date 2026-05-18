import type { Card as CardType } from '../../../types/card';
import { Rank, Suit, isJoker } from '../../../types/card';
import './RummyTile.css';

interface RummyTileProps {
  card: CardType;
  faceDown?: boolean;
  style?: React.CSSProperties;
}

const TILE_COLOR: Record<Suit, string> = {
  [Suit.SPADES]: 'yellow',
  [Suit.HEARTS]: 'red',
  [Suit.DIAMONDS]: 'green',
  [Suit.CLUBS]: 'blue',
  [Suit.JOKER_RED]: 'joker',
  [Suit.JOKER_BLACK]: 'joker',
};

function tileNumber(rank: Rank): string {
  switch (rank) {
    case Rank.ACE: return '1';
    case Rank.JACK: return '11';
    case Rank.QUEEN: return '12';
    case Rank.KING: return '13';
    default: return String(rank);
  }
}

export function RummyTile({ card, faceDown, style }: RummyTileProps) {
  if (faceDown) {
    return (
      <div className="rtile rtile-back" style={style}>
        <div className="rtile-back-pattern" />
      </div>
    );
  }

  const colorClass = `rtile-${TILE_COLOR[card.suit]}`;
  if (isJoker(card)) {
    return (
      <div className={`rtile ${colorClass}`} style={style}>
        <div className="rtile-stud" />
        <div className="rtile-joker-star">{'\u2605'}</div>
      </div>
    );
  }

  const num = tileNumber(card.rank);
  return (
    <div className={`rtile ${colorClass}`} style={style}>
      <div className="rtile-stud" />
      <div className="rtile-number-top">{num}</div>
      <div className="rtile-number-main">{num}</div>
    </div>
  );
}
