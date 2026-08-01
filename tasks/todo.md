# cpp-visualizer — bug fix execution

Branch: `fix/stages-0-4`. Plan: `PLAN.md`. Baseline: 29/38.

Subagents edit files only; commits are made by the orchestrator, one per
logical change, so parallel agents cannot commit each other's work.

## Stage 0 — verification integrity

- [x] `npm install` (node_modules was absent — two of four checks were not running)
- [x] Pin `verifier.md` to `node_modules/.bin/{tsc,vitest}` (bare `npx tsc`
      downloaded an unrelated abandoned package and exited 0)
- [x] Extract grading logic to `tests/classify.mjs`, shared by `run.mjs` and vitest
- [x] Add `src/test/ladder.test.ts` — pins all 38 programs by id, severity-aware
- [x] Prove the guard fires (temporarily flipped A1's baseline → failed with
      `A1 regressed: PASS -> WRONG`, then reverted)
- [x] Delete `public/Index.tsx` (stale duplicate, shipped source into the build)

## Housekeeping

- [x] Rewrite README (was Lovable boilerplate with `REPLACE_WITH_PROJECT_ID`)
- [x] Strip Lovable metadata + TODOs from `index.html`, complete truncated description
- [x] og:image / twitter:image no longer point at a Lovable preview CDN — real
      1200×630 `public/og-image.png` generated and shipped, plus width/height/alt.
      **Left open deliberately:** the URLs are root-relative because no production
      domain is recorded in the repo. Make them absolute + add `og:url` once it is.

## Stage 1 — rendering one-liners

- [x] `ArrayVisualizer` — render booleans as text (React drops boolean children)
- [x] `TreeVisualizer` — theme-aware node text and edges
- [x] `Index.tsx` + `ExecutionControls` — playback speed 1x/2x/5x/20x
- [x] Shared pointer formatting helper — used in BOTH `CallStackView` and
      `VariableInspector` (bug was duplicated; CLAUDE.md names only one)
- [x] `aria-label` on the five transport buttons

## Stage 2 — heap view

- [x] Render struct fields instead of `[object Object]`
- [x] Link a pointer field to its target block; nullptr; dangling-into-freed

## Stage 3 — reference parameters

- [x] Tests first, including `swap(arr[i], arr[j])` (the case that did not exist)
- [x] Implement — `isRef` is parsed and then never read anywhere
- [x] B4 WRONG → PASS, harness ≥ 30/38

## Stage 4 — engine correctness

- [x] Call-depth cap (D6 currently leaks a raw JS error, nondeterministic steps)
- [x] Out-of-bounds read (currently the JS string `"undefined"`)
- [x] Char arithmetic (`'a' + 1` → 98, not `"a1"`) without breaking B9 concat

## Stage 4.5 — ship the dead example programs

- [x] Gate: run all ~21 through the engine, ship only verified-correct ones
- [x] Picker loads code AND stdin, resets execution state

## Stages 5 & 6 — DESIGN ONLY, awaiting approval

- [x] `docs/type-tracking-design.md` — division/doubles (needs static types)
- [x] `docs/return-values-design.md` — return values are recorded nowhere
- [x] **Approved and implemented.** Stage 5 in three commits (overflow, `/=`,
      `/`); Stage 6 in one. Both docs updated with an implemented-status header,
      and Stage 6's records the one deviation (`returnType` rides along).

## Corrections to project docs (found during execution)

- `CLAUDE.md` says the scrubber is "a custom div, so it has no keyboard
  support". It is a shadcn/Radix `<Slider>` with full keyboard support.
- `CLAUDE.md` names only `CallStackView.tsx:12` for decimal pointers; an
  identical helper existed in `VariableInspector.tsx:9`.
- `CLAUDE.md` implies pointers render as hex everywhere except the call stack;
  `VariableInspector` already rendered pointer *values* as `→ 0x…`. The leak
  was confined to frame *argument* lists.
- `PLAN.md` Stage 6 says there is "no step in which the returning frame and its
  return value coexist". Half right: `recordStep` at `cpp-engine.ts:1009` runs
  *before* the throw, so the frame **is** live in that step — the value just is
  not written into it. Stage 6 is therefore much smaller than the plan assumed.
  Recorded in `docs/return-values-design.md`.

## Review

**Every stage in `PLAN.md` is complete. Ladder: 29/38 → 35/38, WRONG 3 → 0.**

| Check | Result |
|---|---|
| Harness | 35/38 (baseline 29) |
| `tsc --noEmit` | clean |
| vitest | 140 passed, 0 failed (6 files) |

The severity breakdown matters more than the total:

| | before | after |
|---|---|---|
| PASS | 29 | 35 |
| WRONG (silent wrong answer) | 3 | **0** |
| JS-ERROR (raw JS leaked) | 1 | **0** |
| PASS-GARBAGE | 1 | 0 |
| CLEAN-ERROR | 4 | 3 |

The three remaining failures are `B3`, `B9`, `B13` — array parameters, string
indexing/`.length()`, 2D arrays. Genuinely unsupported features, each a parser +
interpreter project, explicitly out of scope in `PLAN.md`. All three fail with a
clean C++-level error, so nothing lies to the user.

### What is left

1. **Absolute `og:url` / `og:image`** once the production domain is known. This
   is the only item that needs information I do not have.
2. Out-of-scope items from `PLAN.md`, unchanged and still deliberate:
   responsive breakpoints, raising `maxSteps`, and the three unsupported
   features above.

`CLAUDE.md` was rewritten: its "Known bugs" section described mostly-repaired
bugs as current. It now records what is actually true, plus a short list of
corrections so the fixed ones do not get re-added. Its verification rule now
names `node_modules/.bin/tsc` explicitly, since bare `npx tsc` exits 0 without
checking anything.
