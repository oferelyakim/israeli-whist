import { useState, useEffect, useRef } from 'react';
import type { Room, RoomPlayer } from '../../multiplayer/room-manager';
import { subscribeToRoom, setReady, fillWithAI, leaveRoom } from '../../multiplayer/room-manager';
import { publishStartGame } from '../../multiplayer/game-sync';
import { GameType, PlayerType } from '../../types/game-common';
import { CardSetType } from '../../games/quartets/types';
import { GAME_REGISTRY } from '../../games/registry';
import { useTranslation } from '../../i18n/LanguageContext';
import './RoomLobby.css';

interface RoomLobbyProps {
  roomId: string;
  uid: string;
  mySeat: number;
  isHost: boolean;
  onMultiplayerStart: () => void;
  onLeave: () => void;
}

function getSeatLabels(numPlayers: number, t: (key: any, params?: Record<string, string | number>) => string): string[] {
  if (numPlayers === 4) return [t('lobby.south'), t('lobby.west'), t('lobby.north'), t('lobby.east')];
  if (numPlayers === 2) return [t('lobby.playerN', { n: 1 }), t('lobby.playerN', { n: 2 })];
  if (numPlayers === 3) return [t('lobby.playerN', { n: 1 }), t('lobby.playerN', { n: 2 }), t('lobby.playerN', { n: 3 })];
  // For 5+, use generic numbered labels
  return Array.from({ length: numPlayers }, (_, i) => t('lobby.playerN', { n: i + 1 }));
}

export function RoomLobby({ roomId, uid, mySeat: _mySeat, isHost, onMultiplayerStart, onLeave }: RoomLobbyProps) {
  const { t } = useTranslation();
  const [room, setRoom] = useState<Room | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const unsub = subscribeToRoom(roomId, setRoom);
    return unsub;
  }, [roomId]);

  // Transition all clients when room state changes to IN_GAME
  useEffect(() => {
    if (room?.state === 'IN_GAME' && !startedRef.current) {
      startedRef.current = true;
      onMultiplayerStart();
    }
  }, [room?.state, onMultiplayerStart]);

  if (!room) return <div className="lobby-loading">{t('lobby.loadingRoom')}</div>;

  const numPlayers = room.numPlayers || 4;
  const gameType = room.gameType || GameType.WHIST;
  const gameConfig = GAME_REGISTRY[gameType]!;
  const seatLabels = getSeatLabels(numPlayers, t);

  const players = Object.values(room.players || {});
  const allSeats: (RoomPlayer | null)[] = Array.from({ length: numPlayers }, () => null);
  for (const p of players) {
    if (p.seat < numPlayers) {
      allSeats[p.seat] = p;
    }
  }

  const allReady = players.filter((p) => p.type !== PlayerType.AI).every((p) => p.ready);
  const canStart = isHost && players.length >= 1 && allReady;

  const handleFillAI = async () => {
    try {
      await fillWithAI(roomId);
    } catch (e) {
      console.error('Fill AI error:', e);
    }
  };

  const handleToggleReady = async () => {
    const me = players.find((p) => p.uid === uid);
    if (me) {
      await setReady(roomId, uid, !me.ready);
    }
  };

  const handleStart = async () => {
    // Build and deduplicate player names
    const rawNames = allSeats.map((p, i) => p?.name ?? t('bot.fallback', { n: i + 1 }));
    const nameCounts = new Map<string, number>();
    for (const name of rawNames) nameCounts.set(name, (nameCounts.get(name) || 0) + 1);
    const nameSeen = new Map<string, number>();
    const playerNames = rawNames.map((name) => {
      if (nameCounts.get(name)! > 1) {
        const idx = (nameSeen.get(name) || 0) + 1;
        nameSeen.set(name, idx);
        return `${name} ${idx}`;
      }
      return name;
    });
    const playerTypes = allSeats.map((p) => p?.type ?? PlayerType.AI);

    let settings: any;

    if (gameType === GameType.WHIST) {
      settings = {
        maxRounds: null,
        playerNames,
        playerTypes,
      };
    } else if (gameType === GameType.YANIV) {
      settings = {
        gameType: GameType.YANIV,
        numPlayers,
        playerNames,
        playerTypes,
        handSize: 5,
        yanivThreshold: 7,
        scoreLimit: 200,
        assafPenalty: 30,
        eliminationMode: false,
        ofer: false,
        fiftyReduction: true,
        australianReduction: false,
        useDoubleDeck: numPlayers > 5,
      };
    } else if (gameType === GameType.QUARTETS) {
      settings = {
        gameType: GameType.QUARTETS,
        numPlayers,
        playerNames,
        playerTypes,
        cardSet: CardSetType.EMOJI, // default; host could pick in future
      };
    } else {
      // Fallback for any future game types
      settings = {
        gameType,
        numPlayers,
        playerNames,
        playerTypes,
      };
    }

    try {
      await publishStartGame(roomId, settings);
    } catch (e) {
      console.error('Failed to start game:', e);
    }
  };

  const handleLeave = async () => {
    await leaveRoom(roomId, uid);
    onLeave();
  };

  const me = players.find((p) => p.uid === uid);

  return (
    <div className="room-lobby">
      <div className="lobby-card">
        <h2>{t('lobby.room')} <span className="room-code">{roomId}</span></h2>
        <p className="lobby-hint">{t('lobby.shareCode')}</p>
        <p className="lobby-hint" style={{ marginTop: 4, fontWeight: 600, color: 'var(--accent)' }}>
          {gameConfig.displayName} &mdash; {numPlayers} players
        </p>

        <div className="seat-grid">
          {allSeats.map((player, i) => (
            <div key={i} className={`seat-slot ${player ? 'seat-filled' : 'seat-empty'}`}>
              <div className="seat-label">{seatLabels[i]}</div>
              {player ? (
                <>
                  <div className="seat-name">{player.name}</div>
                  <div className={`seat-type ${player.type === PlayerType.AI ? 'seat-ai' : ''}`}>
                    {player.type === PlayerType.AI ? t('lobby.ai') : t('lobby.human')}
                  </div>
                  {player.type !== PlayerType.AI && (
                    <div className={`seat-ready ${player.ready ? 'is-ready' : ''}`}>
                      {player.ready ? t('common.ready') : t('common.notReady')}
                    </div>
                  )}
                </>
              ) : (
                <div className="seat-waiting">{t('common.waiting')}</div>
              )}
            </div>
          ))}
        </div>

        <div className="lobby-actions">
          {me && !me.ready && (
            <button className="lobby-btn lobby-btn-ready" onClick={handleToggleReady}>
              {t('lobby.readyUp')}
            </button>
          )}
          {me?.ready && (
            <button className="lobby-btn lobby-btn-unready" onClick={handleToggleReady}>
              {t('lobby.cancelReady')}
            </button>
          )}
          {isHost && (
            <button className="lobby-btn lobby-btn-fill" onClick={handleFillAI}>
              {t('lobby.fillWithAI')}
            </button>
          )}
          {isHost && (
            <button
              className="lobby-btn lobby-btn-start"
              disabled={!canStart}
              onClick={handleStart}
            >
              {t('lobby.startGame')}
            </button>
          )}
          <button className="lobby-btn lobby-btn-leave" onClick={handleLeave}>
            {t('lobby.leave')}
          </button>
        </div>
      </div>
    </div>
  );
}
