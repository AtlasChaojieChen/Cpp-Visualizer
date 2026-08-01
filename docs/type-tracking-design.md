# Type tracking: division, doubles, and integer overflow

**Status: APPROVED AND IMPLEMENTED (31 July 2026), as Approach B in three
commits — overflow, then `/=`, then `/`.** Ladder 33 → 35/38; A1 and B11 both
`WRONG → PASS`, leaving zero WRONG results. Kept as the record of why the value
representation was left alone. Read it before changing how types are decided.

Covers Stage 5 of `PLAN.md`, and folds in 32-bit integer overflow (B11) as
`PLAN.md` asks, because it wants the same machinery.

---

## The bug

```cpp
int a = 7, b = 2;
double d = 7.0 / 2;   // C++: 3.5     engine: 3
```

`A1` is the ladder test for this and is currently the only `WRONG` result the
engine produces other than B11. `WRONG` is the worst severity in the harness —
a silent wrong answer in a teaching tool.

Two separate sites are at fault:

- **`cpp-engine.ts:1206`** — `case '/': return Number.isInteger(l) && Number.isInteger(r) ? Math.trunc(l / r) : l / r;`
  A heuristic on the *runtime* values. It is right for `7 / 2` and wrong for
  `7.0 / 2`.
- **`cpp-engine.ts:1235`** — `case '/=': nv = Math.trunc(cur / r); break;`
  Truncates unconditionally. `d /= 2` on a double is wrong even when neither
  operand looks integral. Strictly worse than 1206, and cheaper to fix.

### Why the heuristic cannot be repaired in place

The value `7.0` and the value `7` are the *same JS number* by the time `/` sees
them. The distinction is destroyed in two steps:

1. The tokenizer (line 80–83) accumulates `[\d.]` into a **string**, so the
   token still holds the lexeme `"7.0"`. So far, so good.
2. The parser (line 556) does `{ type: 'NumberLit', value: Number(p.value) }`.
   **This is where the information is lost**, and it is lost for free — the
   lexeme was right there.

So no predicate over `l` and `r` can ever be correct. C++ picks `/`'s meaning
from the operands' **static types**, and this interpreter does not compute them.

---

## What already exists

Stage 4 introduced a deliberately narrow static-type lookup for char
arithmetic (`cpp-engine.ts:792–871`):

| Member | Does |
|---|---|
| `BaseType(t)` | strips `const ` and trailing `&` |
| `ElementType(t)` | unwraps `vector<T>` |
| `MemberTypeOf(obj, m)` | struct member's declared type |
| `DeclaredTypeOf(expr)` | **the declared type of an expression, or `null`** |
| `CoerceToDeclared(t, v)` | converts a value at a declaration/assignment boundary |

`DeclaredTypeOf` handles `CharLit`, `StringLit`, `Cast`, `Identifier`,
`ArrayAccess`, `MemberAccess`, `ArrowAccess`, `Call` — every place a type was
*written down*. It is a **lookup, not an inferencer**: it has no `Binary` case,
so it cannot answer "what type is `a / b`".

Its comment says explicitly that it "does NOT thread static types through
evalExpr … so it leaves the `/`-truncation design question untouched." That was
correct scoping then. This document is that question.

`CoerceToDeclared` is the matching write-side hook, already called from
`declareVar`, `callFunction` (params and return), `CompoundAssign`, and `Deref`
assignment. **Any solution should reuse both rather than invent a parallel
mechanism.**

---

## Approach A — tag values with their type at creation

Represent every C++ numeric value as a tagged box instead of a bare JS number.

```ts
class Num { constructor(readonly v: number, readonly t: 'int' | 'double') {} }
```

`NumberLit` produces `new Num(7, 'double')` for `7.0`. Arithmetic unboxes,
applies the usual arithmetic conversions, and re-boxes. `/` truncates only when
both tags are integral.

**For it**

- Correct for values whose declared type is not reachable from the expression —
  `*p` into a `new double`, a `vector<double>` element, a value that has passed
  through several assignments.
- 32-bit overflow becomes natural: an `int`-tagged result wraps with `| 0` at
  the point of production.
- One representation, no second AST walk, no caching question.

**Against it**

- **Blast radius is the entire interpreter.** Every arithmetic case, every
  comparison (`l === r` on boxes is reference equality — silently wrong),
  `cout`, `cin`, array indexing, `%`, the increment helpers, `StepValue`,
  `CharCode`.
- **It breaks the snapshot format, which is the one thing `CLAUDE.md` protects.**
  `VariableInfo.value` would hold `Num` objects. Every panel renders values
  directly — `ArrayVisualizer`, `VariableInspector`, `HeapView`. This
  reintroduces the exact `[object Object]` class of bug Stage 2 was spent
  removing, across every panel at once.
- The fix for that is unboxing in `snapVarEntry` and the heap snapshot — but
  values nest, so it needs a recursive unwrap through arrays and struct
  objects, on **every step**. `recordStep` already deep-copies the whole world
  ~10,000 times; adding a recursive transform to it is the hottest possible
  place to add work.
- Highest regression risk against a ladder currently at 33/38, and the risk is
  concentrated in code that Stages 2, 3 and 4 just stabilised.

## Approach B — compute the static type of an expression

Leave the value representation **completely alone**. Add a pure function that
answers "what type would C++ give this expression", and consult it at the two
division sites.

This is `DeclaredTypeOf` grown a `Binary` case — i.e. promoted from a lookup to
a small inferencer, renamed `StaticTypeOf`.

```ts
// null = "not written down anywhere", falls back to today's behaviour
private StaticTypeOf(expr: ASTNode): string | null {
  switch (expr.type) {
    case 'NumberLit': return expr.isFloat ? 'double' : 'int';
    case 'Binary': {
      if (!ARITH_OPS.has(expr.operator)) return 'bool';
      const l = this.StaticTypeOf(expr.left), r = this.StaticTypeOf(expr.right);
      return this.UsualArithmeticConversions(l, r);   // double beats float beats int
    }
    case 'Unary':          return this.StaticTypeOf(expr.operand);
    case 'Assign':         return this.StaticTypeOf(expr.target);
    case 'CompoundAssign': return this.StaticTypeOf(expr.target);
    default: return this.DeclaredTypeOf(expr);        // everything Stage 4 already handles
  }
}
```

Then:

```ts
case '/': {
  const t = this.StaticTypeOf(expr);
  const integral = t ? INTEGRAL_TYPES.has(t) : Number.isInteger(l) && Number.isInteger(r);
  return integral ? Math.trunc(l / r) : l / r;
}
```

`/=` gets the same treatment against `StaticTypeOf(expr.target)`, which also
removes its unconditional truncation.

**Prerequisite, one line in the parser (556):** keep the lexeme's float-ness.

```ts
return { type: 'NumberLit', value: Number(p.value), isFloat: p.value.includes('.'), line: p.line };
```

The tokenizer already preserves the raw string, so nothing else changes. (`1e5`
is not tokenized as a float today either — the number scanner only accepts
`[\d.]`. Out of scope; note it and leave it.)

**For it**

- **The snapshot format, `recordStep`, and all four UI panels are untouched.**
  Values stay plain JS numbers. This is the decisive argument given the
  project's standing rule about the recording model.
- Mirrors how C++ actually decides: statically, from declared types. The mental
  model the tool teaches stays honest.
- Incremental and independently testable. Ship the `/=` fix, then `/`, then
  overflow; each is separately revertible.
- Reuses `DeclaredTypeOf` as its default case, so all of Stage 4's coverage
  comes along for free.

**Against it**

- **A second recursive walk.** `StaticTypeOf` re-descends subexpressions that
  `evalExpr` is already descending — O(n²) on deeply nested arithmetic.
  In practice n is a line of C++, and the walk only happens at `/` and `/=`,
  not at every operator. If it ever matters, memoise on the AST node
  (`expr._sType`): a given node's static type is fixed, because C++ is
  statically typed and this engine resolves each identifier in a function body
  to the same declared type on every call. Recursion does not change it.
  **Caveat to verify before caching:** a global and a local of different types
  sharing a name across scopes (B14 territory) is the one shape that could
  break the assumption. Do not cache until there is a test for it.
- Cannot type what was never declared — a `Deref` of a pointer stored in a
  struct field, for instance. Those return `null` and fall back to today's
  heuristic, which is no worse than the status quo. `Deref` is worth adding
  (strip one `*` off the operand's type; heap entries carry `h.type`).
- Does not fix overflow on its own — but see below, that hook already exists.

---

## 32-bit integer overflow (B11)

Independent of the division work and much smaller. Overflow is a **write-time
narrowing**, and `CoerceToDeclared` is already the write-time narrowing hook,
already called at every declaration, parameter bind, return, and compound
assignment.

```ts
if (INTEGRAL_TYPES.has(base) && typeof value === 'number') return value | 0;
```

`| 0` is exactly C++'s two's-complement wrap for 32-bit `int`. `B11` expects
`-2147483648` and would get it.

Two things to check before believing that:

1. `CoerceToDeclared` is **not** currently called on a plain `Assign`
   (line 1223–1227 assigns the raw value), only on `CompoundAssign`. Plain
   assignment would need routing through it too — which is arguably a
   correctness fix in its own right, since `int x; x = 3.7;` should store `3`.
2. `long long` must not wrap. It is not in the supported subset today, so
   `INTEGRAL_TYPES` should list `int`/`short`/`char`-like types explicitly
   rather than "anything not float".

This can ship **before** the division work and is worth doing first: it is
smaller, it is separately testable, and it moves B11 `WRONG → PASS`.

---

## Recommendation

**Approach B, sequenced in three independently revertible commits:**

1. **Overflow.** Extend `CoerceToDeclared` with `| 0`, route plain `Assign`
   through it. Fixes B11. No new machinery.
2. **`/=`.** Consult `DeclaredTypeOf(expr.target)` — which already exists, so
   this needs no new function at all — and stop truncating unconditionally.
3. **`/`.** Add `isFloat` to `NumberLit`, grow `DeclaredTypeOf` into
   `StaticTypeOf` with `Binary`/`Unary`/`Assign`/`Deref` cases, route `/`
   through it. Fixes A1.

Approach A is the more principled model and the one a real interpreter would
use. It is the wrong trade here specifically because the value representation
*is* the snapshot format in this codebase, so retagging values means rewriting
the UI contract — a far larger project than the bug justifies, aimed at a
codebase whose ladder was just brought from 29 to 33.

Expected ladder after all three: **35/38**, with A1 and B11 moving
`WRONG → PASS` and zero `WRONG` results remaining. The three residual failures
(B3, B9, B13) are the genuinely-unsupported features `PLAN.md` puts out of
scope.

## Tests to write first

Per `CLAUDE.md`, in `src/test/`, failing before and passing after:

- `7.0 / 2` → `3.5`; `7 / 2` → `3`; `a / b` with both `int` → `3`
- `double d = 1; d /= 2;` → `0.5` (the `/=` case, currently `0`)
- `int q = 7.0 / 2;` → `3` (narrowing at the declaration boundary still applies)
- `-7 / 2` → `-3` (trunc toward zero, not floor — B12 guards this today)
- `INT_MAX + 1` → `-2147483648`; `int x = 3.7` → `3`
- Char arithmetic and string concat unchanged — B9 and B10 must not move
