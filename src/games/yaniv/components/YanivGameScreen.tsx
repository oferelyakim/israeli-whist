import { useEffect, useRef } from 'react';
import { useYanivGame } from '../hooks/useYanivGame';
import { YanivGameTable } from './YanivGameTable';
import { YanivPhase } from '../types';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function YanivGameScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const {
    gameState,
    startGame,
    discardAndDraw,
    declareYaniv,
    quickStick,
    skipQuickStick,
    nextRound,
    endGame,
    newGame,
    humanSeat,
  } = useYanivGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      startGame(settings);
    }
  }, [settings, startGame]);

  if (
    !gameState ||
    gameState.currentRound.phase === YanivPhase.DEALING
  ) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <YanivGameTable
      gameState={gameState}
      humanSeat={humanSeat}
      onDiscardAndDraw={discardAndDraw}
      onDeclareYaniv={declareYaniv}
      onQuickStick={quickStick}
      onSkipQuickStick={skipQuickStick}
      onNextRound={nextRound}
      onEndGame={endGame}
      onNewGame={newGame}
      onBack={onBack}
    />
  );
}
