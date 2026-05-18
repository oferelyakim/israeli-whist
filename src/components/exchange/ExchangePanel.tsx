import type { CardKey } from '../../types/card';
import { EXCHANGE_CARD_COUNT } from '../../engine/exchange';
import { useTranslation } from '../../i18n/LanguageContext';
import './ExchangePanel.css';

interface ExchangePanelProps {
  selectedCards: CardKey[];
  onConfirm: () => void;
  exchangeRound: number;
}

export function ExchangePanel({ selectedCards, onConfirm, exchangeRound }: ExchangePanelProps) {
  const { t } = useTranslation();
  const ready = selectedCards.length === EXCHANGE_CARD_COUNT;

  return (
    <div className="exchange-panel">
      <h3>{t('exchange.title', { n: exchangeRound + 1 })}</h3>
      <p className="exchange-info">
        {t('exchange.instructions', { n: EXCHANGE_CARD_COUNT })}
        <br />
        <small>{t('exchange.note')}</small>
      </p>
      <div className="exchange-status">
        {t('exchange.selected', { current: selectedCards.length, total: EXCHANGE_CARD_COUNT })}
      </div>
      <button
        className="exchange-confirm"
        disabled={!ready}
        onClick={onConfirm}
      >
        {t('exchange.passCards')}
      </button>
    </div>
  );
}
