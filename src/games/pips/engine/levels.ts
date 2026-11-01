import type { PipsDifficulty, PipsPuzzle } from '../types';
import { generatePuzzle } from './generate';

/**
 * Spreads neighbouring puzzle numbers to unrelated corners of the seed space.
 *
 * The difficulty is folded in, so puzzle 1 on Easy and puzzle 1 on Hard are not
 * built from the same seed — boards are generated, so the pair would otherwise
 * share a shape and look like a mistake.
 */
export function seedForLevel(index: number, difficulty: PipsDifficulty): number {
  let hash = (2166136261 ^ ((index + 1) * 31 + difficulty)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 16777619) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507) >>> 0;
  return (hash >>> 1) % 2147483647;
}

/** Boards are generated, so a puzzle is nothing but its number and difficulty. */
export function buildLevel(index: number, difficulty: PipsDifficulty): PipsPuzzle {
  return generatePuzzle(seedForLevel(index, difficulty), difficulty);
}
