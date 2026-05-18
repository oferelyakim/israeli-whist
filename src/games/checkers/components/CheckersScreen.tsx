import { useCallback } from 'react';
import type { GameScreenProps } from '../../registry';
import type { CheckersSettings } from '../types';
import { useCheckersGame } from '../hooks/useCheckersGame';
import { CheckersTable } from './CheckersTable';
import { useTranslation } from '../../../i18n/LanguageContext';

const backBtnStyle: React.CSSProperties = {
  position: 'fixed',
  top: 10,
  left: 10,
  zIndex: 999,
  background: 'rgba(0,0,0,0.5)',
  color: '#fff',
  border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: '6px',
  padding: '5px 10px',
  cursor: 'pointer',
  fontSize: '13px',
  lineHeight: 1,
};

export default function CheckersScreen({ settings, onBack }: GameScreenProps) {
  const { t } = useTranslation();
  const checkersSettings = settings as CheckersSettings;

  const { gameState, legalMoves, selectPiece, movePiece, newGame, humanColor } =
    useCheckersGame(checkersSettings);

  const handleBack = useCallback(() => {
    if (window.confirm(t('common.exitConfirm'))) {
      onBack();
    }
  }, [t, onBack]);

  return (
    <>
      <button style={backBtnStyle} onClick={handleBack}>
        ✕ {t('common.backToMenu')}
      </button>
      <CheckersTable
        gameState={gameState}
        humanColor={humanColor}
        legalMoves={legalMoves}
        onSelectPiece={selectPiece}
        onMovePiece={movePiece}
        onNewGame={newGame}
      />
    </>
  );
}
