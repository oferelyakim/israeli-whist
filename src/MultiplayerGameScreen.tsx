import { useCallback } from 'react';
import { GameTable } from './components/layout/GameTable';
import { useMultiplayerGame } from './hooks/useMultiplayerGame';
import type { PlayerSeat } from './types/game';
import { GamePhase } from './types/game';
import type { MultiplayerScreenProps } from './games/registry';
import { useTranslation } from './i18n/LanguageContext';

const exitBtnStyle: React.CSSProperties = {
  position: 'fixed', top: 10, left: 10, zIndex: 999,
  background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: '6px', padding: '5px 10px', cursor: 'pointer',
  fontSize: '13px', lineHeight: 1,
};

export function MultiplayerGameScreen({ roomId, humanSeat, isHost, onBack }: MultiplayerScreenProps) {
  const { t } = useTranslation();
  const {
    gameState,
    syncError,
    retrySync,
    bid,
    selectDiscards,
    chooseTrump,
    raiseBid,
    declare: declareBid,
    playCard,
    collectTrick,
    nextRound,
    endGame,
    humanSeat: seat,
  } = useMultiplayerGame(roomId, humanSeat as PlayerSeat, isHost);

  const handleExit = useCallback(() => {
    if (window.confirm(t('common.exitConfirm'))) {
      onBack();
    }
  }, [t, onBack]);

  if (!gameState || gameState.currentRound.phase === GamePhase.LOBBY) {
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
      <GameTable
        gameState={gameState}
        humanSeat={seat}
        onBid={bid}
        onSelectDiscards={selectDiscards}
        onChooseTrump={chooseTrump}
        onRaiseBid={raiseBid}
        onDeclare={declareBid}
        onPlayCard={playCard}
        onCollectTrick={collectTrick}
        onNextRound={nextRound}
        onEndGame={endGame}
      />
    </>
  );
}
