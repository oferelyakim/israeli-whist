import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { MainMenu } from './components/lobby/MainMenu';
import { GameType } from './types/game-common';
import { GAME_REGISTRY } from './games/registry';
import { saveSession, loadSession, clearSession } from './multiplayer/session';
import { useTranslation } from './i18n/LanguageContext';
import { useVersionCheck } from './hooks/useVersionCheck';
import { UpdateBanner } from './components/common/UpdateBanner';

// Lazy-load RoomLobby (it imports Firebase)
const RoomLobby = lazy(() =>
  import('./components/lobby/RoomLobby').then((m) => ({ default: m.RoomLobby }))
);

type AppScreen = 'menu' | 'lobby' | 'game' | 'multiplayer_game' | 'reconnecting';

function LoadingFallback() {
  const { t } = useTranslation();
  return (
    <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>{t('common.loading')}</div>
  );
}

function ReconnectingFallback() {
  const { t } = useTranslation();
  return (
    <div style={{ color: '#aaa', textAlign: 'center', paddingTop: '40vh' }}>
      <div style={{ fontSize: '1.2em', marginBottom: '12px' }}>{t('common.reconnecting')}</div>
      <div style={{ fontSize: '0.9em', opacity: 0.7 }}>{t('common.restoringSession')}</div>
    </div>
  );
}

export function App() {
  const updateAvailable = useVersionCheck();
  const [screen, setScreen] = useState<AppScreen>('menu');
  const [selectedGame, setSelectedGame] = useState<GameType>(GameType.WHIST);
  const [gameSettings, setGameSettings] = useState<any>(null);
  const [roomInfo, setRoomInfo] = useState<{
    roomId: string;
    uid: string;
    seat: number;
    isHost: boolean;
  } | null>(null);
  const recoveryAttemptedRef = useRef(false);

  // ─── Session recovery on mount ─────────────────────────────────────────
  useEffect(() => {
    if (recoveryAttemptedRef.current) return;
    recoveryAttemptedRef.current = true;

    const session = loadSession();
    if (!session) return;

    // Show reconnecting state while we try
    setScreen('reconnecting');

    (async () => {
      try {
        const { rejoinRoom, getRoom } = await import('./multiplayer/room-manager');
        const result = await rejoinRoom(session.roomId);

        // Check the room's current state to decide where to navigate
        const room = await getRoom(session.roomId);
        if (!room) {
          // Room was deleted
          clearSession();
          setScreen('menu');
          return;
        }

        setSelectedGame(result.gameType);
        setRoomInfo({
          roomId: session.roomId,
          uid: result.uid,
          seat: result.seat,
          isHost: result.isHost,
        });

        // Update session with potentially refreshed isHost status
        saveSession({
          ...session,
          uid: result.uid,
          seat: result.seat,
          isHost: result.isHost,
          gameType: result.gameType,
        });

        if (room.state === 'IN_GAME') {
          setScreen('multiplayer_game');
        } else if (room.state === 'WAITING') {
          setScreen('lobby');
        } else {
          // FINISHED or unknown
          clearSession();
          setScreen('menu');
        }
      } catch (e) {
        console.error('Session recovery failed:', e);
        clearSession();
        setScreen('menu');
      }
    })();
  }, []);

  // ─── Handlers ──────────────────────────────────────────────────────────

  const handleStartGame = (gameType: GameType, settings: any) => {
    setSelectedGame(gameType);
    setGameSettings(settings);
    setScreen('game');
  };

  const handleCreateRoom = async (gameType: GameType, numPlayers: number, playerName: string) => {
    setSelectedGame(gameType);
    try {
      const { createRoom } = await import('./multiplayer/room-manager');
      const { roomId, uid } = await createRoom(playerName, gameType, numPlayers);
      const info = { roomId, uid, seat: 0, isHost: true };
      setRoomInfo(info);
      setScreen('lobby');
      saveSession({ ...info, gameType, playerName });
    } catch (e: any) {
      console.error('Failed to create room:', e);
    }
  };

  const handleJoinRoom = async (roomId: string, playerName: string) => {
    try {
      const { joinRoom, subscribeToRoom } = await import('./multiplayer/room-manager');
      const { seat, uid } = await joinRoom(roomId, playerName);

      // Read the room to get the game type
      const gameType = await new Promise<GameType>((resolve) => {
        const unsub = subscribeToRoom(roomId, (room) => {
          if (room) {
            unsub();
            resolve(room.gameType || GameType.WHIST);
          }
        });
      });

      setSelectedGame(gameType);
      const info = { roomId, uid, seat, isHost: false };
      setRoomInfo(info);
      setScreen('lobby');
      saveSession({ ...info, gameType, playerName });
    } catch (e: any) {
      console.error('Failed to join room:', e);
    }
  };

  const handleBackToMenu = () => {
    setRoomInfo(null);
    setGameSettings(null);
    clearSession();
    setScreen('menu');
  };

  // ─── Render ────────────────────────────────────────────────────────────

  let content: React.ReactNode;

  if (screen === 'reconnecting') {
    content = <ReconnectingFallback />;
  } else if (screen === 'lobby' && roomInfo) {
    content = (
      <Suspense fallback={<LoadingFallback />}>
        <RoomLobby
          roomId={roomInfo.roomId}
          uid={roomInfo.uid}
          mySeat={roomInfo.seat}
          isHost={roomInfo.isHost}
          onMultiplayerStart={() => setScreen('multiplayer_game')}
          onLeave={handleBackToMenu}
        />
      </Suspense>
    );
  } else if (screen === 'multiplayer_game' && roomInfo) {
    const config = GAME_REGISTRY[selectedGame]!;
    const MultiplayerScreen = config.MultiplayerScreen;
    content = (
      <Suspense fallback={<LoadingFallback />}>
        <MultiplayerScreen
          roomId={roomInfo.roomId}
          humanSeat={roomInfo.seat}
          isHost={roomInfo.isHost}
          onBack={handleBackToMenu}
        />
      </Suspense>
    );
  } else if (screen === 'game' && gameSettings) {
    const config = GAME_REGISTRY[selectedGame]!;
    const GameScreen = config.GameScreen;
    content = (
      <Suspense fallback={<LoadingFallback />}>
        <GameScreen
          settings={gameSettings}
          onBack={handleBackToMenu}
        />
      </Suspense>
    );
  } else {
    content = (
      <MainMenu
        onStartGame={handleStartGame}
        onCreateRoom={handleCreateRoom}
        onJoinRoom={handleJoinRoom}
      />
    );
  }

  return (
    <>
      {content}
      {updateAvailable && <UpdateBanner />}
    </>
  );
}
