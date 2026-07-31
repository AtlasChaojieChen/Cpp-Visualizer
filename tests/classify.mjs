// Shared grading logic for the 38-program ladder.
//
// Imported by BOTH `tests/run.mjs` (the standalone harness, which runs against
// an esbuild bundle) and `src/test/ladder.test.ts` (the vitest regression
// guard, which imports the TypeScript directly). Keeping it here means the two
// can never disagree about what "passing" means.

// Trailing whitespace per line and trailing newlines are not graded.
export function Normalize(s) {
  return String(s ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

// Heuristic: does an error message look like a leaked JS runtime error
// rather than a message the engine threw on purpose?
export const JS_ERROR_RE =
  /maximum call stack|cannot read propert|is not a function|is not defined|undefined is not|null is not/i;

// Higher is better. A stage may improve a program's status; it may never
// worsen it. Mirrors the severity order documented in run.mjs:
// WRONG (silent wrong answer) is the worst outcome, PASS the best.
export const RANK = {
  WRONG: 0,
  'JS-ERROR': 1,
  'CLEAN-ERROR': 2,
  'PASS-GARBAGE': 3,
  PASS: 4,
};

export function Classify(p, res) {
  const out = res.steps.length ? Normalize(res.steps[res.steps.length - 1].output) : '';
  const err = res.error ?? null;
  const jsLeak = err !== null && JS_ERROR_RE.test(err);
  const e = p.expect;

  if (e.output !== undefined) {
    if (err === null && out === Normalize(e.output)) return { status: 'PASS', out, err };
    if (err !== null) return { status: jsLeak ? 'JS-ERROR' : 'CLEAN-ERROR', out, err };
    return { status: 'WRONG', out, err };
  }
  if (e.errorPattern) {
    if (err !== null && e.errorPattern.test(err)) return { status: 'PASS', out, err };
    if (err !== null) return { status: jsLeak ? 'JS-ERROR' : 'CLEAN-ERROR', out, err };
    return { status: 'WRONG', out, err };
  }
  if (e.cleanError) {
    if (err !== null && !jsLeak) return { status: 'PASS', out, err };
    if (err !== null) return { status: 'JS-ERROR', out, err };
    return { status: 'WRONG', out, err }; // ran silently as if the feature were supported
  }
  if (e.either) {
    if (err !== null && !jsLeak) return { status: 'PASS', out, err };
    if (err !== null) return { status: 'JS-ERROR', out, err };
    return { status: 'PASS-GARBAGE', out, err }; // garbage output is informative too
  }
  throw new Error(`Program ${p.id} has no expectation`);
}
