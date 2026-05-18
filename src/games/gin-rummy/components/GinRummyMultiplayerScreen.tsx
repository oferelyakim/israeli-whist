import { useCallback } from 'react';
import type { MultiplayerScreenProps } from '../../registry';

const exitBtnStyle: React.CSSProperties = {
  position: 'fixed', top: 10, left: 10, zIndex: 999,
  background: 'rgba(0,0,0,0.5)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)',
  borderRadius: '6px', padding: '5px 10px', cursor: 'pointer',
  fontSize: '13px', lineHeight: 1,
};

export default function GinRummyMultiplayerScreen({
  roomId: _roomId,
  humanSeat: _humanSeat,
  isHost: _isHost,
  onBack,
}: MultiplayerScreenProps) {
  const handleExit = useCallback(() => {
    onBack();
  }, [onBack]);

  return (
    <div style={{
      width: '100%',
      height: '100vh',
      background: 'linear-gradient(135deg, #1a4a2e 0%, #0d2818 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontFamily: 'var(--font-main, "Segoe UI", sans-serif)',
    }}>
      <button style={exitBtnStyle} onClick={handleExit}>
        &times; Back
      </button>
      <div style={{
        background: 'rgba(0,0,0,0.4)',
        borderRadius: '16px',
        padding: '32px 48px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>&#x1F6A7;</div>
        <h2 style={{ margin: '0 0 12px', fontSize: '24px' }}>Multiplayer Coming Soon</h2>
        <p style={{ margin: 0, color: '#aaa', fontSize: '14px' }}>
          Gin Rummy multiplayer is not yet available.<br />
          Play against AI in single-player mode!
        </p>
      </div>
    </div>
  );
}
