import type { ScoreEntry } from '../../types/game';
import { useTranslation } from '../../i18n/LanguageContext';
import './RoundSummary.css';

interface RoundSummaryProps {
  scores: ScoreEntry[];
  playerNames: string[];
  roundNumber: number;
  onNextRound: () => void;
  onEndGame: () => void;
}

export function RoundSummary({ scores, playerNames, roundNumber, onNextRound, onEndGame }: RoundSummaryProps) {
  const { t } = useTranslation();
  return (
    <div className="round-summary-overlay">
      <div className="round-summary">
        <h2>{t('scoring.roundResults', { n: roundNumber + 1 })}</h2>
        <div className="summary-entries">
          {scores.map((entry) => {
            const hit = entry.tricksTaken === entry.bid;
            return (
              <div key={entry.seat} className={`summary-entry ${hit ? 'summary-hit' : 'summary-miss'}`}>
                <div className="summary-name">{playerNames[entry.seat]}</div>
                <div className="summary-details">
                  <span>{t('scoring.bidN', { n: entry.bid })}</span>
                  <span>{t('scoring.took', { n: entry.tricksTaken })}</span>
                </div>
                <div className="summary-score">
                  {entry.roundScore > 0 ? '+' : ''}{entry.roundScore}
                </div>
                <div className="summary-total">
                  {t('scoring.totalN', { n: entry.cumulativeScore })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="summary-actions">
          <button className="summary-btn summary-btn-next" onClick={onNextRound}>
            {t('common.nextRound')}
          </button>
          <button className="summary-btn summary-btn-end" onClick={onEndGame}>
            {t('common.endGame')}
          </button>
        </div>
      </div>
    </div>
  );
}
