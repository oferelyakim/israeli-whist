import type { MahjongLayoutId, MahjongLeaderboardEntry } from '../types';

const STORAGE_KEY = 'mahjong_leaderboard';
const MAX_ENTRIES = 10;

export function loadLeaderboard(layoutId: MahjongLayoutId): MahjongLeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const entries: MahjongLeaderboardEntry[] = JSON.parse(raw);
    return entries
      .filter((e) => e.layoutId === layoutId)
      .sort((a, b) => a.seconds - b.seconds)
      .slice(0, MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveToLeaderboard(
  layoutId: MahjongLayoutId,
  seconds: number,
  moves: number,
): MahjongLeaderboardEntry[] {
  let all: MahjongLeaderboardEntry[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) all = JSON.parse(raw);
  } catch {
    all = [];
  }

  all.push({ layoutId, seconds, moves, date: new Date().toLocaleDateString() });

  // Keep the best MAX_ENTRIES per layout so one board can't crowd out another.
  const byLayout = new Map<MahjongLayoutId, MahjongLeaderboardEntry[]>();
  for (const entry of all) {
    const bucket = byLayout.get(entry.layoutId);
    if (bucket) bucket.push(entry);
    else byLayout.set(entry.layoutId, [entry]);
  }
  const trimmed: MahjongLeaderboardEntry[] = [];
  for (const bucket of byLayout.values()) {
    bucket.sort((a, b) => a.seconds - b.seconds);
    trimmed.push(...bucket.slice(0, MAX_ENTRIES));
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // localStorage full — ignore
  }
  return loadLeaderboard(layoutId);
}
