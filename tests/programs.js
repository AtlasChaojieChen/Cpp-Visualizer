// 38 graded test programs from TEST-LADDER.md.
// expect is one of:
//   { output: '...' }        — exact stdout (trailing whitespace per line ignored)
//   { cleanError: true }     — engine must return a deliberate C++-level error
//   { errorPattern: /.../ }  — engine must return an error matching the pattern
//   { either: true }         — clean error OR garbage output both acceptable (D7)

export const Programs = [
  // ===== Tier A — core (all should pass) =====
  {
    id: 'A1', name: 'Arithmetic & integer division',
    expect: { output: '7 3 1 3.5' },
    code: `#include <iostream>
using namespace std;
int main() {
    int a = 7, b = 2;
    int q = a / b;
    int r = a % b;
    double d = 7.0 / 2;
    cout << a << " " << q << " " << r << " " << d << endl;
    return 0;
}`,
  },
  {
    id: 'A2', name: 'If/else chain',
    expect: { output: 'medium' },
    code: `#include <iostream>
using namespace std;
int main() {
    int n = 55;
    if (n < 10) cout << "small" << endl;
    else if (n < 100) cout << "medium" << endl;
    else cout << "large" << endl;
    return 0;
}`,
  },
  {
    id: 'A3', name: 'For loop sum 1..100',
    expect: { output: '5050' },
    code: `#include <iostream>
using namespace std;
int main() {
    int sum = 0;
    for (int i = 1; i <= 100; i++) sum += i;
    cout << sum << endl;
    return 0;
}`,
  },
  {
    id: 'A4', name: 'While with break and continue',
    expect: { output: '2 4 6 8 10' },
    code: `#include <iostream>
using namespace std;
int main() {
    int i = 0;
    while (true) {
        i++;
        if (i > 10) break;
        if (i % 2 == 1) continue;
        cout << i << " ";
    }
    cout << endl;
    return 0;
}`,
  },
  {
    id: 'A5', name: 'Function call and return',
    expect: { output: '12' },
    code: `#include <iostream>
using namespace std;
int add(int a, int b) { return a + b; }
int main() {
    cout << add(5, 7) << endl;
    return 0;
}`,
  },
  {
    id: 'A6', name: 'Recursion (factorial)',
    expect: { output: '120' },
    code: `#include <iostream>
using namespace std;
int fact(int n) {
    if (n <= 1) return 1;
    return n * fact(n - 1);
}
int main() {
    cout << fact(5) << endl;
    return 0;
}`,
  },
  {
    id: 'A7', name: 'Array fill and read back',
    expect: { output: '0 1 4 9 16' },
    code: `#include <iostream>
using namespace std;
int main() {
    int arr[5];
    for (int i = 0; i < 5; i++) arr[i] = i * i;
    for (int i = 0; i < 5; i++) cout << arr[i] << " ";
    cout << endl;
    return 0;
}`,
  },
  {
    id: 'A8', name: 'cin input',
    stdin: '3 4',
    expect: { output: '7' },
    code: `#include <iostream>
using namespace std;
int main() {
    int a, b;
    cin >> a;
    cin >> b;
    cout << a + b << endl;
    return 0;
}`,
  },

  // ===== Tier B — supported but tricky =====
  {
    id: 'B1', name: 'Nested loops',
    expect: { output: '1 2 3\n2 4 6\n3 6 9' },
    code: `#include <iostream>
using namespace std;
int main() {
    for (int i = 1; i <= 3; i++) {
        for (int j = 1; j <= 3; j++) cout << i * j << " ";
        cout << endl;
    }
    return 0;
}`,
  },
  {
    id: 'B2', name: 'Two-branch recursion (fib 15)',
    expect: { output: '610' },
    code: `#include <iostream>
using namespace std;
int fib(int n) {
    if (n <= 1) return n;
    return fib(n - 1) + fib(n - 2);
}
int main() {
    cout << fib(15) << endl;
    return 0;
}`,
  },
  {
    id: 'B3', name: 'Pass array to function',
    expect: { output: '15' },
    code: `#include <iostream>
using namespace std;
int total(int a[], int n) {
    int s = 0;
    for (int i = 0; i < n; i++) s += a[i];
    return s;
}
int main() {
    int nums[5] = {1, 2, 3, 4, 5};
    cout << total(nums, 5) << endl;
    return 0;
}`,
  },
  {
    id: 'B4', name: 'Pass by reference (swap)',
    expect: { output: '9 4' },
    code: `#include <iostream>
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
}`,
  },
  {
    id: 'B5', name: 'Pointers: address-of and dereference',
    expect: { output: '42 99' },
    code: `#include <iostream>
using namespace std;
int main() {
    int x = 42;
    int *p = &x;
    cout << *p << " ";
    *p = 99;
    cout << x << endl;
    return 0;
}`,
  },
  {
    id: 'B6', name: 'Heap new/delete',
    expect: { output: '7' },
    code: `#include <iostream>
using namespace std;
int main() {
    int *p = new int(7);
    cout << *p << endl;
    delete p;
    return 0;
}`,
  },
  {
    id: 'B7', name: 'Struct with pointer (2-node list)',
    expect: { output: '1 2' },
    code: `#include <iostream>
using namespace std;
struct Node {
    int val;
    Node *next;
};
int main() {
    Node *head = new Node;
    head->val = 1;
    head->next = new Node;
    head->next->val = 2;
    head->next->next = nullptr;
    Node *cur = head;
    while (cur != nullptr) {
        cout << cur->val << " ";
        cur = cur->next;
    }
    cout << endl;
    return 0;
}`,
  },
  {
    id: 'B8', name: 'vector push_back and size',
    expect: { output: '3\n10 20 30' },
    code: `#include <iostream>
#include <vector>
using namespace std;
int main() {
    vector<int> v;
    v.push_back(10);
    v.push_back(20);
    v.push_back(30);
    cout << v.size() << endl;
    for (int i = 0; i < v.size(); i++) cout << v[i] << " ";
    cout << endl;
    return 0;
}`,
  },
  {
    id: 'B9', name: 'String concat and indexing',
    expect: { output: 'hello world\nh\n5' },
    code: `#include <iostream>
#include <string>
using namespace std;
int main() {
    string a = "hello";
    string b = "world";
    string c = a + " " + b;
    cout << c << endl;
    cout << a[0] << endl;
    cout << a.length() << endl;
    return 0;
}`,
  },
  {
    id: 'B10', name: 'Char arithmetic (ASCII)',
    expect: { output: '98\nb' },
    code: `#include <iostream>
using namespace std;
int main() {
    char c = 'a';
    int n = c + 1;
    cout << n << endl;
    char d = c + 1;
    cout << d << endl;
    return 0;
}`,
  },
  {
    id: 'B11', name: 'Integer overflow (C++ wraps, JS does not)',
    expect: { output: '-2147483648' },
    code: `#include <iostream>
using namespace std;
int main() {
    int big = 2147483647;
    big = big + 1;
    cout << big << endl;
    return 0;
}`,
  },
  {
    id: 'B12', name: 'Negative integer division and modulo',
    expect: { output: '-3 -1' },
    code: `#include <iostream>
using namespace std;
int main() {
    int a = -7, b = 2;
    cout << a / b << " " << a % b << endl;
    return 0;
}`,
  },
  {
    id: 'B13', name: '2D array',
    expect: { output: '1 2\n3 4' },
    code: `#include <iostream>
using namespace std;
int main() {
    int g[2][2];
    g[0][0] = 1; g[0][1] = 2;
    g[1][0] = 3; g[1][1] = 4;
    for (int i = 0; i < 2; i++) {
        for (int j = 0; j < 2; j++) cout << g[i][j] << " ";
        cout << endl;
    }
    return 0;
}`,
  },
  {
    id: 'B14', name: 'Global variable and shadowing',
    expect: { output: '5\n10' },
    code: `#include <iostream>
using namespace std;
int counter = 5;
void bump() { counter = counter + 5; }
int main() {
    cout << counter << endl;
    bump();
    cout << counter << endl;
    return 0;
}`,
  },

  // ===== Tier C — CP staples, supported features only (all should pass) =====
  {
    id: 'C1', name: 'Binary search (iterative)',
    expect: { output: '4' },
    code: `#include <iostream>
using namespace std;
int main() {
    int a[8] = {1, 3, 5, 7, 9, 11, 13, 15};
    int target = 9;
    int lo = 0, hi = 7, ans = -1;
    while (lo <= hi) {
        int mid = (lo + hi) / 2;
        if (a[mid] == target) { ans = mid; break; }
        if (a[mid] < target) lo = mid + 1;
        else hi = mid - 1;
    }
    cout << ans << endl;
    return 0;
}`,
  },
  {
    id: 'C2', name: 'Bubble sort',
    expect: { output: '1 2 5 8 9' },
    code: `#include <iostream>
using namespace std;
int main() {
    int a[5] = {5, 2, 9, 1, 8};
    for (int i = 0; i < 5; i++) {
        for (int j = 0; j < 4 - i; j++) {
            if (a[j] > a[j + 1]) {
                int t = a[j];
                a[j] = a[j + 1];
                a[j + 1] = t;
            }
        }
    }
    for (int i = 0; i < 5; i++) cout << a[i] << " ";
    cout << endl;
    return 0;
}`,
  },
  {
    id: 'C3', name: 'Recursive GCD',
    expect: { output: '6' },
    code: `#include <iostream>
using namespace std;
int gcd(int a, int b) {
    if (b == 0) return a;
    return gcd(b, a % b);
}
int main() {
    cout << gcd(48, 18) << endl;
    return 0;
}`,
  },
  {
    id: 'C4', name: 'Sieve of Eratosthenes to 30',
    expect: { output: '2 3 5 7 11 13 17 19 23 29' },
    code: `#include <iostream>
using namespace std;
int main() {
    int n = 30;
    bool comp[31];
    for (int i = 0; i <= n; i++) comp[i] = false;
    for (int i = 2; i * i <= n; i++) {
        if (comp[i] == false) {
            for (int j = i * i; j <= n; j += i) comp[j] = true;
        }
    }
    for (int i = 2; i <= n; i++) {
        if (comp[i] == false) cout << i << " ";
    }
    cout << endl;
    return 0;
}`,
  },
  {
    id: 'C5', name: 'Prefix sums range query',
    // TEST-LADDER.md says 12, but real C++ prints 13: a[1..4] = 4+1+5+3.
    expect: { output: '13' },
    code: `#include <iostream>
using namespace std;
int main() {
    int a[6] = {2, 4, 1, 5, 3, 7};
    int pre[7];
    pre[0] = 0;
    for (int i = 0; i < 6; i++) pre[i + 1] = pre[i] + a[i];
    int l = 1, r = 4;
    cout << pre[r + 1] - pre[l] << endl;
    return 0;
}`,
  },
  {
    id: 'C6', name: 'Two pointers (pair sum in sorted array)',
    // TEST-LADDER.md says "1 4", but real C++ prints "0 5": the very first
    // iteration hits 1 + 10 == 11 and breaks.
    expect: { output: '0 5' },
    code: `#include <iostream>
using namespace std;
int main() {
    int a[6] = {1, 3, 4, 6, 8, 10};
    int target = 11;
    int lo = 0, hi = 5;
    while (lo < hi) {
        int s = a[lo] + a[hi];
        if (s == target) { cout << lo << " " << hi << endl; break; }
        if (s < target) lo++;
        else hi--;
    }
    return 0;
}`,
  },
  {
    id: 'C7', name: 'Fast exponentiation with modulo',
    expect: { output: '24' },
    code: `#include <iostream>
using namespace std;
int power(int base, int exp, int mod) {
    int result = 1;
    base = base % mod;
    while (exp > 0) {
        if (exp % 2 == 1) result = (result * base) % mod;
        exp = exp / 2;
        base = (base * base) % mod;
    }
    return result;
}
int main() {
    cout << power(2, 10, 1000) << endl;
    return 0;
}`,
  },
  {
    id: 'C8', name: 'BST insert + inorder traversal',
    expect: { output: '2 3 5 7 8' },
    code: `#include <iostream>
using namespace std;
struct Node {
    int val;
    Node *left;
    Node *right;
};
Node* makeNode(int v) {
    Node *n = new Node;
    n->val = v;
    n->left = nullptr;
    n->right = nullptr;
    return n;
}
Node* insert(Node *root, int v) {
    if (root == nullptr) return makeNode(v);
    if (v < root->val) root->left = insert(root->left, v);
    else root->right = insert(root->right, v);
    return root;
}
void inorder(Node *root) {
    if (root == nullptr) return;
    inorder(root->left);
    cout << root->val << " ";
    inorder(root->right);
}
int main() {
    Node *root = nullptr;
    root = insert(root, 5);
    root = insert(root, 3);
    root = insert(root, 8);
    root = insert(root, 2);
    root = insert(root, 7);
    inorder(root);
    cout << endl;
    return 0;
}`,
  },

  // ===== Tier D — expected failures (testing failure quality) =====
  {
    id: 'D1', name: 'sort() from <algorithm>',
    expect: { cleanError: true },
    code: `#include <iostream>
#include <algorithm>
using namespace std;
int main() {
    int a[5] = {5, 2, 9, 1, 8};
    sort(a, a + 5);
    for (int i = 0; i < 5; i++) cout << a[i] << " ";
    cout << endl;
    return 0;
}`,
  },
  {
    id: 'D2', name: 'map<string,int>',
    expect: { cleanError: true },
    code: `#include <iostream>
#include <map>
using namespace std;
int main() {
    map<string, int> m;
    m["apple"] = 3;
    cout << m["apple"] << endl;
    return 0;
}`,
  },
  {
    id: 'D3', name: 'class with methods',
    expect: { cleanError: true },
    code: `#include <iostream>
using namespace std;
class Counter {
public:
    int count;
    void increment() { count++; }
};
int main() {
    Counter c;
    c.count = 0;
    c.increment();
    cout << c.count << endl;
    return 0;
}`,
  },
  {
    id: 'D4', name: 'bits/stdc++.h + auto + range-for',
    expect: { cleanError: true },
    code: `#include <bits/stdc++.h>
using namespace std;
int main() {
    vector<int> v = {1, 2, 3};
    for (auto x : v) cout << x << " ";
    cout << endl;
    return 0;
}`,
  },
  {
    id: 'D5', name: 'Infinite loop — does maxSteps catch it?',
    expect: { errorPattern: /Execution limit/ },
    code: `#include <iostream>
using namespace std;
int main() {
    int i = 0;
    while (i >= 0) { i++; }
    cout << i << endl;
    return 0;
}`,
  },
  {
    id: 'D6', name: 'Unbounded recursion — stack overflow?',
    expect: { cleanError: true },
    code: `#include <iostream>
using namespace std;
int boom(int n) { return boom(n + 1); }
int main() {
    cout << boom(1) << endl;
    return 0;
}`,
  },
  {
    id: 'D7', name: 'Array out of bounds read',
    expect: { either: true },
    code: `#include <iostream>
using namespace std;
int main() {
    int a[3] = {1, 2, 3};
    cout << a[10] << endl;
    return 0;
}`,
  },
  {
    id: 'D8', name: 'Use after free',
    expect: { errorPattern: /freed/i },
    code: `#include <iostream>
using namespace std;
int main() {
    int *p = new int(5);
    delete p;
    cout << *p << endl;
    return 0;
}`,
  },
];
