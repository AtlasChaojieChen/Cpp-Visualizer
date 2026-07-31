// Three independent correctness fixes to the interpreter, plus the one
// prerequisite each of them dragged in. Every block below fails on the parent
// commit and passes here.
//
//   1. Call-depth cap        — D6 leaked the raw JS "Maximum call stack size
//                              exceeded" and recorded a nondeterministic number
//                              of steps.
//   2. Array bounds checking — D7 read past the end and printed the JS string
//                              "undefined"; writes past the end silently grew
//                              the underlying JS array.
//   3. Char arithmetic       — B10: `'a' + 1` concatenated to "a1" because
//                              chars are stored as one-character JS strings.
//
// Fix 3's design note: chars are STILL one-character JS strings. Nothing about
// the snapshot format changed. What changed is (a) `+`/`-` consult the DECLARED
// type of their operands — a lookup of types that were already stored, not an
// inferencer threaded through evalExpr — and (b) values narrow at declaration
// and assignment boundaries, which is what C++ itself does. The `/`-truncation
// design question is deliberately untouched; see the `/` guard test at the end.

import { describe, it, expect } from 'vitest';
import { executeCode } from '@/lib/cpp-engine';

function Run(code: string, stdin = '') {
  const result = executeCode(code, stdin);
  const last = result.steps[result.steps.length - 1];
  return { output: last ? last.output : '', error: result.error, steps: result.steps };
}

// Most cases only need a main() body.
function Main(body: string, stdin = '') {
  return Run(`#include <iostream>\n#include <string>\nusing namespace std;\nint main() {\n${body}\nreturn 0;\n}`, stdin);
}

// ===================== 1. call-depth cap =====================

describe('call-depth cap', () => {
  const Boom = `#include <iostream>
using namespace std;
int boom(int n) { return boom(n + 1); }
int main() {
    cout << boom(1) << endl;
    return 0;
}`;

  it('reports unbounded recursion as a C++-level error, not a JS stack overflow', () => {
    const { error } = Run(Boom);
    expect(error).toBeDefined();
    expect(error).not.toMatch(/maximum call stack/i);
    expect(error).toMatch(/call depth limit exceeded/i);
    expect(error).toMatch(/boom/);
  });

  it('records a deterministic step count across runs', () => {
    const counts = [0, 1, 2].map(() => executeCode(Boom).steps.length);
    expect(counts[0]).toBe(counts[1]);
    expect(counts[1]).toBe(counts[2]);
    // The cap is 200 frames and each call records one step on entry.
    expect(counts[0]).toBe(200);
  });

  it('leaves legitimately deep recursion alone', () => {
    // 60 frames — well past anything the previous JS stack overflow implied,
    // well under the 200-frame cap.
    const { output, error } = Run(`#include <iostream>
using namespace std;
int down(int n) { if (n == 0) return 0; return 1 + down(n - 1); }
int main() {
    cout << down(60) << endl;
    return 0;
}`);
    expect(error).toBeUndefined();
    expect(output.trim()).toBe('60');
  });

  it('still reports runaway loops through the step limit, not the depth cap', () => {
    const { error } = Main('while (true) { int x = 1; }');
    expect(error).toMatch(/execution limit exceeded/i);
  });
});

// ===================== 2. array bounds =====================

describe('array bounds checking', () => {
  it('rejects an out-of-bounds read instead of printing "undefined"', () => {
    const { output, error } = Main('int a[3] = {1, 2, 3};\ncout << a[10] << endl;');
    expect(output).not.toContain('undefined');
    expect(error).toBeDefined();
    expect(error).toMatch(/out of bounds/i);
    // The message has to name the index and the legal range to teach anything.
    expect(error).toMatch(/\[10\]/);
    expect(error).toMatch(/0\.\.2/);
  });

  it('rejects a negative index', () => {
    const { error } = Main('int a[3] = {1, 2, 3};\ncout << a[-1] << endl;');
    expect(error).toMatch(/out of bounds/i);
  });

  it('rejects an out-of-bounds write instead of growing the array', () => {
    const { error } = Main('int a[3] = {1, 2, 3};\na[7] = 99;');
    expect(error).toMatch(/out of bounds/i);
  });

  it('honours the declared size when the brace initialiser is shorter', () => {
    // `int a[5] = {0};` is the standard zero-init idiom. The engine used to
    // build a 1-element array from it, which bounds checking would have turned
    // into a spurious error on a[1].
    const { output, error } = Main('int a[5] = {0};\na[4] = 9;\nfor (int i = 0; i < 5; i++) cout << a[i];\ncout << endl;');
    expect(error).toBeUndefined();
    expect(output.trim()).toBe('00009');
  });

  it('allows every in-range index at both edges', () => {
    const { output, error } = Main('int a[3] = {1, 2, 3};\ncout << a[0] << a[2] << endl;');
    expect(error).toBeUndefined();
    expect(output.trim()).toBe('13');
  });

  it('still lets vectors grow through push_back', () => {
    const { output, error } = Main('vector<int> v;\nv.push_back(1);\nv.push_back(2);\ncout << v[1] << v.size() << endl;');
    expect(error).toBeUndefined();
    expect(output.trim()).toBe('22');
  });

  // Bounds checking is only safe because && and || short-circuit. Before this,
  // both operands were evaluated eagerly and the standard insertion-sort guard
  // `j >= 0 && arr[j] > key` indexed arr[-1] on the last iteration — which the
  // new bounds check would have turned into a spurious error in a shipped
  // example program.
  it('short-circuits && so a guarded index is never evaluated', () => {
    const { output, error } = Main(
      'int arr[6] = {12, 11, 13, 5, 6, 7};\n' +
      'for (int i = 1; i < 6; i++) {\n' +
      '  int key = arr[i];\n' +
      '  int j = i - 1;\n' +
      '  while (j >= 0 && arr[j] > key) { arr[j + 1] = arr[j]; j--; }\n' +
      '  arr[j + 1] = key;\n' +
      '}\n' +
      'for (int i = 0; i < 6; i++) cout << arr[i] << " ";\ncout << endl;',
    );
    expect(error).toBeUndefined();
    expect(output.trim()).toBe('5 6 7 11 12 13');
  });

  it('short-circuits || so the right operand is skipped when the left is true', () => {
    const { output, error } = Main('int a[2] = {1, 2};\nint i = 5;\nif (i >= 2 || a[i] == 0) cout << "ok" << endl;');
    expect(error).toBeUndefined();
    expect(output.trim()).toBe('ok');
  });
});

// ===================== 3. char arithmetic =====================

describe('char arithmetic', () => {
  it('promotes a char to its ASCII code in arithmetic (B10)', () => {
    const { output, error } = Run(`#include <iostream>
using namespace std;
int main() {
    char c = 'a';
    int n = c + 1;
    cout << n << endl;
    char d = c + 1;
    cout << d << endl;
    return 0;
}`);
    expect(error).toBeUndefined();
    expect(output.trim()).toBe('98\nb');
  });

  it('subtracts chars, so the digit idiom works', () => {
    const { output } = Main("char d = '7';\nint n = d - '0';\ncout << n << endl;");
    expect(output.trim()).toBe('7');
  });

  it('assigns a char into an int as its code', () => {
    const { output } = Main("char c = 'a';\nint n = c;\ncout << n << endl;");
    expect(output.trim()).toBe('97');
  });

  // The whole risk of this fix: a char must not be confused with a
  // one-character std::string. These four cases pin that boundary.
  it('still concatenates strings (B9 head)', () => {
    const { output } = Main('string a = "hello";\nstring b = "world";\nstring c = a + " " + b;\ncout << c << endl;');
    expect(output.trim()).toBe('hello world');
  });

  it('still concatenates a ONE-character string', () => {
    const { output } = Main('string s = "a";\nstring t = s + "b";\ncout << t << endl;');
    expect(output.trim()).toBe('ab');
  });

  it('concatenates rather than adds when a string meets a char', () => {
    const { output } = Main("string s = \"a\";\nchar c = 'b';\nstring t = s + c;\ncout << t << endl;");
    expect(output.trim()).toBe('ab');
  });

  it('still appends with += on a string', () => {
    const { output } = Main('string s = "a";\ns += "b";\ncout << s << endl;');
    expect(output.trim()).toBe('ab');
  });

  it('prints a char as a character, not a number', () => {
    const { output } = Main("char c = 'a';\ncout << c << endl;");
    expect(output.trim()).toBe('a');
  });

  it('compares a char against a char literal', () => {
    const { output } = Main("char c = 'a';\nif (c == 'a') cout << \"eq\" << endl;\nif (c != 'b') cout << \"ne\" << endl;");
    expect(output.trim()).toBe('eq\nne');
  });

  it('compares a char against a numeric code', () => {
    const { output } = Main("char c = 'a';\nif (c > 96 && c < 98) cout << \"in\" << endl;");
    expect(output.trim()).toBe('in');
  });

  it('reads a char from cin and keeps it a char', () => {
    const { output } = Main('char c;\ncin >> c;\ncout << c << " " << c + 0 << endl;', 'z');
    expect(output.trim()).toBe('z 122');
  });

  it('handles char arrays elementwise', () => {
    const { output } = Main("char s[3] = {'a', 'b', 'c'};\ns[0] = s[0] + 1;\ncout << s[0] << s[1] << \" \" << s[2] + 0 << endl;");
    expect(output.trim()).toBe('bb 99');
  });

  it('steps a char with ++ so an alphabet loop works', () => {
    const { output } = Main("for (char c = 'a'; c <= 'e'; c++) cout << c;\ncout << endl;");
    expect(output.trim()).toBe('abcde');
  });

  it('narrows a compound assignment back to a char', () => {
    const { output } = Main("char c = 'a';\nc += 1;\ncout << c << endl;");
    expect(output.trim()).toBe('b');
  });

  it('narrows at the parameter and return boundaries', () => {
    const { output } = Run(`#include <iostream>
using namespace std;
char upper(char c) { return c - 32; }
int main() {
    cout << upper('a') << endl;
    return 0;
}`);
    expect(output.trim()).toBe('A');
  });

  it('narrows through a char& reference parameter', () => {
    const { output } = Run(`#include <iostream>
using namespace std;
void bump(char &c) { c = c + 1; }
int main() {
    char x = 'a';
    bump(x);
    cout << x << endl;
    return 0;
}`);
    expect(output.trim()).toBe('b');
  });

  it('narrows a char struct member', () => {
    const { output } = Run(`#include <iostream>
using namespace std;
struct Node { char key; int val; };
int main() {
    Node n;
    n.key = 'a';
    n.key = n.key + 1;
    cout << n.key << endl;
    return 0;
}`);
    expect(output.trim()).toBe('b');
  });

  it('keeps chars as plain strings in the snapshot, so the UI is unaffected', () => {
    const { steps } = Main("char c = 'a';\nc = c + 1;\nchar s[2] = {'x', 'y'};");
    const vars = steps[steps.length - 1].callStack[0].variables;
    const c = vars.find((v) => v.name === 'c')!;
    const s = vars.find((v) => v.name === 's')!;
    expect(c.value).toBe('b');
    expect(s.value).toEqual(['x', 'y']);
    // recordStep diffs with JSON.stringify; a boxed representation would have
    // broken both that and the React panels.
    expect(JSON.stringify(c.value)).toBe('"b"');
  });

  it('marks a char as changed when it is reassigned', () => {
    const { steps } = Main("char c = 'a';\nc = c + 1;");
    const changedAt = steps.findIndex((s, i) =>
      i > 0 && s.callStack[0].variables.some((v) => v.name === 'c' && v.changed));
    expect(changedAt).toBeGreaterThan(-1);
  });

  it('leaves int arithmetic and increments untouched', () => {
    // 5 -> 6 -> 7 -> 6 -> 9 -> 8 -> 16
    const { output } = Main('int i = 5;\ni++;\n++i;\ni--;\ni += 3;\ni -= 1;\ni *= 2;\ncout << i << endl;');
    expect(output.trim()).toBe('16');
  });
});

// ===================== scope guard =====================

// These are the SCHEDULED design-stage bugs. They are asserted at their current
// (wrong) behaviour on purpose: if a later change fixes them, this block fails
// and forces the fix to be acknowledged rather than smuggled in. The char work
// deliberately routes around them.
describe('untouched by this stage (scheduled design work)', () => {
  it('still truncates double division', () => {
    const { output } = Main('double d = 7.0 / 2;\ncout << d << endl;');
    expect(output.trim()).toBe('3');
  });

  it('still does not wrap 32-bit integers', () => {
    const { output } = Main('int x = 2147483647;\nx = x + 1;\ncout << x << endl;');
    expect(output.trim()).toBe('2147483648');
  });
});
