import { useCallback, useEffect, useReducer, useRef } from 'react';
import {
  roundReducer,
  createInitialState,
  getCurrentStageEntry,
  type RoundState,
} from '../engine/round-runner';
import { ROUNDS } from '../manifest/rounds';
import { validateManifest, type RoundManifest } from '../manifest/schema';
import { getArchetype } from '../archetypes';
import type { ValidateResult } from '../archetypes/types';

const STORAGE_KEY = 'escape-room-saved-game';

interface StoredState {
  version: 1;
  roundState: RoundState;
}

function loadFromStorage(): RoundState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredState;
    if (parsed.version !== 1) return null;
    const liveManifest = ROUNDS[parsed.roundState.manifest.roundId];
    if (!liveManifest) return null;
    return { ...parsed.roundState, manifest: liveManifest, phase: 'PAUSED' };
  } catch {
    return null;
  }
}

function saveToStorage(state: RoundState | null): void {
  try {
    if (!state || state.phase === 'ABANDONED' || state.phase === 'ROUND_COMPLETE') {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    const payload: StoredState = { version: 1, roundState: state };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / disabled — ignore */
  }
}

export function useEscapeRoomGame() {
  const [state, dispatch] = useReducer(roundReducer, null, () => loadFromStorage());
  const lastTickRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Persist whenever state changes.
  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  // RAF-driven timer that only ticks while RUNNING.
  useEffect(() => {
    function step(now: number) {
      if (lastTickRef.current == null) lastTickRef.current = now;
      const delta = now - lastTickRef.current;
      lastTickRef.current = now;
      if (delta > 0 && delta < 1000) {
        dispatch({ type: 'TICK', deltaMs: delta });
      }
      rafRef.current = requestAnimationFrame(step);
    }
    if (state?.phase === 'RUNNING') {
      lastTickRef.current = null;
      rafRef.current = requestAnimationFrame(step);
      return () => {
        if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        lastTickRef.current = null;
      };
    }
    return undefined;
  }, [state?.phase]);

  const startRound = useCallback((roundId: string) => {
    const manifest: RoundManifest | undefined = ROUNDS[roundId];
    if (!manifest) {
      console.error(`[escape-room] Unknown roundId: ${roundId}`);
      return;
    }
    const errors = validateManifest(manifest);
    if (errors.length) {
      console.error('[escape-room] Manifest errors:', errors);
      return;
    }
    dispatch({ type: 'START_ROUND', manifest, attemptNumber: 1 });
  }, []);

  const submit = useCallback(
    (input: unknown) => {
      if (!state || state.phase !== 'RUNNING') return;
      const entry = getCurrentStageEntry(state);
      if (!entry) return;
      const ar = getArchetype(entry.archetypeId);
      if (!ar) return;
      const stage = state.perStage[state.currentStageIndex];
      const live = ar.restore(stage.archetypeStateBlob);
      const result: ValidateResult = ar.validate(live, input);
      dispatch({ type: 'SUBMIT', result });
    },
    [state],
  );

  const requestHint = useCallback(() => {
    if (!state || state.phase !== 'RUNNING') return;
    const entry = getCurrentStageEntry(state);
    if (!entry) return;
    const ar = getArchetype(entry.archetypeId);
    if (!ar) return;
    const stage = state.perStage[state.currentStageIndex];
    const live = ar.restore(stage.archetypeStateBlob);
    const idx = stage.hintsShown.length;
    const hint = ar.hint(live, idx);
    dispatch({ type: 'ADD_HINT', text: hint.text });
  }, [state]);

  const nextStage = useCallback(() => dispatch({ type: 'NEXT_STAGE' }), []);
  const pause = useCallback(() => dispatch({ type: 'PAUSE' }), []);
  const resume = useCallback(() => dispatch({ type: 'RESUME' }), []);
  const abandon = useCallback(() => dispatch({ type: 'ABANDON' }), []);
  const restartRound = useCallback(() => dispatch({ type: 'RESTART_ROUND' }), []);

  const newRound = useCallback(
    (roundId: string) => {
      const manifest = ROUNDS[roundId];
      if (!manifest) return;
      dispatch({ type: 'START_ROUND', manifest, attemptNumber: 1 });
    },
    [],
  );

  const liveStageArchetypeState = ((): unknown => {
    if (!state) return null;
    const entry = getCurrentStageEntry(state);
    if (!entry) return null;
    const ar = getArchetype(entry.archetypeId);
    if (!ar) return null;
    const stage = state.perStage[state.currentStageIndex];
    return ar.restore(stage.archetypeStateBlob);
  })();

  // expose initial state factory for tests
  return {
    state,
    liveStageArchetypeState,
    startRound,
    newRound,
    submit,
    requestHint,
    nextStage,
    pause,
    resume,
    abandon,
    restartRound,
    createInitialState,
  };
}
