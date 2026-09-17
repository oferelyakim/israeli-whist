import { useEffect, useRef } from 'react';
import { useMahjongGame } from '../hooks/useMahjongGame';
import { MahjongTable } from './MahjongTable';
import { MahjongPhase } from '../types';
import type { MahjongGameSettings } from '../types';
import { validateLayouts } from '../engine/layouts';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function MahjongScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const {
    gameState, startGame, tapTile, clearSelection,
    undo, hint, shuffle, newGame, restartSameTiles, canUndo, leaderboard,
  } = useMahjongGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const problems = validateLayouts();
    if (problems.length > 0) {
      console.error('Mahjong layout validation failed:', problems);
    }
    startGame(settings as MahjongGameSettings);
  }, [settings, startGame]);

  if (!gameState || gameState.tiles.length === 0 && gameState.phase !== MahjongPhase.WON) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <MahjongTable
      gameState={gameState}
      canUndo={canUndo}
      leaderboard={leaderboard}
      onTapTile={tapTile}
      onClearSelection={clearSelection}
      onUndo={undo}
      onHint={hint}
      onShuffle={shuffle}
      onNewGame={newGame}
      onRestartSameTiles={restartSameTiles}
      onBack={onBack}
    />
  );
}
