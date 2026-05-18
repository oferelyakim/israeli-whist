import { useEffect, useRef } from 'react';
import { useShitheadGame } from '../hooks/useShitheadGame';
import { ShitheadGameTable } from './ShitheadGameTable';
import { ShitheadPhase } from '../types';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function ShitheadGameScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const {
    gameState,
    startGame,
    playCards,
    pickUpPile,
    playBlind,
    swapCards,
    doneSwapping,
    newGame,
    endGame,
    humanSeat,
    fastForward,
    toggleFastForward,
  } = useShitheadGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      startGame(settings);
    }
  }, [settings, startGame]);

  if (
    !gameState ||
    gameState.phase === ShitheadPhase.DEALING
  ) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <ShitheadGameTable
      gameState={gameState}
      humanSeat={humanSeat}
      onPlayCards={playCards}
      onPickUpPile={pickUpPile}
      onPlayBlind={playBlind}
      onSwapCards={swapCards}
      onDoneSwapping={doneSwapping}
      onNewGame={newGame}
      onEndGame={endGame}
      onBack={onBack}
      fastForward={fastForward}
      onToggleFastForward={toggleFastForward}
    />
  );
}
