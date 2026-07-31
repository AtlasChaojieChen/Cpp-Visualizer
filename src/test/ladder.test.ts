// Regression guard over the 38-program ladder.
//
// Why this exists: the standalone harness (`tests/run.mjs`) reports a total —
// "29/38". A total cannot detect a swap: break A3, fix B4, still 29. This test
// pins the status of every program BY ID, so a regression fails loudly and
// names the program that broke.
//
// It is severity-aware, not exact-match. Each program must score at least as
// well as its recorded baseline (see RANK in tests/classify.mjs). Improving a
// program never fails the suite; regressing one always does. When a stage
// legitimately improves a program, update BASELINE in the same commit — that
// edit is the record of what the stage bought.
//
// This also makes CLAUDE.md's rule — "every engine change needs a test in
// src/test/" — actually enforceable, since the real coverage previously lived
// entirely outside vitest.

import { describe, it, expect } from 'vitest';
import { executeCode } from '@/lib/cpp-engine';
// @ts-expect-error — plain ESM fixtures, no type declarations by design.
import { Programs } from '../../tests/programs.js';
// @ts-expect-error — shared with tests/run.mjs; see the note there.
import { Classify, RANK } from '../../tests/classify.mjs';

type Status = 'PASS' | 'PASS-GARBAGE' | 'CLEAN-ERROR' | 'JS-ERROR' | 'WRONG';

// Verified 2026-07-31 after Stage 4 (call-depth cap, array bounds, char
// arithmetic): 33 PASS, 3 CLEAN-ERROR, 2 WRONG.
// Previously 30 PASS, 1 PASS-GARBAGE, 3 CLEAN-ERROR, 1 JS-ERROR, 3 WRONG.
const BASELINE: Record<string, Status> = {
  A1: 'WRONG',        // `/` truncates doubles — Stage 5 (design first)
  A2: 'PASS',
  A3: 'PASS',
  A4: 'PASS',
  A5: 'PASS',
  A6: 'PASS',
  A7: 'PASS',
  A8: 'PASS',
  B1: 'PASS',
  B2: 'PASS',
  B3: 'CLEAN-ERROR',  // `int a[]` params unsupported — out of scope
  B4: 'PASS',         // reference params honoured — Stage 3 (was WRONG)
  B5: 'PASS',
  B6: 'PASS',
  B7: 'PASS',
  B8: 'PASS',
  B9: 'CLEAN-ERROR',  // string indexing / .length() unsupported — out of scope
  B10: 'PASS',        // char arithmetic promotes to ASCII — Stage 4 (was WRONG)
  B11: 'WRONG',       // no 32-bit wraparound — folded into Stage 5
  B12: 'PASS',
  B13: 'CLEAN-ERROR', // 2D arrays unsupported — out of scope
  B14: 'PASS',
  C1: 'PASS',
  C2: 'PASS',
  C3: 'PASS',
  C4: 'PASS',
  C5: 'PASS',
  C6: 'PASS',
  C7: 'PASS',
  C8: 'PASS',
  D1: 'PASS',
  D2: 'PASS',
  D3: 'PASS',
  D4: 'PASS',
  D5: 'PASS',
  D6: 'PASS',         // call-depth cap, clean + deterministic — Stage 4 (was JS-ERROR)
  D7: 'PASS',         // OOB read is a clean bounds error — Stage 4 (was PASS-GARBAGE)
  D8: 'PASS',
};

const BASELINE_PASS_COUNT = 33;

interface Program {
  id: string;
  name: string;
  code: string;
  stdin?: string;
  expect: unknown;
}

const All = Programs as Program[];

function StatusOf(p: Program): Status {
  return Classify(p, executeCode(p.code, p.stdin ?? '')).status as Status;
}

describe('38-program ladder', () => {
  it('covers every program in the baseline', () => {
    expect(All.map((p) => p.id).sort()).toEqual(Object.keys(BASELINE).sort());
  });

  for (const p of All) {
    it(`${p.id} ${p.name} — at least ${BASELINE[p.id]}`, () => {
      const actual = StatusOf(p);
      const expected = BASELINE[p.id];
      // Assert on a message rather than a bare number so a failure reads as
      // "B4 regressed: PASS -> WRONG" instead of "expected 4 to be >= 0".
      const verdict =
        RANK[actual] >= RANK[expected]
          ? 'ok'
          : `${p.id} regressed: ${expected} -> ${actual}`;
      expect(verdict).toBe('ok');
    });
  }

  it(`holds at >= ${BASELINE_PASS_COUNT} passing`, () => {
    const passing = All.filter((p) => StatusOf(p) === 'PASS').length;
    expect(passing).toBeGreaterThanOrEqual(BASELINE_PASS_COUNT);
  });
});
