import { useEffect, useRef } from 'react';
import { useWordleGame } from '../hooks/useWordleGame';
import { WordleTable } from './WordleTable';
import type { WordleSettings } from '../types';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function WordleScreen({ settings, onBack }: GameScreenProps) {
  const { t, language } = useTranslation();
  const {
    gameState, stats, loading, startGame, type, backspace, submit,
    clearMessage, newEndless, setMode, setLanguage,
  } = useWordleGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startGame(settings as WordleSettings, language === 'he' ? 'he' : 'en');
  }, [settings, startGame, language]);

  if (!gameState) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <WordleTable
      gameState={gameState}
      stats={stats}
      loading={loading}
      onType={type}
      onBackspace={backspace}
      onSubmit={submit}
      onClearMessage={clearMessage}
      onNewEndless={newEndless}
      onSetMode={setMode}
      onSetLanguage={setLanguage}
      onBack={onBack}
    />
  );
}
