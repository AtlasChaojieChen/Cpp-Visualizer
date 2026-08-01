// Stage 5 — type tracking. See docs/type-tracking-design.md.
//
// Shipped in three independently revertible steps, in this order:
//   1. 32-bit int overflow   — narrowing at write boundaries (CoerceToDeclared)
//   2. `/=`                  — stopped truncating unconditionally
//   3. `/`                   — consults the STATIC type of the expression
//
// The value representation is unchanged: numbers are still plain JS numbers,
// so the snapshot format and every UI panel are untouched. What changed is that
// the engine now knows what type an expression HAS, rather than guessing from
// the runtime values it happens to hold.

import { describe, it, expect } from 'vitest';
import { executeCode } from '@/lib/cpp-engine';

function Run(code: string, stdin = '') {
  const result = executeCode(code, stdin);
  const last = result.steps[result.steps.length - 1];
  return { output: last ? last.output : '', error: result.error, steps: result.steps };
}

function Main(body: string, stdin = '') {
  return Run(`#include <iostream>\n#include <string>\nusing namespace std;\nint main() {\n${body}\nreturn 0;\n}`, stdin);
}

// ===================== 1. 32-bit int overflow =====================

// C++ `int` is 32-bit two's complement and wraps. JS numbers are doubles and
// do not. `| 0` in CoerceToDeclared IS that wrap, applied at the same
// declaration/assignment boundaries where char narrowing already happened.
describe('32-bit int overflow', () => {
  it('wraps INT_MAX + 1 to INT_MIN on assignment', () => {
    const { output } = Main('int x = 2147483647;\nx = x + 1;\ncout << x << endl;');
    expect(output.trim()).toBe('-2147483648');
  });

  it('wraps at the declaration boundary too', () => {
    const { output } = Main('int a = 2147483647;\nint b = a + 1;\ncout << b << endl;');
    expect(output.trim()).toBe('-2147483648');
  });

  it('wraps a compound assignment', () => {
    const { output } = Main('int x = 2147483647;\nx += 1;\ncout << x << endl;');
    expect(output.trim()).toBe('-2147483648');
  });

  it('wraps multiplication overflow', () => {
    const { output } = Main('int a = 100000;\nint b = a * a;\ncout << b << endl;');
    expect(output.trim()).toBe('1410065408');
  });

  it('wraps INT_MIN - 1 back to INT_MAX', () => {
    const { output } = Main('int x = -2147483648;\nx = x - 1;\ncout << x << endl;');
    expect(output.trim()).toBe('2147483647');
  });

  it('truncates a fractional value assigned to an int', () => {
    const { output } = Main('int x = 3.7;\ncout << x << endl;');
    expect(output.trim()).toBe('3');
  });

  it('truncates toward zero, not toward negative infinity', () => {
    const { output } = Main('int x = -3.7;\ncout << x << endl;');
    expect(output.trim()).toBe('-3');
  });

  // The narrowing is keyed on the DECLARED type, so wider types are untouched.
  it('does not wrap a double', () => {
    const { output } = Main('double d = 3000000000;\ncout << d << endl;');
    expect(output.trim()).toBe('3000000000');
  });

  it('does not wrap a double holding a fraction', () => {
    const { output } = Main('double d = 2.5;\ncout << d << endl;');
    expect(output.trim()).toBe('2.5');
  });

  it('narrows through a reference parameter', () => {
    const { output } = Run(`#include <iostream>
using namespace std;
void bump(int &r) { r = 2147483647; r = r + 1; }
int main() {
    int x = 0;
    bump(x);
    cout << x << endl;
    return 0;
}`);
    expect(output.trim()).toBe('-2147483648');
  });

  it('narrows an int array element', () => {
    const { output } = Main('int a[2];\na[0] = 2147483647;\na[0] = a[0] + 1;\ncout << a[0] << endl;');
    expect(output.trim()).toBe('-2147483648');
  });

  // Pointer values are addresses, not ints, and must survive untouched.
  it('leaves pointer values alone', () => {
    const { output } = Main('int x = 5;\nint *p = &x;\ncout << *p << endl;');
    expect(output.trim()).toBe('5');
  });

  // Guard on the Stage 4 char work: chars narrow to a char, not to an int.
  it('does not disturb char narrowing', () => {
    const { output } = Main("char c = 'a';\nchar d = c + 1;\ncout << c << \" \" << d << endl;");
    expect(output.trim()).toBe('a b');
  });

  it('does not disturb string concatenation', () => {
    const { output } = Main('string a = "hello";\nstring b = a + " world";\ncout << b << endl;');
    expect(output.trim()).toBe('hello world');
  });
});

// ===================== 2. `/=` =====================

// `/=` truncated unconditionally (`Math.trunc(cur / r)`), so it was wrong even
// when neither operand was integral. It now divides honestly and lets the
// narrowing that already ran on the result do the truncating — which means an
// int target still truncates and a double target no longer does.
describe('compound division assignment', () => {
  it('does not truncate a double target', () => {
    const { output } = Main('double d = 1;\nd /= 2;\ncout << d << endl;');
    expect(output.trim()).toBe('0.5');
  });

  it('does not truncate a double target holding a fraction', () => {
    const { output } = Main('double d = 7.5;\nd /= 3;\ncout << d << endl;');
    expect(output.trim()).toBe('2.5');
  });

  it('still truncates an int target', () => {
    const { output } = Main('int x = 7;\nx /= 2;\ncout << x << endl;');
    expect(output.trim()).toBe('3');
  });

  it('truncates an int target toward zero when negative', () => {
    const { output } = Main('int x = -7;\nx /= 2;\ncout << x << endl;');
    expect(output.trim()).toBe('-3');
  });

  it('does not truncate a double array element', () => {
    const { output } = Main('double a[1];\na[0] = 1;\na[0] /= 4;\ncout << a[0] << endl;');
    expect(output.trim()).toBe('0.25');
  });

  it('leaves the other compound operators alone', () => {
    const { output } = Main('int i = 5;\ni += 3;\ni -= 1;\ni *= 2;\ni %= 5;\ncout << i << endl;');
    expect(output.trim()).toBe('4');
  });
});

// ===================== 3. `/` =====================

// `/` guessed from the RUNTIME values: `Number.isInteger(l) && Number.isInteger(r)`.
// That is unfixable in place, because `7.0` and `7` are the same JS number by
// the time `/` sees them. `/` now asks what type the expression HAS.
describe('division uses the static type, not the runtime value', () => {
  it('does not truncate 7.0 / 2', () => {
    const { output } = Main('double d = 7.0 / 2;\ncout << d << endl;');
    expect(output.trim()).toBe('3.5');
  });

  it('does not truncate 7.0 / 2.0', () => {
    const { output } = Main('double d = 7.0 / 2.0;\ncout << d << endl;');
    expect(output.trim()).toBe('3.5');
  });

  // THE case the runtime heuristic cannot get right: both operands are declared
  // double but both hold whole numbers, so every value-based test says "integer".
  it('does not truncate when doubles happen to hold whole numbers', () => {
    const { output } = Main('double x = 7;\ndouble y = 2;\ncout << x / y << endl;');
    expect(output.trim()).toBe('3.5');
  });

  it('does not truncate a double divided by an int literal', () => {
    const { output } = Main('double x = 7;\ncout << x / 2 << endl;');
    expect(output.trim()).toBe('3.5');
  });

  it('does not truncate an int divided by a double', () => {
    const { output } = Main('int a = 7;\ndouble b = 2;\ncout << a / b << endl;');
    expect(output.trim()).toBe('3.5');
  });

  it('still truncates int / int', () => {
    const { output } = Main('int a = 7, b = 2;\ncout << a / b << endl;');
    expect(output.trim()).toBe('3');
  });

  it('still truncates integer literals', () => {
    const { output } = Main('cout << 7 / 2 << endl;');
    expect(output.trim()).toBe('3');
  });

  it('truncates int division toward zero when negative', () => {
    const { output } = Main('int a = -7, b = 2;\ncout << a / b << " " << a % b << endl;');
    expect(output.trim()).toBe('-3 -1');
  });

  // The result is floating, but the declaration boundary narrows it back.
  it('narrows a floating result assigned to an int', () => {
    const { output } = Main('int q = 7.0 / 2;\ncout << q << endl;');
    expect(output.trim()).toBe('3');
  });

  it('handles a float declaration', () => {
    const { output } = Main('float f = 7;\ncout << f / 2 << endl;');
    expect(output.trim()).toBe('3.5');
  });

  it('uses a function return type', () => {
    const { output } = Run(`#include <iostream>
using namespace std;
double half(double v) { return v / 2; }
int main() {
    cout << half(7) << endl;
    return 0;
}`);
    expect(output.trim()).toBe('3.5');
  });

  it('uses a double parameter type', () => {
    const { output } = Run(`#include <iostream>
using namespace std;
double ratio(double a, double b) { return a / b; }
int main() {
    cout << ratio(7, 2) << endl;
    return 0;
}`);
    expect(output.trim()).toBe('3.5');
  });

  it('uses a double array element type', () => {
    const { output } = Main('double a[2];\na[0] = 7;\na[1] = 2;\ncout << a[0] / a[1] << endl;');
    expect(output.trim()).toBe('3.5');
  });

  it('uses a struct member type', () => {
    const { output } = Run(`#include <iostream>
using namespace std;
struct P { double num; double den; };
int main() {
    P p;
    p.num = 7;
    p.den = 2;
    cout << p.num / p.den << endl;
    return 0;
}`);
    expect(output.trim()).toBe('3.5');
  });

  it('uses the pointee type through a dereference', () => {
    const { output } = Main('double *p = new double;\n*p = 7;\ncout << *p / 2 << endl;\ndelete p;');
    expect(output.trim()).toBe('3.5');
  });

  it('propagates through a parenthesised subexpression', () => {
    const { output } = Main('double x = 3;\ncout << (x + 1) / 2 << endl;');
    expect(output.trim()).toBe('2');
  });

  it('propagates through a cast', () => {
    const { output } = Main('int a = 7;\ncout << (double)a / 2 << endl;');
    expect(output.trim()).toBe('3.5');
  });

  it('keeps integer division inside a larger integer expression', () => {
    const { output } = Main('int a = 7;\ncout << a / 2 * 2 << endl;');
    expect(output.trim()).toBe('6');
  });
});
