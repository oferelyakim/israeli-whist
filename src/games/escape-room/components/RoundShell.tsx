import type { RoundState } from '../engine/round-runner';
import { useTranslation } from '../../../i18n/LanguageContext';

interface RoundShellProps {
  state: RoundState;
  children: React.ReactNode;
  onPause: () => void;
  onResume: () => void;
  onAbandon: () => void;
  onNextStage: () => void;
}

function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function RoundShell({
  state,
  children,
  onPause,
  onResume,
  onAbandon,
  onNextStage,
}: RoundShellProps) {
  const { t } = useTranslation();
  const totalStages = state.manifest.stages.length;
  const currentStageOrdinal =
    state.manifest.stages.findIndex((s) => s.stageIndex === state.currentStageIndex) + 1;
  const stageData = state.perStage[state.currentStageIndex];
  const stageElapsedMs = state.elapsedMs - stageData.stageStartElapsedMs;

  return (
    <div className="er-shell">
      <div className="er-shell__topbar">
        <div className="er-shell__stage">
          {t('escape.stageOf', { current: currentStageOrdinal, total: totalStages })}
        </div>
        <div className="er-shell__timer" aria-live="off">
          {formatTime(stageElapsedMs)}
        </div>
        <div className="er-shell__controls">
          {state.phase === 'RUNNING' && (
            <button className="er-btn er-btn--ghost" onClick={onPause}>
              {t('escape.pause')}
            </button>
          )}
          {state.phase === 'PAUSED' && (
            <button className="er-btn er-btn--primary" onClick={onResume}>
              {t('escape.resume')}
            </button>
          )}
          <button className="er-btn er-btn--ghost" onClick={onAbandon}>
            {t('escape.abandon')}
          </button>
        </div>
      </div>

      <div className="er-shell__body">
        {state.phase === 'PAUSED' && (
          <div className="er-paused">
            <div className="er-paused__title">{t('escape.pausedTitle')}</div>
            <button className="er-btn er-btn--primary" onClick={onResume}>
              {t('escape.resume')}
            </button>
          </div>
        )}
        {state.phase !== 'PAUSED' && children}
      </div>

      {state.phase === 'STAGE_SOLVED' && (
        <div className="er-stageSolved">
          <div className="er-stageSolved__msg">{t('escape.stageSolved')}</div>
          <button className="er-btn er-btn--primary" onClick={onNextStage}>
            {currentStageOrdinal === totalStages
              ? t('escape.finishRound')
              : t('escape.nextStage')}
          </button>
        </div>
      )}
    </div>
  );
}
