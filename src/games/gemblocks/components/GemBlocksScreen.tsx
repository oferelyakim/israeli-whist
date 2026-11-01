import { useEffect, useRef } from 'react';
import { useGemBlocksGame } from '../hooks/useGemBlocksGame';
import { GemBlocksTable } from './GemBlocksTable';
import type { GemBlocksSettings } from '../types';
import type { GameScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

export default function GemBlocksScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const {
    gameState, record, startGame, selectPiece, placePiece, clearFlash, newGame,
  } = useGemBlocksGame();

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startGame(settings as GemBlocksSettings);
  }, [settings, startGame]);

  if (!gameState) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <GemBlocksTable
      gameState={gameState}
      record={record}
      onSelectPiece={selectPiece}
      onPlacePiece={placePiece}
      onClearFlash={clearFlash}
      onNewGame={newGame}
      onBack={onBack}
    />
  );
}
