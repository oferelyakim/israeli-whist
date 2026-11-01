import { useEffect, useRef } from 'react';
import { usePipsGame } from '../hooks/usePipsGame';
import { PipsTable } from './PipsTable';
import type { PipsSettings } from '../types';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function PipsScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const {
    gameState, startGame, selectDomino, rotate, place, lift,
    clearBoard, hint, nextLevel, restartLevel,
  } = usePipsGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startGame(settings as PipsSettings);
  }, [settings, startGame]);

  if (!gameState) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <PipsTable
      gameState={gameState}
      onSelectDomino={selectDomino}
      onRotate={rotate}
      onPlace={place}
      onLift={lift}
      onClear={clearBoard}
      onHint={hint}
      onNextLevel={nextLevel}
      onRestart={restartLevel}
      onBack={onBack}
    />
  );
}
