import {
  ref, set, get, update, remove, onValue, onDisconnect,
  DataSnapshot,
} from 'firebase/database';
import { getDb, signInAnon } from './firebase-config';
import { GameType, PlayerType } from '../types/game-common';

export interface RoomPlayer {
  uid: string;
  name: string;
  seat: number;
  type: PlayerType;
  ready: boolean;
  connected: boolean;
}

export interface Room {
  id: string;
  hostUid: string;
  state: 'WAITING' | 'IN_GAME' | 'FINISHED';
  gameType: GameType;
  numPlayers: number;
  players: Record<string, RoomPlayer>;
  createdAt: number;
  settings?: any;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const AI_NAMES = ['Bot Alice', 'Bot Bob', 'Bot Charlie', 'Bot Dave', 'Bot Eve', 'Bot Frank', 'Bot Grace', 'Bot Henry'];

export async function createRoom(
  playerName: string,
  gameType: GameType = GameType.WHIST,
  numPlayers: number = 4,
): Promise<{ roomId: string; uid: string }> {
  const uid = await signInAnon();
  const db = getDb();

  // Generate unique room code
  let roomId = generateRoomCode();
  let existing = await get(ref(db, `rooms/${roomId}`));
  while (existing.exists()) {
    roomId = generateRoomCode();
    existing = await get(ref(db, `rooms/${roomId}`));
  }

  const room: Room = {
    id: roomId,
    hostUid: uid,
    state: 'WAITING',
    gameType,
    numPlayers,
    players: {
      [uid]: {
        uid,
        name: playerName,
        seat: 0,
        type: PlayerType.HUMAN,
        ready: false,
        connected: true,
      },
    },
    createdAt: Date.now(),
  };

  await set(ref(db, `rooms/${roomId}`), room);

  // Set up disconnect handler
  const playerRef = ref(db, `rooms/${roomId}/players/${uid}/connected`);
  onDisconnect(playerRef).set(false);

  return { roomId, uid };
}

export async function joinRoom(
  roomId: string,
  playerName: string
): Promise<{ seat: number; uid: string }> {
  const uid = await signInAnon();
  const db = getDb();

  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    throw new Error('Room not found');
  }

  const room = snapshot.val() as Room;

  // Check if this UID already has a player record in the room (reconnecting)
  const existingPlayer = room.players?.[uid];
  if (existingPlayer) {
    // Reconnect: restore existing seat, mark connected
    await update(ref(db, `rooms/${roomId}/players/${uid}`), {
      connected: true,
      name: playerName, // Update name in case it changed
    });
    const playerRef = ref(db, `rooms/${roomId}/players/${uid}/connected`);
    onDisconnect(playerRef).set(false);
    return { seat: existingPlayer.seat, uid };
  }

  if (room.state !== 'WAITING') {
    throw new Error('Game already in progress');
  }

  // Find available seat (variable player count)
  const takenSeats = new Set(
    Object.values(room.players || {}).map((p) => p.seat)
  );
  const maxSeats = room.numPlayers || 4;
  const availableSeats: number[] = Array.from({ length: maxSeats }, (_, i) => i)
    .filter((s) => !takenSeats.has(s));

  if (availableSeats.length === 0) {
    throw new Error('Room is full');
  }

  const seat = availableSeats[0];

  await update(ref(db, `rooms/${roomId}/players/${uid}`), {
    uid,
    name: playerName,
    seat,
    type: PlayerType.REMOTE,
    ready: false,
    connected: true,
  });

  const playerRef = ref(db, `rooms/${roomId}/players/${uid}/connected`);
  onDisconnect(playerRef).set(false);

  return { seat, uid };
}

/**
 * Rejoin a room after page refresh or disconnection.
 * Uses the persisted Firebase UID to find the player's existing record.
 * Returns the player's seat, uid, and host status.
 * Throws if the room doesn't exist or the player isn't in it.
 */
export async function rejoinRoom(
  roomId: string
): Promise<{ seat: number; uid: string; isHost: boolean; gameType: GameType }> {
  const uid = await signInAnon();
  const db = getDb();

  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    throw new Error('Room not found');
  }

  const room = snapshot.val() as Room;
  const existingPlayer = room.players?.[uid];

  if (!existingPlayer) {
    throw new Error('Player not found in room');
  }

  // Mark as reconnected
  await update(ref(db, `rooms/${roomId}/players/${uid}`), {
    connected: true,
  });

  // Re-register disconnect handler
  const playerRef = ref(db, `rooms/${roomId}/players/${uid}/connected`);
  onDisconnect(playerRef).set(false);

  return {
    seat: existingPlayer.seat,
    uid,
    isHost: room.hostUid === uid,
    gameType: room.gameType || GameType.WHIST,
  };
}

/**
 * Mark a player as connected and re-register the onDisconnect handler.
 * Called from multiplayer hooks when they mount (e.g. after reconnection).
 */
export async function markConnected(roomId: string, uid: string): Promise<void> {
  const db = getDb();
  const playerRef = ref(db, `rooms/${roomId}/players/${uid}/connected`);
  // Cancel any previously stacked onDisconnect handlers before registering a new one.
  // Without this, multiple calls to markConnected (joinRoom + hook mount) stack
  // server-side handlers that can fire prematurely during lobby→game transitions.
  await onDisconnect(playerRef).cancel();
  await set(playerRef, true);
  onDisconnect(playerRef).set(false);
}

/**
 * Get the current state of a room (one-time read, not a subscription).
 */
export async function getRoom(roomId: string): Promise<Room | null> {
  const db = getDb();
  const snapshot = await get(ref(db, `rooms/${roomId}`));
  if (!snapshot.exists()) return null;
  return snapshot.val() as Room;
}

export async function setReady(roomId: string, uid: string, ready: boolean): Promise<void> {
  const db = getDb();
  await update(ref(db, `rooms/${roomId}/players/${uid}`), { ready });
}

export async function fillWithAI(roomId: string): Promise<void> {
  const db = getDb();

  // Read room to get numPlayers
  const roomSnapshot = await get(ref(db, `rooms/${roomId}`));
  const room = roomSnapshot.val() as Room;
  const maxSeats = room?.numPlayers || 4;

  const playersSnapshot = await get(ref(db, `rooms/${roomId}/players`));
  const players = playersSnapshot.val() as Record<string, RoomPlayer> | null;

  const takenSeats = new Set(
    Object.values(players || {}).map((p) => p.seat)
  );

  let aiIndex = 0;

  for (let s = 0; s < maxSeats; s++) {
    if (!takenSeats.has(s)) {
      const aiKey = `ai_${s}`;
      await set(ref(db, `rooms/${roomId}/players/${aiKey}`), {
        uid: aiKey,
        name: AI_NAMES[aiIndex++ % AI_NAMES.length],
        seat: s,
        type: PlayerType.AI,
        ready: true,
        connected: true,
      });
    }
  }
}

export function subscribeToRoom(
  roomId: string,
  callback: (room: Room | null) => void
): () => void {
  const db = getDb();
  const roomRef = ref(db, `rooms/${roomId}`);

  // onValue returns an unsubscribe function in Firebase v9 modular SDK.
  // Using off(roomRef) would remove ALL listeners on this ref — unsafe.
  const unsubscribe = onValue(roomRef, (snapshot: DataSnapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val() as Room);
    } else {
      callback(null);
    }
  });

  return unsubscribe;
}

export async function leaveRoom(roomId: string, uid: string): Promise<void> {
  const db = getDb();
  await remove(ref(db, `rooms/${roomId}/players/${uid}`));
}

export async function deleteRoom(roomId: string): Promise<void> {
  const db = getDb();
  await remove(ref(db, `rooms/${roomId}`));
}
