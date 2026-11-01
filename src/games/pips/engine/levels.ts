import { PipsDifficulty } from '../types';
import type { PipsPuzzle } from '../types';
import { generatePuzzle } from './generate';

/**
 * The difficulty curve.
 *
 * Levels are generated, not authored, so progress is stored as nothing but a
 * level number: the same index always rebuilds the same board.
 */
export function difficultyForLevel(index: number): PipsDifficulty {
  if (index < 4) return PipsDifficulty.EASY;
  if (index < 12) return PipsDifficulty.MEDIUM;
  return PipsDifficulty.HARD;
}

/** Spreads neighbouring level numbers to unrelated corners of the seed space. */
export function seedForLevel(index: number): number {
  let hash = (2166136261 ^ (index + 1)) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 16777619) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 16), 2246822507) >>> 0;
  return (hash >>> 1) % 2147483647;
}

export function buildLevel(index: number): PipsPuzzle {
  return generatePuzzle(seedForLevel(index), difficultyForLevel(index));
}
