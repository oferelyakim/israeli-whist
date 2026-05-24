import { getArchetype } from '../archetypes';
import type { ArchetypeViewProps } from '../archetypes/types';
import type { RoundState } from '../engine/round-runner';
import { getCurrentStageEntry } from '../engine/round-runner';

interface StageHostProps {
  state: RoundState;
  liveArchetypeState: unknown;
  onSubmit: (input: unknown) => void;
  onRequestHint: () => void;
  disabled: boolean;
}

export function StageHost({
  state,
  liveArchetypeState,
  onSubmit,
  onRequestHint,
  disabled,
}: StageHostProps) {
  const entry = getCurrentStageEntry(state);
  if (!entry) return null;
  const ar = getArchetype(entry.archetypeId);
  if (!ar) return <div className="er-error">Unknown archetype: {entry.archetypeId}</div>;

  const stage = state.perStage[state.currentStageIndex];
  const Component = ar.Component as React.ComponentType<ArchetypeViewProps<unknown, unknown>>;

  return (
    <Component
      key={`${state.attemptNumber}:${state.currentStageIndex}`}
      state={liveArchetypeState}
      onSubmit={onSubmit}
      onRequestHint={onRequestHint}
      hintsShown={stage.hintsShown}
      disabled={disabled}
      lastFeedback={stage.lastFeedback}
    />
  );
}
