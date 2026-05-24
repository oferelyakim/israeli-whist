import { useEffect, useRef } from 'react';
import type { GameScreenProps } from '../../registry';
import { useEscapeRoomGame } from '../hooks/useEscapeRoomGame';
import { RoundShell } from './RoundShell';
import { StageHost } from './StageHost';
import { RoundComplete } from './RoundComplete';
import { ROUND_001_CLASSIC } from '../manifest/rounds';
import { useTranslation } from '../../../i18n/LanguageContext';
import '../styles/escape-room.css';

export default function EscapeRoomGameScreen({ onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const {
    state,
    liveStageArchetypeState,
    startRound,
    submit,
    requestHint,
    nextStage,
    pause,
    resume,
    abandon,
    restartRound,
  } = useEscapeRoomGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!state) {
      startRound(ROUND_001_CLASSIC.roundId);
    }
  }, [state, startRound]);

  if (!state) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  if (state.phase === 'ABANDONED') {
    onBack();
    return null;
  }

  if (state.phase === 'ROUND_COMPLETE') {
    return (
      <RoundComplete
        state={state}
        onRestart={restartRound}
        onBack={onBack}
      />
    );
  }

  return (
    <RoundShell
      state={state}
      onPause={pause}
      onResume={resume}
      onAbandon={() => {
        abandon();
        onBack();
      }}
      onNextStage={nextStage}
    >
      <StageHost
        state={state}
        liveArchetypeState={liveStageArchetypeState}
        onSubmit={submit}
        onRequestHint={requestHint}
        disabled={state.phase !== 'RUNNING'}
      />
    </RoundShell>
  );
}
