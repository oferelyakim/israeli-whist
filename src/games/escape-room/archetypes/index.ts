import type { PuzzleArchetype } from './types';
import { padlockArchetype } from './multi-clue-padlock/archetype';
import { anagramArchetype } from './anagram/archetype';
import { numberSequenceArchetype } from './number-sequence/archetype';
import { caesarArchetype } from './caesar-cipher/archetype';

export const ARCHETYPES: Record<string, PuzzleArchetype<unknown, unknown>> = {
  [padlockArchetype.id]: padlockArchetype as PuzzleArchetype<unknown, unknown>,
  [anagramArchetype.id]: anagramArchetype as PuzzleArchetype<unknown, unknown>,
  [numberSequenceArchetype.id]: numberSequenceArchetype as PuzzleArchetype<unknown, unknown>,
  [caesarArchetype.id]: caesarArchetype as PuzzleArchetype<unknown, unknown>,
};

export function getArchetype(id: string): PuzzleArchetype<unknown, unknown> | undefined {
  return ARCHETYPES[id];
}
