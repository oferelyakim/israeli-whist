import { useEffect, useRef } from 'react';
import { useGinRummyGame } from '../hooks/useGinRummyGame';
import { GinRummyGameTable } from './GinRummyGameTable';
import { GinRummyPhase } from '../types';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function GinRummyGameScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const {
    gameState,
    startGame,
    newGame,
    drawFromStock,
    drawFromDiscard,
    discard,
    layOffOnKnock,
    doneLayingOff,
    humanSeat,
  } = useGinRummyGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      startGame(settings);
    }
  }, [settings, startGame]);

  if (
    !gameState ||
    gameState.phase === GinRummyPhase.DEALING
  ) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <GinRummyGameTable
      gameState={gameState}
      humanSeat={humanSeat}
      onDrawFromStock={drawFromStock}
      onDrawFromDiscard={drawFromDiscard}
      onDiscard={discard}
      onLayOffOnKnock={layOffOnKnock}
      onDoneLayingOff={doneLayingOff}
      onNewGame={newGame}
      onBack={onBack}
    />
  );
}
