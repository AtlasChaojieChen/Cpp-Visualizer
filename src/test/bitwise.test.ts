// Bitwise operators — `& | ^ ~ << >>` and their compound assignments — plus
// the tokenizer's new habit of discarding stream-setup boilerplate.
//
// The one genuinely delicate part is `<<`/`>>`, which were already spoken for
// by `cout <<` and `cin >>`. C++ resolves this with precedence: the stream
// operators ARE `<<`/`>>`, and they bind looser than `+`, so `cout << a << b`
// is two insertions while `cout << (a << b)` needs the parentheses. The parser
// reproduces that by reading each stream operand at addition precedence.

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

// ===================== binary operators =====================

describe('bitwise binary operators', () => {
  it('ands', () => {
    expect(Main('cout << (12 & 10) << endl;').output).toBe('8\n');
  });

  it('ors', () => {
    expect(Main('cout << (12 | 10) << endl;').output).toBe('14\n');
  });

  it('xors', () => {
    expect(Main('cout << (12 ^ 10) << endl;').output).toBe('6\n');
  });

  it('shifts left', () => {
    expect(Main('cout << (3 << 4) << endl;').output).toBe('48\n');
  });

  it('shifts right', () => {
    expect(Main('cout << (48 >> 4) << endl;').output).toBe('3\n');
  });

  // C++ `>>` on a signed int is an ARITHMETIC shift: the sign bit is copied,
  // so -8 >> 1 is -4 and not a huge positive number.
  it('shifts right arithmetically on negatives', () => {
    expect(Main('int x = -8;\ncout << (x >> 1) << endl;').output).toBe('-4\n');
  });

  // `1 << 31` is INT_MIN in 32-bit two's complement, the same wrap
  // CoerceToDeclared already applies to `int`.
  it('wraps a left shift into the sign bit', () => {
    expect(Main('cout << (1 << 31) << endl;').output).toBe('-2147483648\n');
  });

  it('complements', () => {
    expect(Main('cout << (~5) << endl;').output).toBe('-6\n');
  });

  it('complements a variable', () => {
    expect(Main('int x = 0;\ncout << ~x << endl;').output).toBe('-1\n');
  });
});

// ===================== precedence =====================

describe('bitwise precedence', () => {
  // C++ order, loosest first: || && | ^ & ==/!= relational shift +- */%
  it('binds & tighter than && and looser than ==', () => {
    // 6 & 3 == 3  parses as  6 & (3 == 3)  ->  6 & 1  ->  0
    expect(Main('cout << (6 & 3 == 3) << endl;').output).toBe('0\n');
  });

  it('binds | looser than ^ and ^ looser than &', () => {
    // 1 | 2 ^ 3 & 2  ->  1 | (2 ^ (3 & 2))  ->  1 | (2 ^ 2)  ->  1
    expect(Main('cout << (1 | 2 ^ 3 & 2) << endl;').output).toBe('1\n');
  });

  it('binds shift tighter than comparison and looser than addition', () => {
    // 1 << 2 + 1  ->  1 << 3  ->  8   (the other reading gives (1 << 2) + 1 = 5)
    expect(Main('cout << (1 << 2 + 1) << endl;').output).toBe('8\n');
    // 2 << 3 == 8  ->  (2 << 3) == 8  ->  16 == 8  ->  false
    // The other reading is 2 << (3 == 8), which is 2 and therefore truthy, so
    // the branch is what tells the two parses apart.
    expect(Main('int r = 0;\nif (2 << 3 == 8) r = 1;\ncout << r << endl;').output).toBe('0\n');
  });

  it('is left-associative', () => {
    expect(Main('cout << (256 >> 2 >> 2) << endl;').output).toBe('16\n');
  });
});

// ===================== the cout / cin conflict =====================

describe('stream operators still win at statement level', () => {
  it('chains cout without swallowing the operands as shifts', () => {
    expect(Main('int a = 1;\nint b = 2;\ncout << a << b << endl;').output).toBe('12\n');
  });

  it('still lets addition bind tighter inside a cout operand', () => {
    expect(Main('cout << 1 + 2 << " " << 3 * 4 << endl;').output).toBe('3 12\n');
  });

  it('treats a parenthesised shift as a shift', () => {
    expect(Main('cout << (1 << 3) << endl;').output).toBe('8\n');
  });

  it('chains cin without swallowing the targets as shifts', () => {
    expect(Main('int a;\nint b;\ncin >> a >> b;\ncout << a + b << endl;', '4 5\n').output).toBe('9\n');
  });
});

// ===================== compound assignment =====================

describe('bitwise compound assignment', () => {
  it('supports &=, |= and ^=', () => {
    expect(Main('int x = 12;\nx &= 10;\ncout << x << endl;').output).toBe('8\n');
    expect(Main('int x = 12;\nx |= 10;\ncout << x << endl;').output).toBe('14\n');
    expect(Main('int x = 12;\nx ^= 10;\ncout << x << endl;').output).toBe('6\n');
  });

  it('supports <<= and >>=', () => {
    expect(Main('int x = 3;\nx <<= 4;\ncout << x << endl;').output).toBe('48\n');
    expect(Main('int x = 48;\nx >>= 4;\ncout << x << endl;').output).toBe('3\n');
  });

  it('narrows the result to the target type', () => {
    // The result of a bitwise op is an int; storing it into a char narrows it
    // back to a character, exactly as `+=` already did.
    expect(Main("char c = 'a';\nc &= 0xdf;\ncout << c << endl;").output).toBe('A\n');
  });
});

// ===================== operand types =====================

describe('bitwise operand handling', () => {
  it('promotes a char operand to its code', () => {
    expect(Main("char c = 'a';\ncout << (c & 1) << endl;").output).toBe('1\n');
  });

  it('promotes a bool operand', () => {
    expect(Main('bool b = true;\ncout << (b | 2) << endl;').output).toBe('3\n');
  });

  // Bitwise operators are integral-only in C++; a double operand is a compile
  // error, and this is a teaching tool, so say so rather than guessing.
  it('rejects a floating operand', () => {
    const r = Main('double d = 3.5;\ncout << (d & 1) << endl;');
    expect(r.error).toMatch(/integer operands/);
  });

  it('rejects a double even when its value happens to be whole', () => {
    const r = Main('double d = 4.0;\ncout << (d | 1) << endl;');
    expect(r.error).toMatch(/integer operands/);
  });

  // Shifting by 32 or more is undefined behaviour on a 32-bit int. JS silently
  // masks the count to 5 bits, which would quietly print a wrong answer.
  it('rejects an out-of-range shift count', () => {
    expect(Main('cout << (1 << 40) << endl;').error).toMatch(/shift count/);
    expect(Main('cout << (1 >> -1) << endl;').error).toMatch(/shift count/);
  });
});

// ===================== hex literals =====================

describe('hex and binary literals', () => {
  it('reads a hex literal', () => {
    expect(Main('cout << 0xff << endl;').output).toBe('255\n');
  });

  it('reads a binary literal', () => {
    expect(Main('cout << 0b1010 << endl;').output).toBe('10\n');
  });

  it('does not mistake a decimal for hex', () => {
    expect(Main('cout << 0 << " " << 10 << endl;').output).toBe('0 10\n');
  });
});

// ===================== a whole program =====================

describe('bitwise programs', () => {
  it('counts set bits', () => {
    const r = Main(`int n = 29;
int count = 0;
while (n > 0) {
  count += n & 1;
  n >>= 1;
}
cout << count << endl;`);
    expect(r.error).toBeUndefined();
    expect(r.output).toBe('4\n'); // 29 = 11101
  });

  it('swaps two ints with xor', () => {
    const r = Main(`int a = 3;
int b = 5;
a ^= b;
b ^= a;
a ^= b;
cout << a << " " << b << endl;`);
    expect(r.output).toBe('5 3\n');
  });
});

// ===================== ignored stream setup =====================

describe('stream-setup boilerplate is discarded', () => {
  it('ignores ios::sync_with_stdio and cin.tie', () => {
    const r = Run(`#include <bits/stdc++.h>
using namespace std;
int main() {
  ios::sync_with_stdio(0);
  cin.tie(0);
  cout << 42 << endl;
  return 0;
}`);
    expect(r.error).toBeUndefined();
    expect(r.output).toBe('42\n');
  });

  it('ignores the ios_base and comma-joined forms', () => {
    const r = Run(`#include <bits/stdc++.h>
using namespace std;
int main() {
  ios_base::sync_with_stdio(false), cin.tie(NULL);
  cout << 7 << endl;
  return 0;
}`);
    expect(r.error).toBeUndefined();
    expect(r.output).toBe('7\n');
  });

  it('ignores the std:: qualified form', () => {
    const r = Run(`int main() {
  std::ios::sync_with_stdio(false);
  std::cin.tie(nullptr);
  return 0;
}`);
    expect(r.error).toBeUndefined();
  });

  // The discard must not eat a real statement that shares the line, and it
  // must keep line numbers intact so the editor highlights the right row.
  it('does not eat real code sharing the line', () => {
    const r = Run(`#include <iostream>
using namespace std;
int main() {
  ios::sync_with_stdio(0); int x = 5;
  cout << x << endl;
  return 0;
}`);
    expect(r.error).toBeUndefined();
    expect(r.output).toBe('5\n');
  });

  it('keeps line numbers correct after a discarded line', () => {
    const r = Run(`#include <iostream>
using namespace std;
int main() {
  ios::sync_with_stdio(0);
  cout << 1 << endl;
  return 0;
}`);
    const coutStep = r.steps.find(s => s.output === '1\n');
    expect(coutStep?.line).toBe(5);
  });
});
