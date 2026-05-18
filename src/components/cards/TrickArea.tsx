import { useState } from 'react';
import type { Trick, PlayerSeat } from '../../types/game';
import type { StandardSuit } from '../../types/card';
import { Suit, SUIT_SYMBOLS } from '../../types/card';
import { Card } from './Card';
import { useTranslation } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations';
import './TrickArea.css';

const SUIT_TRANSLATION_KEYS: Record<StandardSuit, TranslationKey> = {
  [Suit.SPADES]: 'suit.spades',
  [Suit.HEARTS]: 'suit.hearts',
  [Suit.DIAMONDS]: 'suit.diamonds',
  [Suit.CLUBS]: 'suit.clubs',
};

interface TrickAreaProps {
  trick: Trick;
  trumpSuit: Suit | null;
  trickNumber: number;
  lastTrick?: Trick | null;
  playerNames?: string[];
}

const POSITION_MAP: Record<PlayerSeat, string> = {
  0: 'trick-card-south',
  1: 'trick-card-west',
  2: 'trick-card-north',
  3: 'trick-card-east',
};

export function TrickArea({ trick, trumpSuit, trickNumber, lastTrick, playerNames }: TrickAreaProps) {
  const { t } = useTranslation();
  const [showLastTrick, setShowLastTrick] = useState(false);

  return (
    <div className="trick-area">
      {trumpSuit && (
        <div className="trump-indicator">
          {t('game.trump')} <span className={trumpSuit === Suit.HEARTS || trumpSuit === Suit.DIAMONDS ? 'trump-red' : 'trump-black'}>
            {SUIT_SYMBOLS[trumpSuit]} {t(SUIT_TRANSLATION_KEYS[trumpSuit as StandardSuit])}
          </span>
        </div>
      )}
      <div className="trick-cards">
        {trick.cards.map((pc) => (
          <div key={pc.seat} className={`trick-card ${POSITION_MAP[pc.seat]}`}>
            <Card card={pc.card} small />
          </div>
        ))}
      </div>
      {trickNumber > 0 && (
        <div className="trick-number">{t('game.trickN', { current: trickNumber, total: 13 })}</div>
      )}

      {/* Last trick peek button */}
      {lastTrick && lastTrick.cards.length === 4 && (
        <button
          className="last-trick-btn"
          onClick={() => setShowLastTrick((v) => !v)}
          title={t('game.lastTrick')}
        >
          {t('game.lastTrick')}
        </button>
      )}

      {/* Last trick popup */}
      {showLastTrick && lastTrick && lastTrick.cards.length === 4 && (
        <div className="last-trick-overlay" onClick={() => setShowLastTrick(false)}>
          <div className="last-trick-panel" onClick={(e) => e.stopPropagation()}>
            <div className="last-trick-title">{t('game.lastTrickTitle')}</div>
            <div className="last-trick-cards">
              {lastTrick.cards.map((pc) => (
                <div
                  key={pc.seat}
                  className={`last-trick-entry ${pc.seat === lastTrick.winnerSeat ? 'last-trick-winner' : ''}`}
                >
                  <span className="last-trick-name">
                    {playerNames ? playerNames[pc.seat] : `P${pc.seat + 1}`}
                    {pc.seat === lastTrick.winnerSeat && ' ★'}
                  </span>
                  <Card card={pc.card} small />
                </div>
              ))}
            </div>
            <button className="last-trick-close" onClick={() => setShowLastTrick(false)}>✕</button>
          </div>
        </div>
      )}
    </div>
  );
}
