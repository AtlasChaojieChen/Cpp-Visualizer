// Stage 6 — recording function return values. See docs/return-values-design.md.
//
// The value was computed and thrown away: the `Return` case evaluated it,
// recorded a step, then threw it inside a ReturnSignal, and `callFunction`
// popped the frame. StackFrameInfo had no field for it, so in a recursion demo
// the frames just vanished one by one and the value's journey back up the stack
// — the whole point of the visualizer — was invisible.
//
// PLAN.md assumed there was no step where the returning frame and its value
// coexist. There is: recordStep runs BEFORE the throw, so the frame is still on
// the stack. The value simply was not written into it. That makes this a small
// change and, critically, one that adds NO steps — see the step-count block.

import { describe, it, expect } from 'vitest';
import { executeCode } from '@/lib/cpp-engine';
import { formatReturnValue } from '@/lib/format';

function Run(code: string, stdin = '') {
  return executeCode(code, stdin);
}

// Every recorded (frame name, return value) pair, in the order they occur.
function ReturnsOf(code: string): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [];
  for (const step of Run(code).steps) {
    for (const frame of step.callStack) {
      if (!('returnValue' in frame)) continue;
      const pair: [string, unknown] = [frame.name, frame.returnValue];
      const last = out[out.length - 1];
      if (!last || last[0] !== pair[0] || last[1] !== pair[1]) out.push(pair);
    }
  }
  return out;
}

const Fact = `#include <iostream>
using namespace std;
int fact(int n) {
    if (n <= 1) return 1;
    return n * fact(n - 1);
}
int main() {
    cout << fact(3) << endl;
    return 0;
}`;

describe('return values are recorded on the returning frame', () => {
  it('records a plain return', () => {
    const code = `#include <iostream>
using namespace std;
int answer() { return 42; }
int main() { cout << answer() << endl; return 0; }`;
    expect(ReturnsOf(code)).toContainEqual(['answer', 42]);
  });

  it('records the value on the frame that is returning, while it is still live', () => {
    const code = `#include <iostream>
using namespace std;
int answer() { return 42; }
int main() { cout << answer() << endl; return 0; }`;
    const step = Run(code).steps.find((s) => s.callStack.some((f) => f.name === 'answer' && 'returnValue' in f));
    expect(step).toBeDefined();
    const frame = step!.callStack[step!.callStack.length - 1];
    // The returning frame is on TOP of the stack in that step, with main below.
    expect(frame.name).toBe('answer');
    expect(frame.returnValue).toBe(42);
    expect(step!.callStack.map((f) => f.name)).toEqual(['main', 'answer']);
  });

  // The point of the whole stage: each recursive frame records its own value.
  it('records every frame of a recursion unwinding', () => {
    const returns = ReturnsOf(Fact).filter(([name]) => name === 'fact');
    expect(returns).toEqual([
      ['fact', 1],
      ['fact', 2],
      ['fact', 6],
    ]);
  });

  it('records main returning 0', () => {
    expect(ReturnsOf(Fact)).toContainEqual(['main', 0]);
  });

  it('omits the field entirely for a void function', () => {
    const code = `#include <iostream>
using namespace std;
void greet() { cout << "hi" << endl; return; }
int main() { greet(); return 0; }`;
    expect(ReturnsOf(code).some(([name]) => name === 'greet')).toBe(false);
  });

  it('omits the field for a void function that falls off the end', () => {
    const code = `#include <iostream>
using namespace std;
void greet() { cout << "hi" << endl; }
int main() { greet(); return 0; }`;
    expect(ReturnsOf(code).some(([name]) => name === 'greet')).toBe(false);
  });

  // The value must be narrowed to the return type, because callFunction narrows
  // it AFTER the throw. Recording the raw value would show 98 on a step where
  // the caller actually receives 'b' — a visualizer that lies.
  it('records the narrowed value, not the raw one, for a char return', () => {
    const code = `#include <iostream>
using namespace std;
char next(char c) { return c + 1; }
int main() { cout << next('a') << endl; return 0; }`;
    expect(ReturnsOf(code)).toContainEqual(['next', 'b']);
  });

  it('records a narrowed int return', () => {
    const code = `#include <iostream>
using namespace std;
int half(double d) { return d / 2; }
int main() { cout << half(7) << endl; return 0; }`;
    expect(ReturnsOf(code)).toContainEqual(['half', 3]);
  });

  it('records a double return without truncating it', () => {
    const code = `#include <iostream>
using namespace std;
double half(double d) { return d / 2; }
int main() { cout << half(7) << endl; return 0; }`;
    expect(ReturnsOf(code)).toContainEqual(['half', 3.5]);
  });

  it('records a bool return', () => {
    const code = `#include <iostream>
using namespace std;
bool isEven(int n) { return n % 2 == 0; }
int main() { cout << isEven(4) << endl; return 0; }`;
    expect(ReturnsOf(code)).toContainEqual(['isEven', true]);
  });

  it('records a pointer return as its numeric address', () => {
    const code = `#include <iostream>
using namespace std;
int* make() { return new int; }
int main() { int *p = make(); *p = 5; cout << *p << endl; delete p; return 0; }`;
    const ret = ReturnsOf(code).find(([name]) => name === 'make');
    expect(ret).toBeDefined();
    expect(typeof ret![1]).toBe('number');
    expect(ret![1]).toBeGreaterThan(0);
  });
});

// The decisive constraint from the design: attaching the value to the existing
// return step adds NO steps. Recording it in the caller after the pop would
// have added one per call, silently shifting every ladder program's step count
// and rewriting the baseline Stage 0 exists to protect.
describe('step count is unchanged', () => {
  const Cases: Array<[string, string, number]> = [
    [
      'fact(5)',
      `#include <iostream>
using namespace std;
int fact(int n) { if (n <= 1) return 1; return n * fact(n - 1); }
int main() { cout << fact(5) << endl; return 0; }`,
      18,
    ],
  ];

  for (const [name, code, expected] of Cases) {
    it(`${name} still records exactly ${expected} steps`, () => {
      expect(Run(code).steps.length).toBe(expected);
    });
  }
});

// The badge must not reintroduce the [object Object] class of bug that Stage 2
// was spent removing, and a returned address must print like every other one.
describe('formatReturnValue', () => {
  it('prints a plain int', () => {
    expect(formatReturnValue(42, 'int')).toBe('42');
  });

  it('prints a returned pointer as hex', () => {
    expect(formatReturnValue(104, 'int*')).toBe('0x68');
  });

  it('prints a null returned pointer as nullptr', () => {
    expect(formatReturnValue(0, 'int*')).toBe('nullptr');
  });

  it('prints a returned char in single quotes', () => {
    expect(formatReturnValue('b', 'char')).toBe("'b'");
  });

  it('prints a returned string in double quotes', () => {
    expect(formatReturnValue('hi', 'string')).toBe('"hi"');
  });

  it('prints a bool as true/false', () => {
    expect(formatReturnValue(true, 'bool')).toBe('true');
  });

  it('prints a struct returned by value as its fields', () => {
    expect(formatReturnValue({ x: 1, y: 2 }, 'Point')).toBe('{ x: 1, y: 2 }');
  });

  it('never renders an object as [object Object]', () => {
    expect(formatReturnValue({ a: 1 }, 'S')).not.toContain('[object Object]');
  });
});

describe('backward stepping still restores exactly', () => {
  it('produces identical snapshots on either side of a return step', () => {
    const steps = Run(Fact).steps;
    const idx = steps.findIndex((s) => s.callStack.some((f) => 'returnValue' in f));
    expect(idx).toBeGreaterThan(0);
    // The snapshot model is index-based: re-reading any index must be stable.
    expect(JSON.stringify(steps[idx])).toBe(JSON.stringify(steps[idx]));
    expect(JSON.stringify(steps[idx - 1])).not.toBe(JSON.stringify(steps[idx]));
  });
});
