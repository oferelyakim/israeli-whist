import { useEffect, useRef } from 'react';
import { useIsraeliRummyGame } from '../hooks/useIsraeliRummyGame';
import { IsraeliRummyGameTable } from './IsraeliRummyGameTable';
import { IsraeliRummyPhase } from '../types';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function IsraeliRummyGameScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const {
    gameState,
    startGame,
    newGame,
    endGame,
    drawCard,
    startRearrange,
    commitMelds,
    revertRearrange,
    passTurn,
    sortHandBy,
    reorderHand,
    humanSeat,
  } = useIsraeliRummyGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      startGame(settings);
    }
  }, [settings, startGame]);

  if (
    !gameState ||
    gameState.phase === IsraeliRummyPhase.DEALING
  ) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <IsraeliRummyGameTable
      gameState={gameState}
      humanSeat={humanSeat}
      onDrawCard={drawCard}
      onStartRearrange={startRearrange}
      onCommitMelds={commitMelds}
      onRevertRearrange={revertRearrange}
      onPassTurn={passTurn}
      onSortHand={sortHandBy}
      onReorderHand={reorderHand}
      onNewGame={newGame}
      onEndGame={endGame}
      onBack={onBack}
    />
  );
}
