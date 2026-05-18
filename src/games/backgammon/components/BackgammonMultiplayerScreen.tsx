import { useCallback } from 'react';
import { BackgammonTable } from './BackgammonTable';
import { useBackgammonMultiplayer } from '../hooks/useBackgammonMultiplayer';
import type { MultiplayerScreenProps } from '../../registry';
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

export default function BackgammonMultiplayerScreen({
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
    selectedFrom,
    rollDice,
    selectChecker,
    moveChecker,
    newGame,
    humanColor,
  } = useBackgammonMultiplayer(roomId, humanSeat, isHost);

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

  const isHumanTurn = gameState.state.turn === humanColor;

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
      <BackgammonTable
        gameState={gameState}
        legalMoves={legalMoves}
        allLegalSources={[]}
        selectedFrom={selectedFrom}
        rollDice={rollDice}
        selectChecker={selectChecker}
        moveChecker={moveChecker}
        newGame={newGame}
        humanColor={humanColor}
        isHumanTurn={isHumanTurn}
        homeRight={true}
        showMoveHints={false}
      />
    </>
  );
}
