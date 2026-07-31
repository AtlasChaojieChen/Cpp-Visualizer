// Reference parameters (`void f(int &x)`).
//
// The parser has always set `isRef` on the param (Parser.parseFunctionDecl),
// but the interpreter never read it, so every argument was bound by value and
// a swap silently did nothing. These tests pin the observable contract:
//
//   1. a reference bound to a plain variable writes through to the caller;
//   2. a reference bound to an ARRAY ELEMENT writes back into the array —
//      this is what every sorting routine does, and sorting is the site's
//      core demo;
//   3. a read-only reference still sees the caller's current value;
//   4. a by-value parameter sitting next to a by-reference one must NOT
//      propagate;
//   5. binding a reference to a non-lvalue is a clean C++-level error, not a
//      raw JS crash;
//   6. the call-stack label stays made of primitives, so frames render as
//      `swapVals(4, 9)` and never as `[object Object]`.

import { describe, it, expect } from 'vitest';
import { executeCode } from '@/lib/cpp-engine';

function Run(code: string, stdin = '') {
  const result = executeCode(code, stdin);
  const last = result.steps[result.steps.length - 1];
  return { output: last ? last.output : '', error: result.error, steps: result.steps };
}

describe('reference parameters', () => {
  it('swaps two plain variables through int& params', () => {
    const { output, error } = Run(`#include <iostream>
using namespace std;
void swapVals(int &x, int &y) {
    int t = x;
    x = y;
    y = t;
}
int main() {
    int a = 4, b = 9;
    swapVals(a, b);
    cout << a << " " << b << endl;
    return 0;
}`);
    expect(error).toBeUndefined();
    expect(output.trim()).toBe('9 4');
  });

  it('swaps ARRAY ELEMENTS through int& params (what sorting does)', () => {
    const { output, error } = Run(`#include <iostream>
using namespace std;
void swapVals(int &x, int &y) {
    int t = x;
    x = y;
    y = t;
}
int main() {
    int arr[3] = {1, 2, 3};
    swapVals(arr[0], arr[2]);
    cout << arr[0] << " " << arr[1] << " " << arr[2] << endl;
    return 0;
}`);
    expect(error).toBeUndefined();
    expect(output.trim()).toBe('3 2 1');
  });

  it('sorts an array with a reference-based swap helper', () => {
    const { output, error } = Run(`#include <iostream>
using namespace std;
void swapVals(int &x, int &y) {
    int t = x;
    x = y;
    y = t;
}
int main() {
    int a[5] = {5, 1, 4, 2, 3};
    for (int i = 0; i < 5; i++) {
        for (int j = 0; j < 4 - i; j++) {
            if (a[j] > a[j + 1]) {
                swapVals(a[j], a[j + 1]);
            }
        }
    }
    for (int i = 0; i < 5; i++) {
        cout << a[i] << " ";
    }
    return 0;
}`);
    expect(error).toBeUndefined();
    expect(output.trim()).toBe('1 2 3 4 5');
  });

  it('a read-only reference sees the caller current value', () => {
    const { output, error } = Run(`#include <iostream>
using namespace std;
int twice(int &n) {
    return n * 2;
}
int main() {
    int v = 21;
    v = v + 4;
    cout << twice(v) << endl;
    return 0;
}`);
    expect(error).toBeUndefined();
    expect(output.trim()).toBe('50');
  });

  it('mixes by-value and by-reference params without leaking the by-value one', () => {
    const { output, error } = Run(`#include <iostream>
using namespace std;
void bump(int byVal, int &byRef) {
    byVal = 100;
    byRef = 100;
}
int main() {
    int a = 1, b = 2;
    bump(a, b);
    cout << a << " " << b << endl;
    return 0;
}`);
    expect(error).toBeUndefined();
    expect(output.trim()).toBe('1 100');
  });

  it('forwards a reference param onward to another reference param', () => {
    const { output, error } = Run(`#include <iostream>
using namespace std;
void setTo(int &n, int v) {
    n = v;
}
void outer(int &n) {
    setTo(n, 77);
}
int main() {
    int a = 5;
    outer(a);
    cout << a << endl;
    return 0;
}`);
    expect(error).toBeUndefined();
    expect(output.trim()).toBe('77');
  });

  it('reports a clean C++-level error when a reference binds to a literal', () => {
    const { error } = Run(`#include <iostream>
using namespace std;
void swapVals(int &x, int &y) {
    int t = x;
    x = y;
    y = t;
}
int main() {
    swapVals(1, 2);
    return 0;
}`);
    expect(error).toBeDefined();
    expect(error).toMatch(/reference parameter/i);
    // Must not surface a raw JS failure.
    expect(error).not.toMatch(/undefined is not|Cannot read propert|of undefined/i);
  });

  it('keeps call-stack args primitive so the frame label reads swapVals(4, 9)', () => {
    const { steps } = Run(`#include <iostream>
using namespace std;
void swapVals(int &x, int &y) {
    int t = x;
    x = y;
    y = t;
}
int main() {
    int a = 4, b = 9;
    swapVals(a, b);
    return 0;
}`);
    const frame = steps
      .flatMap((s) => s.callStack)
      .find((f) => f.name === 'swapVals');
    expect(frame).toBeDefined();
    expect(frame!.args).toEqual([4, 9]);
    for (const a of frame!.args!) {
      expect(typeof a).not.toBe('object');
      expect(String(a)).not.toBe('[object Object]');
    }
  });
});
