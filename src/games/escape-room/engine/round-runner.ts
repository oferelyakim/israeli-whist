import type { RoundManifest, StageEntry } from '../manifest/schema';
import type { ValidateResult } from '../archetypes/types';
import { getArchetype } from '../archetypes';
import { nextSeed } from './seed';

export type RoundPhase =
  | 'IDLE'
  | 'RUNNING'
  | 'STAGE_SOLVED'
  | 'PAUSED'
  | 'ROUND_COMPLETE'
  | 'ABANDONED';

export interface PerStageState {
  archetypeStateBlob: unknown;
  hintsShown: string[];
  retries: number;
  solvedAtMs: number | null;
  lastFeedback?: string;
  stageStartElapsedMs: number;
}

export interface RoundState {
  manifest: RoundManifest;
  attemptNumber: number;
  currentStageIndex: number; // 1-based
  phase: RoundPhase;
  elapsedMs: number; // accumulated wall time, excludes PAUSED
  perStage: Record<number, PerStageState>;
}

export type RoundAction =
  | { type: 'START_ROUND'; manifest: RoundManifest; attemptNumber: number }
  | { type: 'TICK'; deltaMs: number }
  | { type: 'SUBMIT'; result: ValidateResult }
  | { type: 'ADD_HINT'; text: string }
  | { type: 'NEXT_STAGE' }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'ABANDON' }
  | { type: 'RESTART_ROUND' };

function stageEntryFor(state: RoundState, stageIndex: number): StageEntry | undefined {
  return state.manifest.stages.find((s) => s.stageIndex === stageIndex);
}

function resolveStageSeed(entry: StageEntry, attemptNumber: number): number {
  return attemptNumber <= 1 ? entry.seed : nextSeed(entry.seed, attemptNumber);
}

function initStage(entry: StageEntry, attemptNumber: number, elapsedMs: number): PerStageState {
  const ar = getArchetype(entry.archetypeId);
  if (!ar) throw new Error(`Unknown archetype: ${entry.archetypeId}`);
  const seed = resolveStageSeed(entry, attemptNumber);
  const initial = ar.init({ seed, difficulty: entry.difficulty, theme: entry.theme });
  return {
    archetypeStateBlob: ar.serialize(initial),
    hintsShown: [],
    retries: 0,
    solvedAtMs: null,
    stageStartElapsedMs: elapsedMs,
  };
}

export function createInitialState(manifest: RoundManifest, attemptNumber: number): RoundState {
  const firstEntry = manifest.stages[0];
  const elapsedMs = 0;
  return {
    manifest,
    attemptNumber,
    currentStageIndex: firstEntry.stageIndex,
    phase: 'RUNNING',
    elapsedMs,
    perStage: { [firstEntry.stageIndex]: initStage(firstEntry, attemptNumber, elapsedMs) },
  };
}

export function roundReducer(state: RoundState | null, action: RoundAction): RoundState | null {
  switch (action.type) {
    case 'START_ROUND':
      return createInitialState(action.manifest, action.attemptNumber);

    case 'RESTART_ROUND': {
      if (!state) return state;
      return createInitialState(state.manifest, state.attemptNumber + 1);
    }

    default:
      break;
  }

  if (!state) return state;

  switch (action.type) {
    case 'TICK': {
      if (state.phase !== 'RUNNING') return state;
      return { ...state, elapsedMs: state.elapsedMs + action.deltaMs };
    }

    case 'PAUSE': {
      if (state.phase !== 'RUNNING') return state;
      return { ...state, phase: 'PAUSED' };
    }

    case 'RESUME': {
      if (state.phase !== 'PAUSED') return state;
      return { ...state, phase: 'RUNNING' };
    }

    case 'ABANDON':
      return { ...state, phase: 'ABANDONED' };

    case 'SUBMIT': {
      if (state.phase !== 'RUNNING') return state;
      const stage = state.perStage[state.currentStageIndex];
      if (action.result.solved) {
        const updated: PerStageState = {
          ...stage,
          solvedAtMs: state.elapsedMs,
          lastFeedback: undefined,
        };
        return {
          ...state,
          phase: 'STAGE_SOLVED',
          perStage: { ...state.perStage, [state.currentStageIndex]: updated },
        };
      }
      const updated: PerStageState = {
        ...stage,
        retries: stage.retries + 1,
        lastFeedback: action.result.feedback,
      };
      return {
        ...state,
        perStage: { ...state.perStage, [state.currentStageIndex]: updated },
      };
    }

    case 'ADD_HINT': {
      if (state.phase !== 'RUNNING') return state;
      const stage = state.perStage[state.currentStageIndex];
      const entry = stageEntryFor(state, state.currentStageIndex);
      const budget = entry?.hintsBudget ?? 3;
      if (stage.hintsShown.length >= budget) return state;
      const updated: PerStageState = {
        ...stage,
        hintsShown: [...stage.hintsShown, action.text],
      };
      return {
        ...state,
        perStage: { ...state.perStage, [state.currentStageIndex]: updated },
      };
    }

    case 'NEXT_STAGE': {
      if (state.phase !== 'STAGE_SOLVED') return state;
      const idx = state.manifest.stages.findIndex((s) => s.stageIndex === state.currentStageIndex);
      if (idx < 0 || idx === state.manifest.stages.length - 1) {
        return { ...state, phase: 'ROUND_COMPLETE' };
      }
      const nextEntry = state.manifest.stages[idx + 1];
      return {
        ...state,
        currentStageIndex: nextEntry.stageIndex,
        phase: 'RUNNING',
        perStage: {
          ...state.perStage,
          [nextEntry.stageIndex]: initStage(nextEntry, state.attemptNumber, state.elapsedMs),
        },
      };
    }

    default:
      return state;
  }
}

export function getCurrentStageEntry(state: RoundState): StageEntry | undefined {
  return stageEntryFor(state, state.currentStageIndex);
}
