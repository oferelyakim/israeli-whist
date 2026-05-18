import { useEffect, useRef } from 'react';
import { QuartetsGameTable } from './QuartetsGameTable';
import { useQuartetsGame } from '../hooks/useQuartetsGame';
import type { QuartetsGameSettings } from '../types';
import { QuartetsPhase } from '../types';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function QuartetsGameScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const {
    gameState,
    startGame,
    askForCard,
    chooseColor,
    acknowledgeResult,
    endGame,
    newGame,
    humanSeat,
    resolveRequest,
  } = useQuartetsGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current && settings) {
      startedRef.current = true;
      startGame(settings as QuartetsGameSettings);
    }
  }, [settings, startGame]);

  if (!gameState || gameState.round.phase === QuartetsPhase.DEALING) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <QuartetsGameTable
      gameState={gameState}
      humanSeat={humanSeat}
      onAskForCard={askForCard}
      onChooseColor={chooseColor}
      onAcknowledgeResult={acknowledgeResult}
      onEndGame={endGame}
      onNewGame={newGame}
      onBack={onBack}
      onResolveRequest={resolveRequest}
    />
  );
}
