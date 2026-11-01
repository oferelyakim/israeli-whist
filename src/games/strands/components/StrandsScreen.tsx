import { useEffect, useRef } from 'react';
import { useStrandsGame } from '../hooks/useStrandsGame';
import { StrandsTable } from './StrandsTable';
import type { StrandsSettings } from '../types';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function StrandsScreen({ settings, onBack }: GameScreenProps) {
  const { t, language } = useTranslation();
  const {
    gameState, loading, error, startGame, traceStart, traceEnter, traceClear, traceEnd,
    clearResult, hint, nextLevel, setLanguage,
  } = useStrandsGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startGame(settings as StrandsSettings, language === 'he' ? 'he' : 'en');
  }, [settings, startGame, language]);

  if (error === 'build') {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        <p>{t('strands.buildFailed')}</p>
        <button
          onClick={onBack}
          style={{
            marginTop: 16, padding: '8px 24px', cursor: 'pointer',
            background: 'var(--accent)', border: 'none', borderRadius: 6,
            color: '#fff', fontSize: 14,
          }}
        >
          {t('common.backToMenu')}
        </button>
      </div>
    );
  }

  if (!gameState) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <StrandsTable
      gameState={gameState}
      loading={loading}
      onTraceStart={traceStart}
      onTraceEnter={traceEnter}
      onTraceClear={traceClear}
      onTraceEnd={traceEnd}
      onClearResult={clearResult}
      onHint={hint}
      onNextLevel={nextLevel}
      onSetLanguage={setLanguage}
      onBack={onBack}
    />
  );
}
