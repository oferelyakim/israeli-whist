import { useEffect, useRef } from 'react';
import { useWordWondersGame } from '../hooks/useWordWondersGame';
import { WordWondersTable } from './WordWondersTable';
import type { WordWondersGameSettings } from '../types';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function WordWondersScreen({ settings, onBack }: GameScreenProps) {
  const { t, language } = useTranslation();
  const {
    gameState, levelIndex, loading, error, startGame,
    traceStart, traceEnter, traceEnd, clearResult,
    shuffle, hint, nextLevel, setLanguage,
  } = useWordWondersGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    // First run follows the app's language; after that the saved progress wins.
    startGame(settings as WordWondersGameSettings, language === 'he' ? 'he' : 'en');
  }, [settings, language, startGame]);

  if (error) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        <p>{t('wordwonders.loadFailed')}</p>
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

  if (!gameState || !gameState.level || loading) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <WordWondersTable
      gameState={gameState}
      levelIndex={levelIndex}
      onTraceStart={traceStart}
      onTraceEnter={traceEnter}
      onTraceEnd={traceEnd}
      onClearResult={clearResult}
      onShuffle={shuffle}
      onHint={hint}
      onNextLevel={nextLevel}
      onSetLanguage={setLanguage}
      onBack={onBack}
    />
  );
}
