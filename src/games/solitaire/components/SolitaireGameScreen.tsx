import { useEffect, useRef } from 'react';
import { useSolitaireGame } from '../hooks/useSolitaireGame';
import { SolitaireGameTable } from './SolitaireGameTable';
import { SolitairePhase } from '../types';
import type { SolitaireGameSettings } from '../types';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function SolitaireGameScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const {
    gameState, startGame, drawFromStock, recycleWaste,
    moveToTableau, moveToFoundation, undo, hint,
    startAutoComplete, newGame, restartSameCards,
  } = useSolitaireGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (!startedRef.current) {
      startedRef.current = true;
      startGame(settings as SolitaireGameSettings);
    }
  }, [settings, startGame]);

  if (!gameState || gameState.phase === SolitairePhase.DEALING) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <SolitaireGameTable
      gameState={gameState}
      onDrawFromStock={drawFromStock}
      onRecycleWaste={recycleWaste}
      onMoveToTableau={moveToTableau}
      onMoveToFoundation={moveToFoundation}
      onUndo={undo}
      onHint={hint}
      onAutoComplete={startAutoComplete}
      onNewGame={newGame}
      onRestartSameCards={restartSameCards}
      onBack={onBack}
    />
  );
}
