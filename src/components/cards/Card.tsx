import type { Card as CardType } from '../../types/card';
import { SUIT_SYMBOLS, RANK_NAMES, isRedSuit, Rank } from '../../types/card';
import { RoyalFaceIllustration } from './RoyalFaceIllustration';
import './Card.css';

interface CardProps {
  card: CardType;
  faceDown?: boolean;
  playable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  style?: React.CSSProperties;
}

export function Card({ card, faceDown, playable, selected, onClick, small, style }: CardProps) {
  const suitSymbol = SUIT_SYMBOLS[card.suit];
  const rankName = RANK_NAMES[card.rank];
  const isRed = isRedSuit(card.suit);
  const isRoyal = card.rank === Rank.JACK || card.rank === Rank.QUEEN || card.rank === Rank.KING;

  if (faceDown) {
    return (
      <div className={`card card-back ${small ? 'card-small' : ''}`} style={style}>
        <div className="card-back-inner">
          <div className="card-back-pattern" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={`card ${isRed ? 'card-red' : 'card-black'} ${isRoyal ? 'card-royal' : ''} ${playable ? 'card-playable' : ''} ${selected ? 'card-selected' : ''} ${small ? 'card-small' : ''}`}
      onClick={playable || selected !== undefined ? onClick : undefined}
      style={style}
    >
      <div className="card-corner card-corner-tl">
        <span className="card-rank">{rankName}</span>
        <span className="card-suit-small">{suitSymbol}</span>
      </div>
      <div className="card-corner card-corner-br">
        <span className="card-rank">{rankName}</span>
        <span className="card-suit-small">{suitSymbol}</span>
      </div>
      <div className="card-body">
        {isRoyal ? (
          <div className="card-face">
            <RoyalFaceIllustration rank={card.rank} isRed={isRed} />
          </div>
        ) : (
          <span className="card-center-pip">{suitSymbol}</span>
        )}
      </div>
    </div>
  );
}
