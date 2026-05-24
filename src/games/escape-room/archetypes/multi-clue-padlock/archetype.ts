import { mulberry32, randInt } from '../../engine/seed';
import type { ArchetypeParams, PuzzleArchetype, ValidateResult, HintResult } from '../types';
import PadlockComponent from './Component';

type Code = readonly number[];

type Constraint =
  | { kind: 'sumEquals'; n: number }
  | { kind: 'productEquals'; n: number }
  | { kind: 'parityAt'; pos: number; parity: 'even' | 'odd' }
  | { kind: 'digitAt'; pos: number; digit: number }
  | { kind: 'rangeAt'; pos: number; min: number; max: number }
  | { kind: 'allDifferent' }
  | { kind: 'allSame' }
  | { kind: 'containsDigit'; digit: number }
  | { kind: 'noDigit'; digit: number }
  | { kind: 'compareTwo'; posA: number; posB: number; rel: 'gt' | 'lt' | 'eq' }
  | { kind: 'diffAbs'; posA: number; posB: number; diff: number }
  | { kind: 'countOf'; digit: number; n: number };

export interface PadlockState {
  code: number[];
  clues: Constraint[];
  codeLength: number;
}

// ─── Predicates ─────────────────────────────────────────────────────────────

function matches(c: Constraint, code: Code): boolean {
  switch (c.kind) {
    case 'sumEquals':
      return code.reduce((a, b) => a + b, 0) === c.n;
    case 'productEquals':
      return code.reduce((a, b) => a * b, 1) === c.n;
    case 'parityAt':
      return c.parity === 'even' ? code[c.pos] % 2 === 0 : code[c.pos] % 2 === 1;
    case 'digitAt':
      return code[c.pos] === c.digit;
    case 'rangeAt':
      return code[c.pos] >= c.min && code[c.pos] <= c.max;
    case 'allDifferent':
      return new Set(code).size === code.length;
    case 'allSame':
      return new Set(code).size === 1;
    case 'containsDigit':
      return code.includes(c.digit);
    case 'noDigit':
      return !code.includes(c.digit);
    case 'compareTwo':
      if (c.rel === 'gt') return code[c.posA] > code[c.posB];
      if (c.rel === 'lt') return code[c.posA] < code[c.posB];
      return code[c.posA] === code[c.posB];
    case 'diffAbs':
      return Math.abs(code[c.posA] - code[c.posB]) === c.diff;
    case 'countOf':
      return code.filter((d) => d === c.digit).length === c.n;
  }
}

// ─── Candidate generation ───────────────────────────────────────────────────

function* allCodes(length: number): Generator<number[]> {
  const buf = new Array<number>(length).fill(0);
  while (true) {
    yield buf.slice();
    let i = length - 1;
    while (i >= 0) {
      buf[i]++;
      if (buf[i] <= 9) break;
      buf[i] = 0;
      i--;
    }
    if (i < 0) return;
  }
}

function buildCandidatePool(code: number[]): Constraint[] {
  const sum = code.reduce((a, b) => a + b, 0);
  const product = code.reduce((a, b) => a * b, 1);
  const allDiff = new Set(code).size === code.length;
  const allSame = new Set(code).size === 1;
  const out: Constraint[] = [];

  out.push({ kind: 'sumEquals', n: sum });
  if (product < 10000) out.push({ kind: 'productEquals', n: product });
  if (allDiff) out.push({ kind: 'allDifferent' });
  if (allSame) out.push({ kind: 'allSame' });

  for (let pos = 0; pos < code.length; pos++) {
    const v = code[pos];
    out.push({ kind: 'parityAt', pos, parity: v % 2 === 0 ? 'even' : 'odd' });
    out.push({ kind: 'digitAt', pos, digit: v });
    // range bands around the digit
    if (v >= 2) out.push({ kind: 'rangeAt', pos, min: Math.max(0, v - 2), max: Math.min(9, v + 1) });
    if (v <= 7) out.push({ kind: 'rangeAt', pos, min: Math.max(0, v - 1), max: Math.min(9, v + 2) });
    // explicit lower/upper bands as ranges
    if (v >= 5) out.push({ kind: 'rangeAt', pos, min: 5, max: 9 });
    else out.push({ kind: 'rangeAt', pos, min: 0, max: 4 });
  }

  // membership
  const distinct = Array.from(new Set(code));
  for (const d of distinct) out.push({ kind: 'containsDigit', digit: d });
  for (let d = 0; d <= 9; d++) {
    if (!code.includes(d)) out.push({ kind: 'noDigit', digit: d });
  }

  // counts (only for digits that appear in the code, ≥ 2 times — otherwise containsDigit is enough)
  for (const d of distinct) {
    const n = code.filter((x) => x === d).length;
    if (n >= 2) out.push({ kind: 'countOf', digit: d, n });
  }

  // position-to-position comparisons
  for (let i = 0; i < code.length; i++) {
    for (let j = i + 1; j < code.length; j++) {
      if (code[i] > code[j]) out.push({ kind: 'compareTwo', posA: i, posB: j, rel: 'gt' });
      else if (code[i] < code[j]) out.push({ kind: 'compareTwo', posA: i, posB: j, rel: 'lt' });
      else out.push({ kind: 'compareTwo', posA: i, posB: j, rel: 'eq' });
      const diff = Math.abs(code[i] - code[j]);
      if (diff >= 1) out.push({ kind: 'diffAbs', posA: i, posB: j, diff });
    }
  }

  return out;
}

// ─── Greedy uniqueness solver ───────────────────────────────────────────────

function applyConstraint(candidates: number[][], c: Constraint): number[][] {
  return candidates.filter((code) => matches(c, code));
}

function selectClues(
  code: number[],
  pool: Constraint[],
  rng: () => number,
  options: { maxRemainingCandidates: number; maxClues: number },
): Constraint[] {
  // Shuffle pool for variety across seeds.
  const shuffled = pool.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  let candidates: number[][] = Array.from(allCodes(code.length));
  const chosen: Constraint[] = [];

  while (
    candidates.length > options.maxRemainingCandidates &&
    chosen.length < options.maxClues
  ) {
    let best: { c: Constraint; remaining: number[][] } | null = null;
    for (const c of shuffled) {
      if (chosen.includes(c)) continue;
      const remaining = applyConstraint(candidates, c);
      if (remaining.length === candidates.length) continue; // useless
      if (remaining.length === 0) continue; // shouldn't happen — pool clues are true
      if (!best || remaining.length < best.remaining.length) {
        best = { c, remaining };
        if (remaining.length <= options.maxRemainingCandidates) break;
      }
    }
    if (!best) break;
    chosen.push(best.c);
    candidates = best.remaining;
  }

  // Redundancy pass: drop any clue whose removal still keeps the candidate set within target.
  for (let i = chosen.length - 1; i >= 0; i--) {
    const trial = chosen.filter((_, idx) => idx !== i);
    let cands: number[][] = Array.from(allCodes(code.length));
    for (const c of trial) cands = applyConstraint(cands, c);
    if (cands.length <= options.maxRemainingCandidates) {
      chosen.splice(i, 1);
    }
  }

  return chosen;
}

// ─── Difficulty config ──────────────────────────────────────────────────────

function lengthForDifficulty(d: ArchetypeParams['difficulty']): number {
  if (d === 'easy') return 3;
  if (d === 'medium') return 4;
  return 5;
}

function targetsForDifficulty(d: ArchetypeParams['difficulty']) {
  // Always unique — the player should be able to solve from clues alone.
  // Hard differs by code length, not by ambiguity.
  if (d === 'easy') return { maxRemainingCandidates: 1, maxClues: 6 };
  if (d === 'medium') return { maxRemainingCandidates: 1, maxClues: 8 };
  return { maxRemainingCandidates: 1, maxClues: 10 };
}

// ─── Public API ─────────────────────────────────────────────────────────────

export const padlockArchetype: PuzzleArchetype<PadlockState, string> = {
  id: 'multi-clue-padlock',
  supportedDifficulties: ['easy', 'medium', 'hard'] as const,

  init(params: ArchetypeParams): PadlockState {
    const rng = mulberry32(params.seed);
    const codeLength = lengthForDifficulty(params.difficulty);
    const code: number[] = [];
    for (let i = 0; i < codeLength; i++) code.push(randInt(rng, 0, 9));
    const pool = buildCandidatePool(code);
    const clues = selectClues(code, pool, rng, targetsForDifficulty(params.difficulty));
    return { code, clues, codeLength };
  },

  validate(state: PadlockState, input: string): ValidateResult {
    const digits = (input || '').replace(/\D/g, '');
    if (digits.length !== state.codeLength) {
      return { solved: false, feedback: 'escape.padlock.feedback.wrongLength' };
    }
    const guess = digits.split('').map((c) => Number.parseInt(c, 10));
    const solved = guess.every((d, i) => d === state.code[i]);
    if (solved) return { solved: true };
    let correctPositions = 0;
    for (let i = 0; i < guess.length; i++) if (guess[i] === state.code[i]) correctPositions++;
    return {
      solved: false,
      feedback: 'escape.padlock.feedback.partial',
      partialProgress: correctPositions / state.codeLength,
    };
  },

  hint(state: PadlockState, hintIndex: number): HintResult {
    const revealed = Math.min(hintIndex, state.codeLength - 1);
    const masked = state.code.map((d, i) => (i <= revealed ? String(d) : '•')).join(' ');
    const exhausted = hintIndex >= state.codeLength - 1;
    return { text: `escape.padlock.hint.reveal|${masked}`, costPoints: 15, exhausted };
  },

  serialize(state) {
    return state;
  },
  restore(blob) {
    return blob as PadlockState;
  },

  Component: PadlockComponent,
};
