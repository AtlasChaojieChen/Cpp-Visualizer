// std::string indexing, length()/empty(), and the erase/begin/end trio.
//
// The model: an ITERATOR IS A PLAIN INTEGER OFFSET. `begin()` is 0, `end()` is
// size(), and `a.begin() + i` is ordinary arithmetic that needs no new value
// type — so nothing new lands in a snapshot and every panel renders as before.
//
// The one thing that model loses is the difference between C++'s two `erase`
// overloads, since `s.erase(s.begin() + 3)` and `s.erase(3)` mean different
// things (erase ONE char vs erase from 3 to the end) but would both arrive as
// the number 3. The engine recovers it from the AST rather than the value: an
// argument whose expression tree contains a `begin()`/`end()` call is an
// iterator, anything else is a position. Same trick `StaticTypeOf` uses for `/`.

import { describe, it, expect } from 'vitest';
import { executeCode } from '@/lib/cpp-engine';

function Run(code: string, stdin = '') {
  const result = executeCode(code, stdin);
  const last = result.steps[result.steps.length - 1];
  return { output: last ? last.output : '', error: result.error, steps: result.steps };
}

function Main(body: string, stdin = '') {
  return Run(`#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n${body}\nreturn 0;\n}`, stdin);
}

// ===================== indexing =====================

describe('string indexing', () => {
  it('reads a character', () => {
    expect(Main('string s = "hello";\ncout << s[1] << endl;').output).toBe('e\n');
  });

  it('reads the last character', () => {
    expect(Main('string s = "hello";\ncout << s[s.size() - 1] << endl;').output).toBe('o\n');
  });

  it('compares an indexed character against a char literal', () => {
    expect(Main('string s = "abc";\nint r = 0;\nif (s[0] == \'a\') r = 1;\ncout << r << endl;').output).toBe('1\n');
  });

  it('writes a character', () => {
    expect(Main('string s = "hello";\ns[0] = \'H\';\ncout << s << endl;').output).toBe('Hello\n');
  });

  it('writes through a loop', () => {
    const r = Main(`string s = "abc";
for (int i = 0; i < s.size(); i++) s[i] = 'x';
cout << s << endl;`);
    expect(r.output).toBe('xxx\n');
  });

  // Same treatment array indexing already gets: a clean C++-level message
  // rather than JS's silent `undefined`.
  it('bounds-checks the index', () => {
    const r = Main('string s = "ab";\ncout << s[5] << endl;');
    expect(r.error).toMatch(/out of bounds/);
  });

  it('bounds-checks a write', () => {
    const r = Main("string s = \"ab\";\ns[9] = 'x';\ncout << s << endl;");
    expect(r.error).toMatch(/out of bounds/);
  });
});

// ===================== size / length / empty =====================

describe('string size, length and empty', () => {
  it('supports length() as well as size()', () => {
    expect(Main('string s = "hello";\ncout << s.length() << " " << s.size() << endl;').output).toBe('5 5\n');
  });

  it('supports empty() on a string', () => {
    expect(Main('string s;\nint r = 0;\nif (s.empty()) r = 1;\ncout << r << endl;').output).toBe('1\n');
  });

  it('reports a non-empty string as non-empty', () => {
    expect(Main('string s = "x";\nint r = 0;\nif (s.empty()) r = 1;\ncout << r << endl;').output).toBe('0\n');
  });

  it('still supports empty() on a vector', () => {
    expect(Main('vector<int> v;\nint r = 0;\nif (v.empty()) r = 1;\nv.push_back(3);\nif (v.empty()) r = 9;\ncout << r << endl;').output).toBe('1\n');
  });
});

// ===================== iterators as offsets =====================

describe('begin and end as integer offsets', () => {
  it('makes begin() zero and end() the size', () => {
    expect(Main('string s = "abcd";\ncout << s.begin() << " " << s.end() << endl;').output).toBe('0 4\n');
  });

  it('works on a vector too', () => {
    expect(Main('vector<int> v;\nv.push_back(1);\nv.push_back(2);\ncout << v.begin() << " " << v.end() << endl;').output).toBe('0 2\n');
  });
});

// ===================== erase =====================

describe('string erase', () => {
  it('erases one character through an iterator', () => {
    expect(Main('string s = "hello";\ns.erase(s.begin() + 1);\ncout << s << endl;').output).toBe('hllo\n');
  });

  it('erases at begin() with no offset', () => {
    expect(Main('string s = "hello";\ns.erase(s.begin());\ncout << s << endl;').output).toBe('ello\n');
  });

  it('erases an iterator range', () => {
    expect(Main('string s = "hello";\ns.erase(s.begin() + 1, s.begin() + 3);\ncout << s << endl;').output).toBe('hlo\n');
  });

  // The overload that a bare integer selects: erase from pos to the end.
  it('erases from a position to the end', () => {
    expect(Main('string s = "hello";\ns.erase(2);\ncout << s << endl;').output).toBe('he\n');
  });

  it('erases a count of characters from a position', () => {
    expect(Main('string s = "hello";\ns.erase(1, 2);\ncout << s << endl;').output).toBe('hlo\n');
  });

  it('bounds-checks the erase position', () => {
    expect(Main('string s = "ab";\ns.erase(s.begin() + 7);\ncout << s << endl;').error).toMatch(/out of range|out of bounds/);
  });
});

describe('vector erase', () => {
  it('erases one element through an iterator', () => {
    const r = Main(`vector<int> v;
v.push_back(1);
v.push_back(2);
v.push_back(3);
v.erase(v.begin() + 1);
for (int i = 0; i < v.size(); i++) cout << v[i] << " ";
cout << endl;`);
    expect(r.output).toBe('1 3 \n');
  });

  it('erases an iterator range', () => {
    const r = Main(`vector<int> v;
v.push_back(1);
v.push_back(2);
v.push_back(3);
v.push_back(4);
v.erase(v.begin() + 1, v.begin() + 3);
for (int i = 0; i < v.size(); i++) cout << v[i] << " ";
cout << endl;`);
    expect(r.output).toBe('1 4 \n');
  });
});

// A string is a value, not a handle: assigning copies it, so erasing from the
// copy must leave the original alone. Vectors already behaved this way.
describe('string value semantics', () => {
  it('copies on assignment', () => {
    const r = Main(`string s = "hello";
string a = s;
a.erase(a.begin());
cout << s << " " << a << endl;`);
    expect(r.output).toBe('hello ello\n');
  });
});

// ===================== the reported program =====================

describe('the pasted competitive-programming program', () => {
  const PROGRAM = `#include <bits/stdc++.h>
using namespace std;

int main() {
    ios::sync_with_stdio(false); cin.tie(nullptr);
    int t; cin >> t;
    while (t--) {
        string s; cin >> s;
        int n = s.size();

        string best;
        for (int i = 0; i < n; i++) {
            if (s[i] != '0') continue;
            string a = s;
            a.erase(a.begin() + i);

            string bobBest;
            for (int j = 0; j < (int) a.size(); j++) {
                if (a[j] != '1') continue;
                string b = a;
                b.erase(b.begin() + j);
                if (bobBest.empty() || b < bobBest) bobBest = b;
            }

            if (best.empty() || bobBest > best) best = bobBest;
        }
        cout << best << "\\n";
    }
}`;

  // Independent transliteration, so the expectation is derived rather than
  // copied out of whatever the engine happens to print.
  function Reference(input: string): string {
    const lines = input.trim().split(/\s+/);
    let p = 0;
    let t = Number(lines[p++]);
    let out = '';
    while (t--) {
      const s = lines[p++];
      const n = s.length;
      let best = '';
      for (let i = 0; i < n; i++) {
        if (s[i] !== '0') continue;
        const a = s.slice(0, i) + s.slice(i + 1);
        let bobBest = '';
        for (let j = 0; j < a.length; j++) {
          if (a[j] !== '1') continue;
          const b = a.slice(0, j) + a.slice(j + 1);
          if (bobBest === '' || b < bobBest) bobBest = b;
        }
        if (best === '' || bobBest > best) best = bobBest;
      }
      out += best + '\n';
    }
    return out;
  }

  it('runs to completion without an error', () => {
    const r = Run(PROGRAM, '1\n0101\n');
    expect(r.error).toBeUndefined();
  });

  it('matches a reference implementation', () => {
    for (const stdin of ['1\n0101\n', '1\n0011\n', '3\n0101\n1100\n0110\n']) {
      const r = Run(PROGRAM, stdin);
      expect(r.error).toBeUndefined();
      expect(r.output).toBe(Reference(stdin));
    }
  });
});
