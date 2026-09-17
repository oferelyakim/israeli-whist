import { useCallback, useEffect, useRef, useState } from 'react';
import { MahjongLayoutId, MahjongPhase } from '../types';
import type { MahjongAction, MahjongGameSettings, MahjongGameState } from '../types';
import { createInitialMahjongState, mahjongReducer } from '../engine/game-reducer';
import { saveToLeaderboard } from '../engine/leaderboard';
import type { MahjongLeaderboardEntry } from '../types';
import { randomSeed } from '../../../utils/random';

const SAVE_KEY = 'mahjong-saved-game';
const PREFS_KEY = 'mahjong-settings';

interface MahjongPrefs {
  layoutId: MahjongLayoutId;
}

export function loadPrefs(): MahjongPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as MahjongPrefs;
      if (parsed.layoutId && parsed.layoutId in MahjongLayoutId) return parsed;
    }
  } catch { /* ignore parse errors */ }
  return { layoutId: defaultLayoutForViewport() };
}

/**
 * The wide layouts scale down to ~25px tiles on a phone in portrait, so a
 * first-time player on a narrow screen gets the portrait-shaped board instead.
 * Once they pick a layout, the stored preference wins.
 */
function defaultLayoutForViewport(): MahjongLayoutId {
  try {
    const { innerWidth, innerHeight } = window;
    if (innerWidth < 700 && innerHeight > innerWidth) return MahjongLayoutId.TOWER;
  } catch { /* SSR / no window — fall through */ }
  return MahjongLayoutId.TURTLE;
}

function savePrefs(prefs: MahjongPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch { /* ignore quota errors */ }
}

function saveGame(state: MahjongGameState): void {
  try {
    // History is the bulk of the payload; undo simply doesn't survive a reload.
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...state, history: [] }));
  } catch { /* ignore quota errors */ }
}

function loadSavedGame(): MahjongGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as MahjongGameState;
    if (saved.phase !== MahjongPhase.PLAYING || saved.tiles.length === 0) return null;
    return { ...saved, history: [], selectedId: null, hintPair: null };
  } catch {
    return null;
  }
}

function clearSavedGame(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch { /* ignore */ }
}

export interface UseMahjongGameReturn {
  gameState: MahjongGameState | null;
  startGame: (settings: MahjongGameSettings) => void;
  tapTile: (tileId: string) => void;
  clearSelection: () => void;
  undo: () => void;
  hint: () => void;
  shuffle: () => void;
  newGame: (layoutId?: MahjongLayoutId) => void;
  restartSameTiles: () => void;
  canUndo: boolean;
  /** Best times for the current layout, populated when a board is cleared. */
  leaderboard: MahjongLeaderboardEntry[];
}

export function useMahjongGame(): UseMahjongGameReturn {
  const [gameState, setGameState] = useState<MahjongGameState | null>(null);
  const [leaderboard, setLeaderboard] = useState<MahjongLeaderboardEntry[]>([]);
  const settingsRef = useRef<MahjongGameSettings | null>(null);
  const gameRef = useRef<MahjongGameState | null>(null);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.phase === MahjongPhase.WON) clearSavedGame();
    else saveGame(gameState);
  }, [gameState]);

  const dispatch = useCallback((action: MahjongAction) => {
    const prev = gameRef.current;
    if (!prev) return;
    let next: MahjongGameState;
    try {
      next = mahjongReducer(prev, action);
    } catch (e) {
      console.error('Mahjong reducer error:', e);
      return;
    }
    gameRef.current = next;
    setGameState(next);

    // Recording a cleared board is a side effect of the move that cleared it,
    // so it belongs here rather than in an effect (react-x flags setState in
    // effects as a cascading render).
    if (next.phase === MahjongPhase.WON && prev.phase !== MahjongPhase.WON) {
      setLeaderboard(saveToLeaderboard(next.layoutId, next.elapsedSeconds, next.moves));
    } else if (action.type === 'RESTART_SAME_TILES' || action.type === 'DEAL') {
      // A fresh board must not carry the previous win's table into its overlay.
      setLeaderboard([]);
    }
  }, []);

  // One-second clock, paused as soon as the board is cleared. This depends on
  // the phase only — keying it to the whole state would tear down and restart
  // the interval on every move, so a fast player's clock would never tick.
  const phase = gameState?.phase ?? null;
  useEffect(() => {
    if (phase !== MahjongPhase.PLAYING) return;
    const timer = window.setInterval(() => dispatch({ type: 'TICK' }), 1000);
    return () => window.clearInterval(timer);
  }, [phase, dispatch]);

  const startGame = useCallback((settings: MahjongGameSettings) => {
    settingsRef.current = settings;
    const saved = loadSavedGame();
    if (saved) {
      const restored = { ...saved, settings };
      gameRef.current = restored;
      setGameState(restored);
      return;
    }
    const { layoutId } = loadPrefs();
    const initial = createInitialMahjongState(settings, layoutId);
    const dealt = mahjongReducer(initial, { type: 'DEAL', seed: randomSeed(), layoutId });
    gameRef.current = dealt;
    setGameState(dealt);
  }, []);

  const newGame = useCallback((layoutId?: MahjongLayoutId) => {
    const prev = gameRef.current;
    if (!prev) return;
    const nextLayout = layoutId ?? prev.layoutId;
    clearSavedGame();
    savePrefs({ layoutId: nextLayout });
    const dealt = mahjongReducer(prev, { type: 'DEAL', seed: randomSeed(), layoutId: nextLayout });
    gameRef.current = dealt;
    setGameState(dealt);
    setLeaderboard([]);
  }, []);

  return {
    gameState,
    startGame,
    tapTile: useCallback((tileId: string) => dispatch({ type: 'TAP_TILE', tileId }), [dispatch]),
    clearSelection: useCallback(() => dispatch({ type: 'CLEAR_SELECTION' }), [dispatch]),
    undo: useCallback(() => dispatch({ type: 'UNDO' }), [dispatch]),
    hint: useCallback(() => dispatch({ type: 'HINT' }), [dispatch]),
    shuffle: useCallback(() => dispatch({ type: 'SHUFFLE' }), [dispatch]),
    newGame,
    restartSameTiles: useCallback(() => dispatch({ type: 'RESTART_SAME_TILES' }), [dispatch]),
    canUndo: (gameState?.history.length ?? 0) > 0,
    leaderboard,
  };
}
