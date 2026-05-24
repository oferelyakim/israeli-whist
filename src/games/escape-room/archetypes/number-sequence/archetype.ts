import { mulberry32, randInt, pickOne } from '../../engine/seed';
import type { ArchetypeParams, PuzzleArchetype, ValidateResult, HintResult } from '../types';
import NumberSequenceComponent from './Component';

export type SequenceRule =
  | { kind: 'arithmetic'; start: number; step: number }
  | { kind: 'geometric'; start: number; ratio: number }
  | { kind: 'fibonacci'; a: number; b: number }
  | { kind: 'quadratic'; a: number; b: number; c: number } // a*n² + b*n + c
  | { kind: 'alternating'; even: number; odd: number; startEven: boolean };

export interface NumberSequenceState {
  rule: SequenceRule;
  shown: number[];   // first N terms shown to player
  answer: number;    // (N+1)-th term
  visibleCount: number;
}

function termAt(rule: SequenceRule, idx: number): number {
  switch (rule.kind) {
    case 'arithmetic':
      return rule.start + idx * rule.step;
    case 'geometric':
      return rule.start * Math.pow(rule.ratio, idx);
    case 'fibonacci': {
      let a = rule.a;
      let b = rule.b;
      for (let i = 0; i < idx; i++) {
        const next = a + b;
        a = b;
        b = next;
      }
      return a;
    }
    case 'quadratic':
      return rule.a * idx * idx + rule.b * idx + rule.c;
    case 'alternating':
      return (idx % 2 === 0) === rule.startEven ? rule.even : rule.odd;
  }
}

function generateRule(rng: () => number, difficulty: ArchetypeParams['difficulty']): SequenceRule {
  if (difficulty === 'easy') {
    const kind = pickOne(rng, ['arithmetic', 'alternating'] as const);
    if (kind === 'arithmetic') {
      return { kind: 'arithmetic', start: randInt(rng, 1, 9), step: randInt(rng, 2, 5) };
    }
    return {
      kind: 'alternating',
      even: randInt(rng, 1, 9),
      odd: randInt(rng, 1, 9),
      startEven: rng() < 0.5,
    };
  }
  if (difficulty === 'medium') {
    const kind = pickOne(rng, ['arithmetic', 'geometric', 'fibonacci'] as const);
    if (kind === 'arithmetic') {
      return { kind: 'arithmetic', start: randInt(rng, 2, 12), step: randInt(rng, 3, 7) };
    }
    if (kind === 'geometric') {
      return { kind: 'geometric', start: randInt(rng, 1, 4), ratio: randInt(rng, 2, 3) };
    }
    return { kind: 'fibonacci', a: randInt(rng, 1, 4), b: randInt(rng, 2, 5) };
  }
  // hard
  const kind = pickOne(rng, ['geometric', 'fibonacci', 'quadratic'] as const);
  if (kind === 'geometric') {
    return { kind: 'geometric', start: randInt(rng, 2, 6), ratio: randInt(rng, 2, 4) };
  }
  if (kind === 'fibonacci') {
    return { kind: 'fibonacci', a: randInt(rng, 2, 6), b: randInt(rng, 3, 8) };
  }
  return {
    kind: 'quadratic',
    a: randInt(rng, 1, 3),
    b: randInt(rng, -3, 5),
    c: randInt(rng, -2, 5),
  };
}

function visibleCountForDifficulty(d: ArchetypeParams['difficulty']): number {
  if (d === 'easy') return 4;
  if (d === 'medium') return 5;
  return 5;
}

export const numberSequenceArchetype: PuzzleArchetype<NumberSequenceState, string> = {
  id: 'number-sequence',
  supportedDifficulties: ['easy', 'medium', 'hard'] as const,

  init(params: ArchetypeParams): NumberSequenceState {
    const rng = mulberry32(params.seed);
    let rule = generateRule(rng, params.difficulty);
    const visibleCount = visibleCountForDifficulty(params.difficulty);
    // Sanity: make sure terms don't explode (cap absolute values).
    let shown = Array.from({ length: visibleCount }, (_, i) => termAt(rule, i));
    let answer = termAt(rule, visibleCount);
    let guard = 0;
    while (
      (Math.abs(answer) > 1_000_000 ||
        shown.some((x) => Math.abs(x) > 1_000_000) ||
        !Number.isFinite(answer)) &&
      guard < 10
    ) {
      rule = generateRule(rng, params.difficulty);
      shown = Array.from({ length: visibleCount }, (_, i) => termAt(rule, i));
      answer = termAt(rule, visibleCount);
      guard++;
    }
    return { rule, shown, answer, visibleCount };
  },

  validate(state: NumberSequenceState, input: string): ValidateResult {
    const trimmed = (input || '').trim();
    if (trimmed === '') {
      return { solved: false, feedback: 'escape.numseq.feedback.empty' };
    }
    const n = Number.parseInt(trimmed, 10);
    if (!Number.isFinite(n)) {
      return { solved: false, feedback: 'escape.numseq.feedback.notANumber' };
    }
    if (n === state.answer) return { solved: true };
    return { solved: false, feedback: 'escape.numseq.feedback.try' };
  },

  hint(state: NumberSequenceState, hintIndex: number): HintResult {
    // 0: name the pattern family. 1: parity / sign. 2: reveal answer.
    if (hintIndex === 0) {
      return {
        text: `escape.numseq.hint.family|${state.rule.kind}`,
        costPoints: 10,
        exhausted: false,
      };
    }
    if (hintIndex === 1) {
      const parity = state.answer % 2 === 0 ? 'even' : 'odd';
      const sign = state.answer < 0 ? 'negative' : 'positive';
      return {
        text: `escape.numseq.hint.shape|${parity}|${sign}`,
        costPoints: 15,
        exhausted: false,
      };
    }
    return {
      text: `escape.numseq.hint.reveal|${state.answer}`,
      costPoints: 30,
      exhausted: true,
    };
  },

  serialize(s) {
    return s;
  },
  restore(b) {
    return b as NumberSequenceState;
  },

  Component: NumberSequenceComponent,
};
