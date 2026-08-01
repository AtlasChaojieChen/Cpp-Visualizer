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
