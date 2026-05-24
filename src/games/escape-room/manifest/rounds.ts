import type { RoundManifest } from './schema';

// 7-stage round drawing from all 4 archetypes. Difficulty rises across the round.
export const ROUND_001_CLASSIC: RoundManifest = {
  manifestVersion: 1,
  roundId: 'round-001-classic',
  displayNameKey: 'escape.round.001.name',
  stages: [
    { stageIndex: 1, archetypeId: 'anagram', difficulty: 'easy', seed: 101, hintsBudget: 3 },
    { stageIndex: 2, archetypeId: 'number-sequence', difficulty: 'easy', seed: 202, hintsBudget: 3 },
    { stageIndex: 3, archetypeId: 'multi-clue-padlock', difficulty: 'easy', seed: 303, hintsBudget: 3 },
    { stageIndex: 4, archetypeId: 'caesar-cipher', difficulty: 'easy', seed: 404, hintsBudget: 3 },
    { stageIndex: 5, archetypeId: 'anagram', difficulty: 'medium', seed: 505, hintsBudget: 3 },
    { stageIndex: 6, archetypeId: 'number-sequence', difficulty: 'medium', seed: 606, hintsBudget: 3 },
    { stageIndex: 7, archetypeId: 'multi-clue-padlock', difficulty: 'medium', seed: 707, hintsBudget: 3 },
  ],
};

export const ROUNDS: Record<string, RoundManifest> = {
  [ROUND_001_CLASSIC.roundId]: ROUND_001_CLASSIC,
};
