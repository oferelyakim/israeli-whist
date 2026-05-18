import { useEffect, useRef } from 'react';
import { useGame } from './hooks/useGame';
import { GameTable } from './components/layout/GameTable';
import { GamePhase } from './types/game';
import type { GameScreenProps } from './games/registry';
import { useTranslation } from './i18n/LanguageContext';

export default function WhistGameScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const {
    gameState,
    startGame,
    bid,
    selectDiscards,
    chooseTrump,
    raiseBid,
    declare: declareBid,
    playCard,
    collectTrick,
    nextRound,
    endGame,
    humanSeat,
  } = useGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      startGame(settings);
    }
  }, [settings, startGame]);

  if (
    !gameState ||
    gameState.currentRound.phase === GamePhase.LOBBY
  ) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <GameTable
      gameState={gameState}
      humanSeat={humanSeat}
      onBid={bid}
      onSelectDiscards={selectDiscards}
      onChooseTrump={chooseTrump}
      onRaiseBid={raiseBid}
      onDeclare={declareBid}
      onPlayCard={playCard}
      onCollectTrick={collectTrick}
      onNextRound={nextRound}
      onEndGame={endGame}
      onHome={onBack}
    />
  );
}
