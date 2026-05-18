import type { QuartetCard as QuartetCardType } from '../types';
import type { CardSetDefinition } from '../card-sets';
import { QUARTET_COLOR_GRADIENT } from '../card-sets';
import './QuartetCard.css';

interface QuartetCardProps {
  card: QuartetCardType;
  cardSet: CardSetDefinition;
  faceDown?: boolean;
  playable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  small?: boolean;
  style?: React.CSSProperties;
}

export function QuartetCardComponent({
  card,
  cardSet,
  faceDown,
  playable,
  selected,
  onClick,
  small,
  style,
}: QuartetCardProps) {
  if (faceDown) {
    return (
      <div
        className={`qcard qcard-back ${small ? 'qcard-small' : ''}`}
        style={style}
      >
        <div className="qcard-back-pattern">?</div>
      </div>
    );
  }

  const emoji = cardSet.categories[card.category]?.emoji ?? '?';
  const gradient = QUARTET_COLOR_GRADIENT[card.color];

  const classes = [
    'qcard',
    small ? 'qcard-small' : '',
    playable ? 'qcard-playable' : '',
    selected ? 'qcard-selected' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={classes}
      style={{ background: gradient, ...style }}
      onClick={playable || selected !== undefined ? onClick : undefined}
    >
      <div className={`qcard-emoji ${small ? 'qcard-emoji-small' : ''}`}>
        {emoji}
      </div>
    </div>
  );
}
