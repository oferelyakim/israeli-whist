import type { ScoreEntry } from '../../types/game';
import { useTranslation } from '../../i18n/LanguageContext';
import './Scoreboard.css';

interface ScoreboardProps {
  scoreboard: ScoreEntry[][];
  playerNames: string[];
  show: boolean;
  onClose: () => void;
}

export function Scoreboard({ scoreboard, playerNames, show, onClose }: ScoreboardProps) {
  const { t } = useTranslation();
  if (!show) return null;

  const lastRound = scoreboard.length > 0 ? scoreboard[scoreboard.length - 1] : null;

  return (
    <div className="scoreboard-overlay" onClick={onClose}>
      <div className="scoreboard" onClick={(e) => e.stopPropagation()}>
        <div className="scoreboard-header">
          <h2>{t('scoring.scoreboard')}</h2>
          <button className="scoreboard-close" onClick={onClose}>&times;</button>
        </div>

        <table className="score-table">
          <thead>
            <tr>
              <th>{t('common.round')}</th>
              {playerNames.map((name, i) => (
                <th key={i}>{name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {scoreboard.map((round, ri) => (
              <tr key={ri}>
                <td className="round-num">{ri + 1}</td>
                {round.map((entry, ei) => (
                  <td key={ei} className={entry.roundScore >= 0 ? 'score-positive' : 'score-negative'}>
                    <div className="score-cell">
                      <span className="score-bid">{t('scoring.bidN', { n: entry.bid })}</span>
                      <span className="score-taken">{t('scoring.got', { n: entry.tricksTaken })}</span>
                      <span className="score-round">{entry.roundScore > 0 ? '+' : ''}{entry.roundScore}</span>
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {lastRound && (
            <tfoot>
              <tr>
                <td><strong>{t('common.total')}</strong></td>
                {lastRound.map((entry, i) => (
                  <td key={i} className="score-total">
                    <strong>{entry.cumulativeScore}</strong>
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>

        {scoreboard.length === 0 && (
          <p className="no-scores">{t('scoring.noRounds')}</p>
        )}
      </div>
    </div>
  );
}
