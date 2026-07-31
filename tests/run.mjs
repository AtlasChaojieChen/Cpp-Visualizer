// Standalone test harness for the 38-program ladder in programs.js.
// Build the engine bundle first, then run:
//   npx esbuild src/lib/cpp-engine.ts --bundle --format=esm --outfile=tests/engine.mjs
//   node tests/run.mjs
//
// Grades failure MODE, not just pass/fail. Severity order (worst first):
//   WRONG (silent wrong answer) > hang (harness stalls; last printed id is the
//   culprit) > JS-ERROR (raw JS error leaked) > CLEAN-ERROR (deliberate
//   C++-level message).

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
if (!existsSync(join(here, 'engine.mjs'))) {
  console.error('tests/engine.mjs not found. Build it first:');
  console.error('  npx esbuild src/lib/cpp-engine.ts --bundle --format=esm --outfile=tests/engine.mjs');
  process.exit(1);
}

const { executeCode } = await import('./engine.mjs');
const { Programs } = await import('./programs.js');
// Grading logic lives in classify.mjs so this harness and the vitest guard in
// src/test/ladder.test.ts can never disagree about what "passing" means.
const { Classify } = await import('./classify.mjs');

const results = [];
for (const p of Programs) {
  // Print the id BEFORE executing so a hang identifies its culprit.
  process.stdout.write(`${p.id.padEnd(4)} ${p.name.padEnd(45)} `);
  const started = Date.now();
  const res = executeCode(p.code, p.stdin ?? '');
  const ms = Date.now() - started;
  const r = Classify(p, res);
  r.id = p.id;
  r.name = p.name;
  r.steps = res.steps.length;
  r.ms = ms;
  r.expect = p.expect;
  results.push(r);
  console.log(`${r.status.padEnd(12)} ${String(r.steps).padStart(5)} steps  ${ms} ms`);
}

console.log('\n===== failures / non-clean results =====\n');
const bad = results.filter((r) => r.status !== 'PASS' && r.status !== 'PASS-GARBAGE');
for (const r of bad) {
  console.log(`--- ${r.id} ${r.name} [${r.status}]`);
  if (r.expect.output !== undefined) console.log(`  expected: ${JSON.stringify(r.expect.output)}`);
  if (r.err !== null) console.log(`  error:    ${r.err}`);
  else console.log(`  actual:   ${JSON.stringify(r.out)}`);
  console.log('');
}
for (const r of results.filter((x) => x.status === 'PASS-GARBAGE')) {
  console.log(`--- ${r.id} ${r.name} [PASS-GARBAGE] actual: ${JSON.stringify(r.out)}`);
}

const count = (s) => results.filter((r) => r.status === s).length;
console.log('\n===== summary =====');
console.log(`PASS:         ${count('PASS')} / ${results.length}`);
console.log(`PASS-GARBAGE: ${count('PASS-GARBAGE')}  (informative garbage, acceptable)`);
console.log(`WRONG:        ${count('WRONG')}  (silent wrong answer — worst severity)`);
console.log(`JS-ERROR:     ${count('JS-ERROR')}  (raw JS error leaked)`);
console.log(`CLEAN-ERROR:  ${count('CLEAN-ERROR')}  (clean C++-level error where output was expected)`);

process.exit(bad.length > 0 ? 1 : 0);
