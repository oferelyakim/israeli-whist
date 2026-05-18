import type { StandardSuit } from '../../types/card';
import { Suit, SUITS, SUIT_SYMBOLS, isRedSuit } from '../../types/card';
import { useTranslation } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations';
import './TrumpSelector.css';

const SUIT_TRANSLATION_KEYS: Record<StandardSuit, TranslationKey> = {
  [Suit.SPADES]: 'suit.spades',
  [Suit.HEARTS]: 'suit.hearts',
  [Suit.DIAMONDS]: 'suit.diamonds',
  [Suit.CLUBS]: 'suit.clubs',
};

interface TrumpSelectorProps {
  onSelect: (suit: Suit) => void;
}

export function TrumpSelector({ onSelect }: TrumpSelectorProps) {
  const { t } = useTranslation();
  return (
    <div className="trump-selector">
      <h3>{t('bidding.chooseTrump')}</h3>
      <div className="trump-options">
        {SUITS.map((suit) => (
          <button
            key={suit}
            className={`trump-option ${isRedSuit(suit) ? 'trump-option-red' : 'trump-option-black'}`}
            onClick={() => onSelect(suit)}
          >
            <span className="trump-symbol">{SUIT_SYMBOLS[suit]}</span>
            <span className="trump-name">{t(SUIT_TRANSLATION_KEYS[suit])}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
