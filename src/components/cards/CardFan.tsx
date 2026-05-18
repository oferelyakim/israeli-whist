import type { CardKey } from '../../types/card';
import type { Card as CardType } from '../../types/card';
import { cardKey, cardEquals } from '../../types/card';
import { Card } from './Card';
import './CardFan.css';

interface CardFanProps {
  cards: CardType[];
  playableCards?: CardType[];
  selectedCards?: CardKey[];
  faceDown?: boolean;
  onCardClick?: (card: CardType) => void;
  position: 'bottom' | 'top' | 'left' | 'right';
}

export function CardFan({
  cards,
  playableCards,
  selectedCards,
  faceDown,
  onCardClick,
  position,
}: CardFanProps) {
  const isHorizontal = position === 'bottom' || position === 'top';
  const cardCount = cards.length;

  return (
    <div className={`card-fan card-fan-${position}`}>
      {cards.map((card, i) => {
        const isPlayable = playableCards?.some((c) => cardEquals(c, card)) ?? false;
        const isSelected = selectedCards?.includes(cardKey(card)) ?? false;

        // Fan layout calculation
        const center = (cardCount - 1) / 2;
        const offset = i - center;

        let style: React.CSSProperties;
        if (isHorizontal) {
          const spread = Math.min(32, 350 / cardCount);
          const rotation = offset * 2;
          style = {
            transform: `translateX(${offset * spread}px) rotate(${rotation}deg)`,
            zIndex: i,
          };
        } else {
          const spread = Math.min(22, 250 / cardCount);
          style = {
            transform: `translateY(${offset * spread}px)`,
            zIndex: i,
          };
        }

        return (
          <Card
            key={cardKey(card)}
            card={card}
            faceDown={faceDown}
            playable={isPlayable}
            selected={isSelected}
            onClick={() => onCardClick?.(card)}
            small={!isHorizontal}
            style={style}
          />
        );
      })}
    </div>
  );
}
