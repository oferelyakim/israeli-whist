import type { ComponentType } from 'react';
import type { ArchetypeId, Difficulty } from '../types';

export interface ArchetypeParams {
  seed: number;
  difficulty: Difficulty;
  theme?: string;
  copyOverrides?: Record<string, string>;
}

export interface HintResult {
  text: string;
  costPoints: number;
  exhausted: boolean;
}

export interface ValidateResult {
  solved: boolean;
  feedback?: string;
  partialProgress?: number;
}

export interface ArchetypeViewProps<S, I> {
  state: S;
  onSubmit: (input: I) => void;
  onRequestHint: () => void;
  hintsShown: ReadonlyArray<string>;
  disabled: boolean;
  lastFeedback?: string;
}

export interface PuzzleArchetype<S = unknown, I = unknown> {
  id: ArchetypeId;
  supportedDifficulties: ReadonlyArray<Difficulty>;
  init(params: ArchetypeParams): S;
  validate(state: S, input: I): ValidateResult;
  hint(state: S, hintIndex: number): HintResult;
  serialize(state: S): unknown;
  restore(blob: unknown): S;
  Component: ComponentType<ArchetypeViewProps<S, I>>;
}
