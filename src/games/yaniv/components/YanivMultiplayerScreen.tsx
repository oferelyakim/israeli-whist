import { useCallback } from 'react';
import { YanivGameTable } from './YanivGameTable';
import { useYanivMultiplayer } from '../hooks/useYanivMultiplayer';
import { YanivPhase } from '../types';
import type { MultiplayerScreenProps } from '../../registry';
import { useTranslation } from '../../../i18n/LanguageContext';

const exitBtnStyle: React.CSSProperties = {
  position: 'fixed', top: 10, left: 10, zIndex: 999,
  background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: '6px', padding: '5px 10px', cursor: 'pointer',
  fontSize: '13px', lineHeight: 1,
};

export default function YanivMultiplayerScreen({
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
    discardAndDraw,
    declareYaniv,
    quickStick,
    skipQuickStick,
    nextRound,
    endGame,
    humanSeat: seat,
  } = useYanivMultiplayer(roomId, humanSeat, isHost);

  const handleExit = useCallback(() => {
    if (window.confirm(t('common.exitConfirm'))) {
      onBack();
    }
  }, [t, onBack]);

  if (!gameState || gameState.currentRound.phase === YanivPhase.DEALING) {
    return (
      <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
        {t('common.loadingGame')}
      </div>
    );
  }

  return (
    <>
      {syncError && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000,
          background: '#b71c1c', color: '#fff', padding: '8px 16px',
          textAlign: 'center', fontSize: '14px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
        }}>
          <span>{syncError}</span>
          <button
            onClick={retrySync}
            style={{
              background: '#fff', color: '#b71c1c', border: 'none',
              borderRadius: '4px', padding: '4px 12px', cursor: 'pointer',
              fontWeight: 'bold', fontSize: '13px',
            }}
          >
            {t('common.reload')}
          </button>
        </div>
      )}
      <button style={exitBtnStyle} onClick={handleExit}>
        ✕ {t('common.exitGame')}
      </button>
      <YanivGameTable
        gameState={gameState}
        humanSeat={seat}
        onDiscardAndDraw={discardAndDraw}
        onDeclareYaniv={declareYaniv}
        onQuickStick={quickStick}
        onSkipQuickStick={skipQuickStick}
        onNextRound={nextRound}
        onEndGame={endGame}
      />
    </>
  );
}
