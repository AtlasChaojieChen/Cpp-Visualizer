# Recording function return values

**Status: APPROVED AND IMPLEMENTED (31 July 2026), as Option 1.** Step counts
are unchanged, which was the deciding constraint.

**One deviation from this design:** the frame also records `returnType`. This
doc assumed the shared formatter could work from the value alone, but a bare
value carries no type — the integer 104 and a pointer to address 104 are
indistinguishable. `args` recovers this from `variables[i]`; a return value has
no such counterpart, so the type is recorded alongside it under the same
conditional spread.

Covers Stage 6 of `PLAN.md`.

---

## The gap

`StackFrameInfo` has `name`, `args`, `variables`, `startLine`, `endLine`,
`activeLine`, `activeCallColumns`. There is **no field for a return value**, and
nothing anywhere in `ExecutionStep` records one.

The value is computed and then discarded (`cpp-engine.ts:1007–1011`):

```ts
case 'Return': {
  const val = stmt.value ? this.evalExpr(stmt.value) : undefined;
  this.recordStep(stmt.line);
  throw new ReturnSignal(val);
}
```

`val` exists, a step is recorded, and `val` is not in it. It travels inside the
thrown `ReturnSignal` to `callFunction`'s handler (line 984), which pops the
frame and hands the value to the caller's expression — where it becomes an
anonymous intermediate.

So in a recursion demo, `fact(1)` returning `1` and that `1` climbing back up
five frames — the single thing the visualizer exists to show — is invisible. The
frames just vanish one by one.

---

## Correction to `PLAN.md`

`PLAN.md` states the crux as:

> `callFunction` pops the frame in its `catch (ReturnSignal)` handler *before*
> any further step is recorded, so there is currently no step in which the
> returning frame and its return value coexist.

**The first half is true and the conclusion does not follow.** `recordStep` at
line 1009 runs *before* the throw, so the returning frame **is** still on the
call stack in that step — it is the top frame, sitting on its `return` line.
There is already a step where the frame is live at the moment of return. The
value simply is not written into it.

That makes this a much smaller change than the plan anticipated. There is no
need to invent a new step, restructure `callFunction`, or defer the pop.

---

## Where the value goes

Three candidate capture points, as `PLAN.md` asks.

### Option 1 — attach to the returning frame, at the existing return step

Put the value on the `Frame` before `recordStep`, so `recordStep`'s existing
`callStack.map` picks it up with no special-casing:

```ts
case 'Return': {
  const val = stmt.value ? this.evalExpr(stmt.value) : undefined;
  const rt = this.functions.get(this.currentFrame().name)?.returnType;
  this.currentFrame().returnValue = rt ? this.CoerceToDeclared(rt, val) : val;
  this.recordStep(stmt.line);
  throw new ReturnSignal(val);
}
```

Reads as: *"`fact` is on line 6, about to return `1`."* Exactly the teaching
moment, at the exact frame, on the exact line.

**Note the `CoerceToDeclared`.** `callFunction:984` narrows the value to the
function's return type *after* the throw. Recording the raw `val` would show
`98` on a step where the caller actually receives `'b'` — reintroducing the
Stage 4 char inconsistency in the UI only. Coercing at the capture point using
`functions.get(currentFrame().name).returnType` keeps the displayed value and
the delivered value identical. This is the one detail that is easy to miss and
would produce a subtly lying visualizer.

`returnValue` is set on a frame that is popped microseconds later, so it can
never go stale, and no reset logic is needed.

### Option 2 — attach to the caller's pending expression

Record a step *after* the pop, in `callFunction`'s handler, marking the caller's
frame with "the call you are waiting on just produced X".

Shows the value arriving rather than departing, which is the other half of the
story. But it **adds a step per function call** — changing the total step count
of every program with a function in it. That silently shifts every ladder
program's step count and rewrites the baseline that Stage 0 exists to protect,
for a moment the UI mostly already conveys: the caller's next recorded step
shows the assignment landing (`int r = fact(3);` records after `r` is set, so
`r = 6` is already visible).

### Option 3 — both

Everything in Option 1, plus a transient "last returned value" on the caller
frame set in `callFunction`'s handler and cleared on the caller's next recorded
step. No extra steps, but it needs explicit clearing — and a missed clear leaves
a stale badge sitting on a frame, which is a worse failure than showing nothing.

### Recommendation

**Option 1.** It is a three-line engine change, adds no steps, cannot go stale,
needs no new step-recording machinery, and captures the moment that matters. If
it proves insufficient after using it, Option 3 is a strictly additive follow-up.

---

## The three layers

### 1. Engine (`cpp-engine.ts`)

- `interface Frame` (line 652): add `returnValue?: any`.
- `case 'Return'` (line 1007): the three lines above.
- `recordStep` (line 1477): add to the frame map, **conditionally**:

  ```ts
  ...(frame.returnValue !== undefined ? { returnValue: frame.returnValue } : {}),
  ```

  Matching the existing conditional-spread style at `snapVarEntry:1468`.
- Return values that are objects (a struct returned by value) must be copied,
  not aliased — same rule `snapVarEntry:1463` already follows.

### 2. Types

- `StackFrameInfo` (line 20): add `returnValue?: any`.

Note `void` functions and a bare `return;` leave `val === undefined`, which the
conditional spread naturally omits. `main`'s `return 0` will show — harmless,
and arguably correct.

### 3. UI (`CallStackView.tsx`)

- Render a badge on the frame — `→ returns 6` — when `returnValue !== undefined`.
- **Format it through the shared pointer helper from Stage 1**, not
  `String(...)`. A pointer return value must print `0x…` like everywhere else,
  and `nullptr` must print `nullptr`.
- **A struct returned by value is an object.** `String(obj)` gives
  `[object Object]` — the exact bug Stage 2 was spent removing from `HeapView`.
  Reuse the field-rendering that Stage 2 built rather than writing a third
  value-to-text path.

---

## Memory cost

`recordStep` deep-copies the whole world at every step, so a new field
multiplies by steps × frames. The conditional spread keeps this near zero: the
key exists only on a frame that is actively returning — **at most one frame per
step, and only on the steps that are return statements**. For fib(15) (5,922
steps) that is a few hundred extra primitive-valued properties, not 5,922 ×
depth. This is why the conditional spread matters and is not cosmetic.

A struct returned by value costs one shallow object copy on those same steps.
Acceptable; note it.

---

## Tests to write first

Per `CLAUDE.md`, in `src/test/`, failing before and passing after:

- `int f() { return 42; }` — the step on the `return` line has
  `returnValue === 42` on the top frame
- `fact(3)` — **four** frames each record their own `returnValue` (1, 1, 2, 6)
  at their own return steps; assert per depth, since this is the whole point
- `void g() { return; }` and a bare fall-off-the-end — `returnValue` is absent,
  not `undefined`-valued, on every step
- `char f() { return c + 1; }` — the recorded value is `'b'`, **not** `98`
  (the `CoerceToDeclared` case above; this test is the reason it is in the design)
- A pointer return — `returnValue` is the numeric address, and `CallStackView`
  renders it hex
- **Step count is unchanged** for every ladder program. Assert this explicitly;
  it is what distinguishes Option 1 from Option 2 and it is what protects the
  Stage 0 baseline.
- Backward stepping still restores exactly — step to a return, step back, step
  forward, same snapshot
