import type { GameType } from '../types/game-common';

const SESSION_KEY = 'whist_session';

export interface SessionData {
  roomId: string;
  uid: string;
  seat: number;
  isHost: boolean;
  gameType: GameType;
  playerName: string;
}

/**
 * Save the current multiplayer session to localStorage.
 * Allows recovery after page refresh or disconnection.
 */
export function saveSession(data: SessionData): void {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    // localStorage might be full or unavailable — silently ignore
  }
}

/**
 * Load a previously saved session from localStorage.
 * Returns null if no session exists or data is corrupt.
 */
export function loadSession(): SessionData | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SessionData;
    // Basic validation
    if (!data.roomId || !data.uid || data.seat == null) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Clear the saved session from localStorage.
 * Called when the player intentionally leaves a room or the game ends.
 */
export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // Silently ignore
  }
}
