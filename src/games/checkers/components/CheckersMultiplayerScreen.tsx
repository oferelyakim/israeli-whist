import { useCallback } from 'react';
import type { MultiplayerScreenProps } from '../../registry';
import { useCheckersMultiplayer } from '../hooks/useCheckersMultiplayer';
import { CheckersTable } from './CheckersTable';
import { useTranslation } from '../../../i18n/LanguageContext';

const exitBtnStyle: React.CSSProperties = {
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

export default function CheckersMultiplayerScreen({
  roomId,
  humanSeat,
  isHost,
  onBack,
}: MultiplayerScreenProps) {
  const { t } = useTranslation();
  const {
    gameState,
    syncError,
    retrySync,
    legalMoves,
    selectPiece,
    movePiece,
    newGame,
    humanColor,
  } = useCheckersMultiplayer(roomId, humanSeat, isHost);

  const handleExit = useCallback(() => {
    if (window.confirm(t('common.exitConfirm'))) {
      onBack();
    }
  }, [t, onBack]);

  if (!gameState) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  const opponentSeat = humanSeat === 0 ? 1 : 0;
  const opponentName = gameState.settings.playerNames[opponentSeat] ?? 'Opponent';

  return (
    <>
      {syncError && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 1000,
            background: '#b71c1c',
            color: '#fff',
            padding: '8px 16px',
            textAlign: 'center',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
          }}
        >
          <span>{syncError}</span>
          <button
            onClick={retrySync}
            style={{
              background: '#fff',
              color: '#b71c1c',
              border: 'none',
              borderRadius: '4px',
              padding: '4px 12px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '13px',
            }}
          >
            {t('common.reload')}
          </button>
        </div>
      )}
      <button style={exitBtnStyle} onClick={handleExit}>
        ✕ {t('common.exitGame')}
      </button>
      <CheckersTable
        gameState={gameState}
        humanColor={humanColor}
        legalMoves={legalMoves}
        onSelectPiece={selectPiece}
        onMovePiece={movePiece}
        onNewGame={newGame}
        opponentName={opponentName}
      />
    </>
  );
}
