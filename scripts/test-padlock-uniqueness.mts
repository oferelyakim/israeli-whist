import { padlockArchetype, type PadlockState } from '../src/games/escape-room/archetypes/multi-clue-padlock/archetype';

function matchesAll(code: number[], clues: PadlockState['clues']): boolean {
  for (const c of clues) {
    let ok = true;
    switch (c.kind) {
      case 'sumEquals':
        ok = code.reduce((a, b) => a + b, 0) === c.n;
        break;
      case 'productEquals':
        ok = code.reduce((a, b) => a * b, 1) === c.n;
        break;
      case 'parityAt':
        ok = c.parity === 'even' ? code[c.pos] % 2 === 0 : code[c.pos] % 2 === 1;
        break;
      case 'digitAt':
        ok = code[c.pos] === c.digit;
        break;
      case 'rangeAt':
        ok = code[c.pos] >= c.min && code[c.pos] <= c.max;
        break;
      case 'allDifferent':
        ok = new Set(code).size === code.length;
        break;
      case 'allSame':
        ok = new Set(code).size === 1;
        break;
      case 'containsDigit':
        ok = code.includes(c.digit);
        break;
      case 'noDigit':
        ok = !code.includes(c.digit);
        break;
      case 'compareTwo':
        if (c.rel === 'gt') ok = code[c.posA] > code[c.posB];
        else if (c.rel === 'lt') ok = code[c.posA] < code[c.posB];
        else ok = code[c.posA] === code[c.posB];
        break;
      case 'diffAbs':
        ok = Math.abs(code[c.posA] - code[c.posB]) === c.diff;
        break;
      case 'countOf':
        ok = code.filter((d) => d === c.digit).length === c.n;
        break;
    }
    if (!ok) return false;
  }
  return true;
}

function* allCodes(length: number) {
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

const difficulties = ['easy', 'medium', 'hard'] as const;
let failures = 0;
let total = 0;
const tStart = Date.now();

for (const difficulty of difficulties) {
  let nonUnique = 0;
  let trials = 0;
  let minClues = Infinity;
  let maxClues = -Infinity;
  let totalClues = 0;
  for (let seed = 1; seed <= 40; seed++) {
    trials++;
    total++;
    const state = padlockArchetype.init({ seed, difficulty });
    let matches = 0;
    for (const code of allCodes(state.codeLength)) {
      if (matchesAll(code, state.clues)) {
        matches++;
        if (matches > 1) break;
      }
    }
    if (matches !== 1) {
      nonUnique++;
      failures++;
      if (nonUnique <= 3) {
        console.log(`  FAIL [${difficulty} seed=${seed}] code=${state.code.join('')} matches=${matches} clues=${state.clues.length}`);
      }
    }
    minClues = Math.min(minClues, state.clues.length);
    maxClues = Math.max(maxClues, state.clues.length);
    totalClues += state.clues.length;
  }
  console.log(
    `[${difficulty}] ${trials} trials, ${nonUnique} non-unique, clues min/avg/max = ${minClues}/${(totalClues / trials).toFixed(1)}/${maxClues}`,
  );
}

console.log(`\nTotal: ${total} trials, ${failures} failures, ${Date.now() - tStart}ms`);
if (failures > 0) process.exit(1);
