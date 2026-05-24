import type { RoundState } from '../engine/round-runner';
import { scoreStage } from '../engine/scoring';
import { useTranslation } from '../../../i18n/LanguageContext';
import type { TranslationKey } from '../../../i18n/translations';

interface RoundCompleteProps {
  state: RoundState;
  onRestart: () => void;
  onBack: () => void;
}

export function RoundComplete({ state, onRestart, onBack }: RoundCompleteProps) {
  const { t } = useTranslation();
  const totalSeconds = Math.floor(state.elapsedMs / 1000);

  const rows = state.manifest.stages.map((entry) => {
    const stage = state.perStage[entry.stageIndex];
    const solved = stage?.solvedAtMs != null;
    const startMs = stage?.stageStartElapsedMs ?? 0;
    const endMs = stage?.solvedAtMs ?? state.elapsedMs;
    const elapsedSec = Math.max(0, Math.round((endMs - startMs) / 1000));
    const score = scoreStage({
      solved,
      hintsShown: stage?.hintsShown.length ?? 0,
      retries: stage?.retries ?? 0,
      elapsedSeconds: elapsedSec,
    });
    return { entry, stage, solved, elapsedSec, score };
  });

  const totalScore = rows.reduce((sum, r) => sum + r.score, 0);

  return (
    <div className="er-roundComplete">
      <div className="er-roundComplete__title">{t('escape.roundComplete.title')}</div>
      <div className="er-roundComplete__score">
        {t('escape.roundComplete.totalScore', { n: totalScore })}
      </div>
      <div className="er-roundComplete__time">
        {t('escape.roundComplete.totalTime', { time: `${Math.floor(totalSeconds / 60)}:${(totalSeconds % 60).toString().padStart(2, '0')}` })}
      </div>

      <table className="er-roundComplete__table">
        <thead>
          <tr>
            <th>{t('escape.roundComplete.col.stage')}</th>
            <th>{t('escape.roundComplete.col.archetype')}</th>
            <th>{t('escape.roundComplete.col.time')}</th>
            <th>{t('escape.roundComplete.col.hints')}</th>
            <th>{t('escape.roundComplete.col.retries')}</th>
            <th>{t('escape.roundComplete.col.score')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.entry.stageIndex}>
              <td>{r.entry.stageIndex}</td>
              <td>{t(`escape.archetype.${r.entry.archetypeId}.short` as TranslationKey)}</td>
              <td>{r.elapsedSec}s</td>
              <td>{r.stage?.hintsShown.length ?? 0}</td>
              <td>{r.stage?.retries ?? 0}</td>
              <td>{r.score}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="er-roundComplete__actions">
        <button className="er-btn er-btn--primary" onClick={onRestart}>
          {t('escape.roundComplete.retry')}
        </button>
        <button className="er-btn er-btn--ghost" onClick={onBack}>
          {t('common.backToMenu')}
        </button>
      </div>
    </div>
  );
}
