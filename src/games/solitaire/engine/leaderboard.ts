import type { LeaderboardEntry } from '../types';

const STORAGE_KEY = 'solitaire_leaderboard';
const MAX_ENTRIES = 10;

export function loadLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const entries: LeaderboardEntry[] = JSON.parse(raw);
    return entries.sort((a, b) => a.moves - b.moves).slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveToLeaderboard(moves: number): LeaderboardEntry[] {
  const entries = loadLeaderboard();
  const entry: LeaderboardEntry = {
    moves,
    date: new Date().toLocaleDateString(),
  };
  entries.push(entry);
  entries.sort((a, b) => a.moves - b.moves);
  const trimmed = entries.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full — ignore
  }
  return trimmed;
}
