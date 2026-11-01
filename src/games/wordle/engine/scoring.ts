import type { Mark } from '../types';

/**
 * Marks a guess against the answer.
 *
 * The repeated-letter rule is the one that gets this wrong. Greens are claimed
 * FIRST and the letters they use are taken out of the pool; only then does each
 * remaining position look for a yellow. Marking left to right in one pass
 * instead would show a yellow for a letter whose only copy is already green
 * somewhere else — guess SPEED against ERASE must mark the first E yellow and
 * the second green, not both.
 */
export function markGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = new Array(guess.length).fill('absent');
  const spare = new Map<string, number>();

  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === answer[i]) marks[i] = 'correct';
    else spare.set(answer[i], (spare.get(answer[i]) ?? 0) + 1);
  }

  for (let i = 0; i < guess.length; i++) {
    if (marks[i] === 'correct') continue;
    const left = spare.get(guess[i]) ?? 0;
    if (left > 0) {
      marks[i] = 'present';
      spare.set(guess[i], left - 1);
    }
  }
  return marks;
}

const RANK: Readonly<Record<Mark, number>> = { absent: 0, present: 1, correct: 2 };

/** A key never goes backwards: once green it stays green. */
export function mergeKeyboard(
  keyboard: Readonly<Record<string, Mark>>,
  guess: string,
  marks: readonly Mark[],
): Record<string, Mark> {
  const next = { ...keyboard };
  for (let i = 0; i < guess.length; i++) {
    const letter = guess[i];
    const current = next[letter];
    if (current === undefined || RANK[marks[i]] > RANK[current]) next[letter] = marks[i];
  }
  return next;
}
