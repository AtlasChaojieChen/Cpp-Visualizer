# cpp-visualizer

A browser-based C++ execution visualizer. Users paste C++, step through it, and watch
the call stack, variables, heap, arrays, and trees change.

**There is no compiler and no backend.** A hand-written interpreter runs the code in
the browser tab. Deployed on Vercel as a static site.

## Architecture

- `src/lib/cpp-engine.ts` (~1250 lines) is the entire engine:
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
- `maxSteps = 10000` is the only guard against infinite loops. There is currently
  no call-depth guard (see Known bugs).

## File map

- `src/lib/cpp-engine.ts` — the whole interpreter
- `src/lib/example-programs.ts` — the 20 built-in examples
- `src/pages/Index.tsx` — top-level state, playback timer, layout
- `src/components/visualizer/` — the panels (CodeEditor, CallStackView,
  VariableInspector, HeapView, ArrayVisualizer, TreeVisualizer, OutputPanel,
  ExecutionControls, HelpModal)
- `src/components/ui/` — generated shadcn. **Never edit these.**
- `tests/` — standalone harness: `programs.js` (38 graded test programs) and
  `run.mjs`. Run with:
  `npx esbuild src/lib/cpp-engine.ts --bundle --format=esm --outfile=tests/engine.mjs && node tests/run.mjs`

## Supported C++ subset

int, float, double, char, bool, void, string, vector, struct (data only, no methods),
if/else/for/while, return/break/continue, new/delete, cout/cin/endl, pointers,
nullptr, reference parameters.

NOT supported: classes with methods, templates, inheritance, operator overloading,
map/set/sort/`<algorithm>`, range-based for, `auto`, multiple files, 2D arrays,
array parameters (`int a[]`), string indexing and `.length()`.

`#` lines are discarded by the tokenizer. Includes are never processed.

## Known bugs — do not "discover" and silently fix these

Verified July 2026. If a task touches one of these, say so; don't fix it as a
side effect of something else.

**Engine (`cpp-engine.ts`):**
- Line 962: `/` truncates doubles. `7.0/2.0` gives 3. The tokenizer parses `7.0`
  into the JS number 7, so `Number.isInteger` can't distinguish it from `7`.
  **A correct fix requires tracking static types through expression evaluation,
  which the interpreter does not currently do.** This is a design change, not a
  one-liner. Line 991 (`/=`) truncates unconditionally, which is worse.
- Char arithmetic does string concatenation: `'a' + 1` gives `"a1"`, should be 98.
  Chars are stored as JS strings.
- No 32-bit int overflow. `INT_MAX + 1` gives 2147483648, real C++ wraps negative.
- Out-of-bounds array read returns the JS string `"undefined"`.
- Unbounded recursion surfaces the raw JS error `Maximum call stack size exceeded`
  and the recorded step count is nondeterministic. Needs a call-depth cap that
  throws a C++-level message.
- `maxSteps = 10000` caps recursion demos at about fib(16).

**UI:**
- `HeapView.tsx:40` — `String(block.value)` renders every struct as the literal
  `[object Object]`. Worst bug on the site. Also no arrow is drawn between a
  pointer and its target.
- `ArrayVisualizer.tsx:63` — renders `{val}` directly. **React silently drops
  boolean children**, so `bool` arrays show as empty cells.
- `TreeVisualizer.tsx:105` — hardcoded `fill="hsl(226, 64%, 88%)"` makes the tree
  invisible in light mode.
- `Index.tsx:36` — `const [speed] = useState(500)`; the setter was never
  destructured, so playback is locked at ~2 steps/sec with no control.
- `CallStackView.tsx:12` — prints pointer args in decimal while every other panel
  uses hex; `nullptr` prints as `0`.
- Playback buttons have no `aria-label`, `title`, or text. The scrubber is a
  custom div, so it has no keyboard support.
- No responsive breakpoints; the 3-column layout is kept at all widths.

**Data model gap:** function return values are not recorded anywhere.
`StackFrameInfo` has no field for them, so frames pop silently and recursion's
most important moment is invisible. Adding this requires an engine change, a type
change, and a UI change together.

## What works well — don't regress these

- Backward stepping restores state exactly, including output truncation.
- 5922 steps (fib 15) generate in ~160ms; scrubbing is instant at any size.
- The heap `FREED` state after `delete` is clear and correct.
- The infinite-loop message (`Execution limit exceeded`) is exactly right.
- BST rendering grows correctly as nodes are inserted (in dark mode).

## Environment gotchas

- The editor is **Monaco** (`@monaco-editor/react`), not a textarea. It auto-closes
  brackets and auto-indents.
- React 18, not 19. `@types/react` is 18.x. Don't write React 19 idioms.
- **Do not upgrade dependencies.** Everything is a major version behind and that's
  fine. Upgrades are out of scope unless I explicitly ask.
- Package manager: there's both a `bun.lock` and a `package-lock.json`. Use npm.

## Rules

- Every engine change needs a test in `src/test/` that fails before and passes after.
- Never edit `src/components/ui/`.
- Run `npx tsc --noEmit` and `npx vitest run` before saying you're done.
- Show me the diff before moving to the next task. One commit per logical change.
- If a task turns out to need a change to the snapshot-recording model, or to how
  types flow through `evalExpr`, stop and explain before writing code.
