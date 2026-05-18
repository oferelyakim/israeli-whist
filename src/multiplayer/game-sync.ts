import {
  ref, push, get, onChildAdded, off, update,
  DataSnapshot,
} from 'firebase/database';
import { getDb, getUid } from './firebase-config';
import { randomSeed } from '../utils/random';

export interface SyncedAction<TAction = any> {
  action: TAction;
  uid: string;
  seq: number;
  timestamp: number;
  nonce?: string;
}

export async function publishAction(
  roomId: string,
  action: any,
  seq: number,
  nonce?: string
): Promise<void> {
  const db = getDb();
  const uid = getUid();
  if (!uid) throw new Error('Not authenticated');

  const actionsRef = ref(db, `rooms/${roomId}/actions`);
  await push(actionsRef, {
    action,
    uid,
    seq,
    timestamp: Date.now(),
    ...(nonce ? { nonce } : {}),
  } satisfies SyncedAction);
}

/**
 * Publish an action with retry logic (exponential backoff).
 * Returns once the action is confirmed by Firebase.
 */
export async function publishActionWithRetry(
  roomId: string,
  action: any,
  seq: number,
  nonce?: string,
  maxRetries = 3
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await publishAction(roomId, action, seq, nonce);
      return;
    } catch (e) {
      lastError = e;
      if (attempt < maxRetries) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
      }
    }
  }
  throw lastError;
}

export async function publishStartGame(
  roomId: string,
  settings: any
): Promise<void> {
  const db = getDb();
  const seed = randomSeed();

  // Store game settings and initial seed
  await update(ref(db, `rooms/${roomId}`), {
    state: 'IN_GAME',
    settings,
  });

  // Publish DEAL action
  await publishAction(roomId, { type: 'DEAL', seed }, 1);
}

export function subscribeToActions<TAction = any>(
  roomId: string,
  startSeq: number,
  callback: (action: SyncedAction<TAction>) => void
): () => void {
  const db = getDb();
  const actionsRef = ref(db, `rooms/${roomId}/actions`);

  // Listen for new actions — filters by sequence number
  const handler = (snapshot: DataSnapshot) => {
    const data = snapshot.val() as SyncedAction<TAction>;
    if (data && data.seq >= startSeq) {
      callback(data);
    }
  };

  onChildAdded(actionsRef, handler);

  return () => off(actionsRef, 'child_added', handler);
}

export async function getActionLog<TAction = any>(roomId: string): Promise<SyncedAction<TAction>[]> {
  const db = getDb();
  const snapshot = await get(ref(db, `rooms/${roomId}/actions`));

  if (!snapshot.exists()) return [];

  const actions: SyncedAction<TAction>[] = [];
  snapshot.forEach((child) => {
    actions.push(child.val() as SyncedAction<TAction>);
  });

  return actions.sort((a, b) => a.seq - b.seq);
}

export async function getRoomSettings<TSettings = any>(roomId: string): Promise<TSettings | null> {
  const db = getDb();
  const snapshot = await get(ref(db, `rooms/${roomId}/settings`));
  if (!snapshot.exists()) return null;
  return snapshot.val() as TSettings;
}

/** Generic replay: given a factory and reducer, reconstruct state from action log */
export function replayActions<TState, TAction, TSettings>(
  createInitial: (settings: TSettings) => TState,
  reducer: (state: TState, action: TAction) => TState,
  settings: TSettings,
  actions: SyncedAction<TAction>[]
): TState {
  let state = createInitial(settings);

  for (const synced of actions) {
    try {
      state = reducer(state, synced.action);
    } catch (e) {
      console.error('Error replaying action:', synced, e);
    }
  }

  return state;
}
