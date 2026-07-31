# Bug fix plan

Worked through in order. Each stage ends with a STOP where the original plan
demanded review; stages 5 and 6 remain **design-first and are not to be
implemented without approval**.

Baseline to beat: **29/38** in `tests/run.mjs`. No stage may reduce that number
— and see Stage 0, because the *count* alone is not a sufficient guard.

---

## Revision notes (what changed from the first draft, and why)

Four things were missing, and two were stated wrong. Recorded here so the
reasoning survives.

**Missing — verification integrity (now Stage 0).** `node_modules` was not
installed. That meant `npx tsc --noEmit` did not run the project's TypeScript:
npx fetched the unrelated abandoned `tsc@2.0.4` package from the registry,
printed a banner, and **exited 0**. Two of the four checks in `verifier.md`
were not running, and one of them was reporting success while not running.
Every acceptance criterion below rests on that suite, so it gets fixed first.

**Missing — the baseline count is a weak guard.** "Harness still 29/38" cannot
detect a swap: break A3, fix B4, still 29. The guard must be a **per-test
status map keyed by id**, not a total. Stage 0 adds it.

**Missing — `formatFrameLabel` is duplicated.** The original plan (and
`CLAUDE.md`) name only `CallStackView.tsx:12` for the decimal-pointer bug. The
identical function is also at `VariableInspector.tsx:9`. Fixing one leaves the
other. Extract a shared helper.

**Missing — `src/lib/example-programs.ts` is dead code.** 509 lines, 21
programs, exported as `EXAMPLES`, imported by nothing. It already carries
`stdin` fields on the two programs that read input, so it was clearly built for
a picker that was never wired up. This is the largest user-facing win available
and it was not in the plan at all. Now Stage 4.5.

**Wrong — the scrubber is not a custom div.** `CLAUDE.md` says "The scrubber is
a custom div, so it has no keyboard support." It is a shadcn/Radix `<Slider>`
(`ExecutionControls.tsx:67`) with full keyboard support already. Do not "fix"
it. `CLAUDE.md` should be corrected.

**Wrong — pointers are not decimal everywhere except the call stack.**
`VariableInspector` already renders pointer *values* as `→ 0x…`
(lines 75, 108). The decimal leak is confined to frame **argument** lists, via
the duplicated helper above.

---

## Ground rules for every stage

- Do not edit `src/components/ui/` (generated shadcn).
- Do not upgrade dependencies.
- Do not change the snapshot-recording model (run-to-completion, full state per
  step) without stopping to explain first. Backward stepping depends on it.
- Do not fix a bug from a later stage as a side effect of an earlier one.
- Do not modify expected values in `tests/programs.js` to make a test pass. If
  an expectation looks wrong, stop and show the reasoning.
- **Subagents edit files only. They do not run git.** Commits are made by the
  orchestrator, one per logical change, so parallel agents cannot commit each
  other's half-finished work.
- **Only one process at a time may run the esbuild bundle step**, because every
  invocation writes the same `tests/engine.mjs`. Parallel UI agents must not
  run the harness; it does not test rendering anyway.

---

## Stage 0 — verification integrity

Nothing below can be trusted until the suite is real.

1. `npm install`. (`node_modules` was absent.)
2. Fix `verifier.md` to call `node_modules/.bin/tsc` and
   `node_modules/.bin/vitest`, never bare `npx`, so a missing install fails
   loudly instead of silently passing.
3. Add `src/test/ladder.test.ts`: import `executeCode` and the 38 programs,
   classify each with the same severity logic as `tests/run.mjs`, and assert
   each id against a **recorded baseline status**. Severity-aware: a test that
   improves (WRONG → PASS) must not fail the suite, but any regression fails
   **naming the id**. This closes the count-swap hole and finally makes
   `CLAUDE.md`'s "every engine change needs a test in `src/test/`" enforceable.
4. Delete `public/Index.tsx` — a stale pre-HelpModal duplicate of
   `src/pages/Index.tsx`. Everything in `public/` is copied verbatim into the
   build, so it ships source to `/Index.tsx` on the live site.

**Acceptance:** all four checks genuinely run; `ladder.test.ts` passes at 29/38
and fails by id if any program regresses.

---

## Stage 1 — rendering one-liners

Four independent fixes across disjoint files, plus accessibility.

1. `ArrayVisualizer.tsx:63` renders `{val}` directly. React silently drops
   boolean children, so `bool` arrays show empty cells. Render booleans as
   `true`/`false`. Do not change how numbers or strings render.

2. `TreeVisualizer.tsx:105` hardcodes `fill="hsl(226, 64%, 88%)"` on node text —
   invisible in light mode. Make it theme-aware, matching how the other
   visualizer components handle theming. Do not invent a new pattern. Note the
   edge stroke colours (lines 88, 97) and the node fill (line 104) are also
   hardcoded; judge whether they read acceptably in light mode and say so.

3. `Index.tsx:36` is `const [speed] = useState(500)` — the setter was never
   destructured, so playback is locked at ~2 steps/sec. Add the setter and a
   speed selector (1× / 2× / 5× / 20×) in the execution controls, matching the
   existing shadcn component style.

4. Pointer arguments print in decimal in frame labels. Extract **one** shared
   formatting helper and use it in **both** `CallStackView.tsx:11` and
   `VariableInspector.tsx:9`. Pointers print `0x…`, `nullptr` prints
   `nullptr`, plain ints stay decimal.

5. Add `aria-label` to the playback buttons in `ExecutionControls.tsx`. They
   have no label, title, or text. The `<Slider>` is already accessible — leave
   it alone.

**Acceptance:** `tsc --noEmit` clean, ladder unchanged at 29/38, one sentence
per diff describing what it does.

---

## Stage 2 — heap view renders structs

`HeapView.tsx:40` does `String(block.value)`. For a struct `block.value` is an
object, so it renders the literal `[object Object]`. This is the worst-looking
bug on the site.

1. Render struct fields properly — name and value per field, matching the
   density of the existing heap block layout.
2. Draw a visual link when one heap block's field holds the address of another
   heap block (the `head->next` case in B7). An arrow or a highlighted address
   indicating the target is enough. Do not build a graph layout engine.

Verify against B7 by running it in the browser — the harness does not test
rendering.

**Acceptance:** B7 shows two nodes with visible `val` and `next`, and a visible
relationship between them.

---

## Stage 3 — reference parameters actually work

`int &x` parses (`isRef` is set at `cpp-engine.ts:232`) but the interpreter
never reads it, so `swap(a, b)` silently does nothing. Worst bug class on the
project: a silent wrong answer in a feature the docs list as supported.

**Write the tests FIRST**, covering both cases:
- `swap(a, b)` on plain variables (exists as B4)
- `swap(arr[i], arr[j])` on array elements — **does not exist yet and is the
  case that matters**, because it is what sorting code does, and sorting is
  this site's core demo

Before writing the fix, explain:
- Where the reference link is lost. (Line 1059 passes already-evaluated values
  to `callFunction`, so the connection to the caller's variable is gone by
  then.)
- How a reference is represented so it works for both a variable and an array
  element.
- What happens to `frame.args`, used to build the call-stack label — putting a
  raw object in there reproduces the `[object Object]` bug.

`setVar` mutates `.value` on the existing entry rather than replacing the
entry, so sharing an entry object between frames does propagate. Decide
deliberately whether that is the design you want.

**Acceptance:** both reference tests pass, ladder ≥ 30/38, nothing regresses.

---

## Stage 4 — low-risk engine correctness

1. **Call-depth cap.** Unbounded recursion surfaces the raw JS error
   `Maximum call stack size exceeded` with a nondeterministic step count. Add a
   depth limit (start at 200 frames) throwing a C++-level message in the style
   of the existing `Execution limit exceeded`, which is well worded.
   *Note the interaction:* `maxSteps = 10000` binds before depth 200 for most
   recursion, so the cap mainly converts D6's JS leak into a clean error rather
   than changing what programs can run. Do not change `maxSteps` in this stage.
2. **Out-of-bounds array read** returns the JS string `"undefined"`.
   Recommendation: throw a clean C++-level error naming the index and the
   bounds. This is a teaching tool — `"undefined"` teaches nothing, and D7
   accepts either a clean error or garbage. State the choice and the reason.
3. **Char arithmetic.** `'a' + 1` returns `"a1"` because chars are stored as JS
   strings. Should be `98`, and `char d = c + 1` should be `b`. Must not break
   string concatenation — `string c = a + " " + b` (B9) has to keep working.

**Acceptance:** D6 gives a deterministic step count and a C++-level message;
B10 outputs `98` then `b`; B9's concatenation still works; ladder ≥ 32/38.

---

## Stage 4.5 — ship the example programs

`src/lib/example-programs.ts` exports 21 working programs and nothing imports
it. Wire up a picker.

**Gate first:** run all 21 through the current engine before surfacing any of
them. Ship only the ones that produce correct output. Report which fail — do
not quietly include a broken example, and do not rewrite an example to dodge an
engine bug.

Two of them (`Input (cin)`, `Two Inputs`) carry a `stdin` field. Selecting an
example must populate the STDIN box, or those examples will look broken.

Match the existing shadcn style and the header layout in `Index.tsx`.

**Acceptance:** picker lists only verified-working examples; selecting one
loads its code *and* its stdin; `tsc` clean; ladder unchanged.

---

## Stage 5 — division and doubles (DESIGN ONLY — DO NOT IMPLEMENT)

`cpp-engine.ts:962`: `/` truncates whenever both operands are JS integers. The
tokenizer parses `7.0` into the number `7`, so `7.0/2.0` gives 3. Line 991
(`/=`) truncates unconditionally, which is worse.

Correct behaviour depends on the **declared types** of the operands, and this
interpreter does not track types through expression evaluation at all.

Produce `docs/type-tracking-design.md` comparing at least two approaches
(tagging numeric values with their C++ type at creation vs. threading a static
type through `evalExpr`), with trade-offs, the blast radius on `recordStep` and
the snapshot format, and a recommendation. Then stop.

---

## Stage 6 — return values (DESIGN ONLY — DO NOT IMPLEMENT)

Function return values are recorded nowhere. `StackFrameInfo` has no field for
them, so frames pop silently. In a recursion visualizer this is the single
biggest missed teaching opportunity — `fact(1)` returns 1 and the value's
journey back up the stack is invisible. The value *is* computed: the `Return`
case evaluates `stmt.value`, records a step, then throws it away.

**The crux, which the first draft understated:** `callFunction` pops the frame
in its `catch (ReturnSignal)` handler *before* any further step is recorded, so
there is currently no step in which the returning frame and its return value
coexist. The design must say explicitly where that step comes from — record
before the pop, or attach the value to the caller's pending expression, or
both.

Propose the change across all three layers: engine capture point,
`ExecutionStep` / `StackFrameInfo` types, and UI. Note the memory cost — every
step deep-copies the whole stack, so a new field multiplies across ~10,000
steps. Write `docs/return-values-design.md`. Then stop.

---

## Deliberately out of scope

- **Responsive breakpoints.** The 3-column `ResizablePanelGroup` layout is kept
  at all widths and is unusable on mobile. Real, but a layout project, not a
  bug fix.
- **Raising `maxSteps`.** Caps recursion demos at about fib(16). Changing it
  trades directly against memory, since every step is a full snapshot.
- **32-bit integer overflow** (B11). Wants the same type tracking as Stage 5;
  fold it into that design rather than special-casing it.
- **`int a[]` parameters** (B3), **string indexing / `.length()`** (B9), **2D
  arrays** (B13). Genuine unsupported features, not bugs. Each is a parser +
  interpreter feature in its own right.
