# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## cpp-visualizer

A browser-based C++ execution visualizer. Users paste C++, step through it, and watch
the call stack, variables, heap, arrays, and trees change.

**There is no compiler and no backend.** A hand-written interpreter runs the code in
the browser tab. Deployed on Vercel as a static site.

## Commands

Package manager is **npm**. `bun.lock` was deleted and is gitignored — a second
lockfile lets `bun install` resolve a different tree than `package-lock.json`.

```sh
npm install
npm run dev        # vite dev server (port 8080)
npm run build      # production build
npm run lint       # eslint — SEE BELOW, currently red
```

`npm run lint` does not pass and never has: **61 errors, 49 of them in
`cpp-engine.ts`**, almost all `@typescript-eslint/no-explicit-any`. That is
inherent to the untagged-value design described under Architecture — "fixing" it
by adding types would contradict that design. **Lint is not part of the
verification gate.** Don't treat a red lint as something you broke, and don't do
a typing sweep to clear it unless asked.

**Verification — run all four before claiming done.** They are ordered; step 1
regenerates the bundle step 2 reads.

```sh
npx esbuild src/lib/cpp-engine.ts --bundle --format=esm --outfile=tests/engine.mjs
node tests/run.mjs                    # 38-program ladder, graded by severity
./node_modules/.bin/tsc --noEmit
./node_modules/.bin/vitest run
```

Use the `node_modules/.bin/` paths. **Never `npx tsc`** — with `node_modules`
missing, npx downloads an unrelated abandoned package called `tsc`, prints a
banner and exits 0, which reads as a clean typecheck while checking nothing.

`tests/engine.mjs` is a build artifact and gitignored. **Rebuild it before
`node tests/run.mjs`** or you are grading a stale engine — the single easiest
mistake to make here.

Narrowing the run:

```sh
./node_modules/.bin/vitest run src/test/type-tracking.test.ts   # one file
./node_modules/.bin/vitest run -t "wraps INT_MAX"               # one test by name
./node_modules/.bin/vitest                                      # watch mode
```

`tests/run.mjs` takes no filter argument — it always runs all 38 and finishes in
about a second. To debug one program, find it by id in `tests/programs.js` and
call `executeCode` on it from a vitest test instead.

## Architecture

- `src/lib/cpp-engine.ts` (~1650 lines) is the entire engine:
  tokenizer -> recursive-descent parser -> tree-walking interpreter.
  **Do not split this file without asking me first.**
- `executeCode(code, stdin)` is the only public entry point. Returns
  `{ steps: ExecutionStep[], error?: string }`.
- **The critical design decision:** the interpreter runs the program to COMPLETION
  up front, deep-copying a full snapshot of stack/globals/heap/output into `steps[]`
  at every step. The UI is just an integer index into that array.
  This is why backward stepping works and why scrubbing is instant.
  **Any change that makes execution lazy, streaming, or incremental breaks the
  entire UI model.** If you think a change requires that, stop and ask.
- Memory addresses are fake: `nextAddr` starts at 100, `allocAddr()` adds 4.
- `delete` sets `freed = true` rather than removing the heap entry, which is how
  use-after-free gets reported.
- `maxSteps = 10000` guards infinite loops; `maxCallDepth` guards runaway
  recursion. Both throw C++-level messages.
- Values are plain JS values — a char is a one-character string, a number is a JS
  number. The engine does NOT tag values with their C++ type. Where it needs a
  type it reads the DECLARED one off the AST (`StaticTypeOf` / `DeclaredTypeOf`)
  and narrows at write boundaries (`CoerceToDeclared`). Keeping values untagged
  is what keeps the snapshot format renderable; see `docs/type-tracking-design.md`
  before changing it.

## File map

- `src/lib/cpp-engine.ts` — the whole interpreter
- `src/lib/example-programs.ts` — the built-in examples, surfaced by the picker
  in the header. Two carry a `stdin` field, which the picker loads too.
- `src/lib/format.ts` — shared value/address formatting. Anything that prints a
  pointer, an argument or a return value goes through here so panels agree.
- `docs/` — `PLAN.md` is the completed bug-fix plan these stages followed, and
  the record of what the original bug list got wrong. The two design docs
  (`type-tracking-design.md`, `return-values-design.md`) cover the changes that
  needed a design before code, and both end with the approach that was taken.
- `src/pages/Index.tsx` — top-level state, playback timer, layout
- `src/components/visualizer/` — the panels (CodeEditor, CallStackView,
  VariableInspector, HeapView, ArrayVisualizer, TreeVisualizer, OutputPanel,
  ExecutionControls, HelpModal)
- `src/components/ui/` — generated shadcn. **Never edit these.**
- `tests/` — the standalone harness: `programs.js` (38 graded programs),
  `classify.mjs` (the grading logic) and `run.mjs`.
- `src/test/` — vitest. `ladder.test.ts` imports the SAME programs and the SAME
  `classify.mjs` as the harness, so the two can never disagree about what
  "passing" means.

## Supported C++ subset

int, float, double, char, bool, void, string, vector, struct (data only, no methods),
if/else/for/while, return/break/continue, new/delete, cout/cin/endl, pointers,
nullptr, reference parameters, bitwise operators.

Bitwise: `& | ^ ~ << >>` and `&= |= ^= <<= >>=`, at full C++ precedence, plus hex
(`0xff`) and binary (`0b1010`) literals. Operands must be integral — a `double`
operand is an error rather than a guess, and shift counts outside 0..31 are
rejected instead of being silently masked to 5 bits the way JS would.

`<<`/`>>` were already spoken for by `cout`/`cin`, and C++ resolves that with
precedence alone: shifts bind looser than `+`, so `parseCout`/`parseCin` read
each stream operand at **addition** precedence. `cout << a << b` is therefore two
insertions and `cout << (a << 2)` needs its parentheses — exactly as in real C++.
Do not "simplify" those two call sites back to `parseExpr`; that is the bug.

NOT supported: classes with methods, templates, inheritance, operator overloading,
map/set/sort/`<algorithm>`, range-based for, `auto`, multiple files, 2D arrays,
array parameters (`int a[]`), string indexing and `.length()`.

`#` lines are discarded by the tokenizer. Includes are never processed.

The tokenizer also discards stream-setup statements — `ios::sync_with_stdio(...)`,
`ios_base::sync_with_stdio(...)`, `cin.tie(...)`, `cout.tie(...)`, with or without a
`std::` prefix. They are no-ops for an interpreter with no real iostreams, but they
use `::`, which is outside the subset, so they used to stop the parser on the first
line of any competitive-programming paste. The match is anchored per STATEMENT, not
per line, so `ios::sync_with_stdio(0); int x = 5;` keeps the declaration, and line
numbers stay intact for the editor's highlighting.

## Known limitations — do not "discover" and silently fix these

Verified 1 August 2026, after bitwise operators. If a task touches one of these,
say so; don't fix it as a side effect of something else.

The ladder (`tests/run.mjs`) sits at **35/38**, with **zero WRONG** results —
every remaining failure is a clean C++-level error on a genuinely unsupported
feature, not a silent wrong answer.

**Unsupported features (parser + interpreter work, not bugs):**
- Array parameters `int a[]` (B3).
- String indexing and `.length()` (B9).
- 2D arrays (B13).
- Everything in the NOT-supported list above.

**Real limitations:**
- `maxSteps = 10000` caps recursion demos at about fib(16). Raising it trades
  directly against memory, since every step is a full snapshot.
- No responsive breakpoints; the 3-column layout is kept at all widths. Real,
  but a layout project rather than a bug fix.
- Out-of-bounds array access throws rather than modelling adjacent memory. That
  is deliberate for a teaching tool — see the comment on `checkIndex`.
- A `bool` does not decay to 0/1. `cout << (a == b)` prints `true`, not `1`, and
  `int r = (a == b);` stores `false` rather than `0` — `CoerceToDeclared` only
  narrows `typeof value === 'number'`, so a boolean passes through untouched.
  Found while adding bitwise operators (Aug 2026) and deliberately left alone;
  fixing it means touching how values flow into `CoerceToDeclared`, which is the
  type-tracking design, not a one-liner.

**Corrections to earlier versions of this file** — these were listed as bugs and
were either fixed or never true. Don't re-add them:
- `/` truncating doubles, `/=` truncating unconditionally, and missing 32-bit
  int overflow: fixed in Stage 5.
- Char arithmetic (`'a' + 1`), out-of-bounds reads returning `"undefined"`, and
  unbounded recursion leaking a raw JS error: fixed in Stage 4.
- `HeapView` rendering structs as `[object Object]`, boolean array cells
  rendering empty, the tree being invisible in light mode, playback locked at
  one speed, pointer args printing in decimal, and missing `aria-label`s on the
  transport buttons: fixed in Stages 1 and 2.
- Function return values not being recorded: fixed in Stage 6.
- "The scrubber is a custom div, so it has no keyboard support" was **wrong**.
  It is a shadcn/Radix `<Slider>` and has always been keyboard-accessible.
- The decimal-pointer bug was described as living only in `CallStackView`. An
  identical helper existed in `VariableInspector`; both now share `format.ts`.

## What works well — don't regress these

- Backward stepping restores state exactly, including output truncation.
- 5922 steps (fib 15) generate in ~160ms; scrubbing is instant at any size.
- The heap `FREED` state after `delete` is clear and correct.
- The infinite-loop message (`Execution limit exceeded`) is exactly right.
- BST rendering grows correctly as nodes are inserted, in both themes.
- Reference parameters alias the caller's storage, including array elements and
  struct fields, without changing the snapshot model.
- The return-value badge on a call-stack frame: it exists only on the step where
  that frame returns, so it adds no steps. Keep it that way.
- `src/test/ladder.test.ts` pins all 38 programs BY ID and is severity-aware, so
  a swap (break one, fix another) cannot hide behind an unchanged total. When a
  change legitimately improves a program, update its BASELINE in the same commit.

## Environment gotchas

- The editor is **Monaco** (`@monaco-editor/react`), not a textarea. It auto-closes
  brackets and auto-indents.
- React 18, not 19. `@types/react` is 18.x. Don't write React 19 idioms.
- **Do not upgrade dependencies.** Everything is a major version behind and that's
  fine. Upgrades are out of scope unless I explicitly ask.
- Vitest runs in `jsdom` with `globals: true` and `@` aliased to `src/`; only
  `src/**/*.{test,spec}.{ts,tsx}` is collected, so `tests/` is harness-only.
- Themes come from `next-themes` as a `dark` class on `<html>`. Anything with a
  hardcoded colour must be checked in BOTH themes — that has broken twice.
- `.gitattributes` pins text to LF in the repo. Development happens on Windows
  with `core.autocrlf=true`, so without it every commit warned about line
  endings. Don't "fix" a CRLF warning by rewriting files.
- `tasks/` and `.claude/` are gitignored local workflow, not source.
  `.claude/agents/verifier.md` defines a subagent that runs the four
  verification commands and reports a pass/fail delta; it is machine-local, so
  don't assume it exists.

## Rules

- Every engine change needs a test in `src/test/` that fails before and passes after.
- Never edit `src/components/ui/`.
- Run all four verification commands (see **Commands**) before saying you're done.
- Show me the diff before moving to the next task. One commit per logical change.
- If a task turns out to need a change to the snapshot-recording model, or to how
  types flow through `evalExpr`, stop and explain before writing code.
