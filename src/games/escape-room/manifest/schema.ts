import type { ArchetypeId, Difficulty } from '../types';
import { ARCHETYPES } from '../archetypes';

export interface StageEntry {
  stageIndex: number;
  archetypeId: ArchetypeId;
  difficulty: Difficulty;
  seed: number;
  theme?: string;
  hintsBudget?: number;
  parTimeSeconds?: number;
}

export interface RoundManifest {
  manifestVersion: 1;
  roundId: string;
  displayNameKey: string;
  themeKey?: string;
  stages: StageEntry[];
}

export function validateManifest(m: RoundManifest): string[] {
  const errors: string[] = [];
  if (m.manifestVersion !== 1) errors.push(`Unknown manifestVersion ${m.manifestVersion}`);
  if (!Array.isArray(m.stages) || m.stages.length === 0) {
    errors.push('stages must be a non-empty array');
    return errors;
  }
  m.stages.forEach((s, i) => {
    const ar = ARCHETYPES[s.archetypeId];
    if (!ar) {
      errors.push(`stage[${i}] unknown archetypeId "${s.archetypeId}"`);
      return;
    }
    if (!ar.supportedDifficulties.includes(s.difficulty)) {
      errors.push(`stage[${i}] archetype "${s.archetypeId}" does not support difficulty "${s.difficulty}"`);
    }
  });
  return errors;
}
