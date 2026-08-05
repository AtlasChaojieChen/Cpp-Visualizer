# cpp-visualizer

A browser-based C++ execution visualizer. Paste C++, step through it forwards
*and backwards*, and watch the call stack, variables, heap, arrays and binary
trees change.

**There is no compiler and no backend.** A hand-written interpreter runs the
code in the browser tab. The site is a static build.

## How it works

`src/lib/cpp-engine.ts` is the entire engine: tokenizer → recursive-descent
parser → tree-walking interpreter. `executeCode(code, stdin)` is the only
public entry point.

The load-bearing design decision: **the interpreter runs the program to
completion up front**, deep-copying a full snapshot of stack, globals, heap and
output into `steps[]` at every step. The UI is just an integer index into that
array. That is why backward stepping is exact and why scrubbing is instant at
any program size (fib(15) is 5,922 steps, generated in ~160ms).

Memory addresses are simulated: allocation starts at 100 and increments by 4.
`delete` marks a block `freed` rather than removing it, which is how
use-after-free is detected and shown.

## Supported C++ subset

`int`, `float`, `double`, `char`, `bool`, `void`, `string`, `vector`, `struct`
(data only), `if`/`else`, `for`, `while`, `return`/`break`/`continue`,
`new`/`delete`, `cout`/`cin`/`endl`, pointers, `nullptr`, reference parameters,
bitwise operators, string indexing and methods.

Bitwise `& | ^ ~ << >>` and `&= |= ^= <<= >>=` at full C++ precedence, plus hex
(`0xff`) and binary (`0b1010`) literals. Operands must be integral.

String and vector methods: `size` `length` `empty` `front` `back` `clear`
`begin` `end` `erase`, plus `push_back`/`pop_back` on vectors. `s[i]` both
reads and writes. An iterator is modelled as a plain integer offset, so
`a.begin() + i` is ordinary arithmetic — but `*it` and `it++` are not modelled.

Not supported: classes with methods, templates, inheritance, operator
overloading, `map`/`set`/`sort`/`<algorithm>`, range-based `for`, `auto`,
`switch`, `do`/`while`, the ternary `?:`, multiple files, 2D arrays, array
parameters (`int a[]`), brace initialization of a stack variable
(`Node a{1, nullptr};` — the heap form `new Node{1, nullptr}` does work), and
`substr`/`find`/`insert`/`push_back` on strings. `#` lines are discarded by the
tokenizer; includes are never processed, and stream-setup statements such as
`ios::sync_with_stdio(...)` and `cin.tie(...)` are discarded as no-ops.

Unsupported input fails with a deliberate C++-level message rather than
pretending to run.

## Running locally

Requires Node.js.

```sh
npm install
npm run dev      # dev server
npm run build    # production build
```

## Tests

Two layers, sharing one set of 38 graded programs and one grading module
(`tests/classify.mjs`), so they cannot disagree.

**Standalone harness** — grades failure *mode*, not just pass/fail, ranked by
severity: `WRONG` (silent wrong answer) is worse than a hang, worse than a
leaked JS error, worse than a deliberate C++-level error.

```sh
npx esbuild src/lib/cpp-engine.ts --bundle --format=esm --outfile=tests/engine.mjs
node tests/run.mjs
```

**Vitest regression guard** — `src/test/ladder.test.ts` pins every program's
status by id, so a regression fails naming the program. It is severity-aware:
improving a program never fails the suite, regressing one always does.

```sh
./node_modules/.bin/vitest run
./node_modules/.bin/tsc --noEmit
```

Use the `node_modules/.bin/` paths. Bare `npx tsc` will silently download an
unrelated abandoned package named `tsc` and exit 0, which reads as a clean
typecheck while checking nothing.

Current state: **35/38 passing, with zero `WRONG` results** — every remaining
failure is a deliberate C++-level error on a genuinely unsupported feature
(array parameters, string indexing, 2D arrays), not a silent wrong answer.
They are catalogued in `CLAUDE.md` under "Known limitations".

## Tech stack

Vite · React 18 · TypeScript · Tailwind · shadcn/ui · Monaco editor ·
framer-motion
