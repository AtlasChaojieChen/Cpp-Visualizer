export const EXAMPLES = [
  {
    name: 'Variables & Arithmetic',
    code: `#include <iostream>
using namespace std;

int main() {
    int a = 5;
    int b = 3;
    int sum = a + b;
    int product = a * b;
    cout << "Sum: " << sum << endl;
    cout << "Product: " << product << endl;
    return 0;
}`,
  },
  {
    name: 'Input (cin)',
    code: `#include <iostream>
using namespace std;

int factorial(int n) {
    int ans = 1;
    for (int i = 2; i <= n; i++) {
        ans = ans * i;
    }
    return ans;
}

int main() {
    int num;
    cin >> num;
    cout << factorial(num) << endl;
    return 0;
}`,
    stdin: '5',
  },
  {
    name: 'If/Else & Loops',
    code: `#include <iostream>
using namespace std;

int main() {
    int n = 10;
    int sum = 0;
    for (int i = 1; i <= n; i++) {
        sum += i;
    }
    if (sum > 50) {
        cout << "Sum is large: " << sum << endl;
    } else {
        cout << "Sum is small: " << sum << endl;
    }
    return 0;
}`,
  },
  {
    name: 'Factorial (Recursion)',
    code: `#include <iostream>
using namespace std;

int factorial(int n) {
    if (n <= 1) {
        return 1;
    }
    int result = n * factorial(n - 1);
    return result;
}

int main() {
    int num = 5;
    int result = factorial(num);
    cout << num << "! = " << result << endl;
    return 0;
}`,
  },
  {
    name: 'Fibonacci',
    code: `#include <iostream>
using namespace std;

int fibonacci(int n) {
    if (n <= 0) {
        return 0;
    }
    if (n == 1) {
        return 1;
    }
    return fibonacci(n - 1) + fibonacci(n - 2);
}

int main() {
    for (int i = 0; i < 7; i++) {
        cout << fibonacci(i) << " ";
    }
    cout << endl;
    return 0;
}`,
  },
  // ========== SORTING ==========
  {
    name: 'Bubble Sort',
    code: `#include <iostream>
using namespace std;

int main() {
    int arr[5] = {5, 3, 8, 1, 2};
    int n = 5;
    for (int i = 0; i < n - 1; i++) {
        for (int j = 0; j < n - i - 1; j++) {
            if (arr[j] > arr[j + 1]) {
                int temp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = temp;
            }
        }
    }
    for (int i = 0; i < n; i++) {
        cout << arr[i] << " ";
    }
    cout << endl;
    return 0;
}`,
  },
  {
    name: 'Selection Sort',
    code: `#include <iostream>
using namespace std;

int main() {
    int arr[6] = {64, 25, 12, 22, 11, 1};
    int n = 6;
    for (int i = 0; i < n - 1; i++) {
        int minIdx = i;
        for (int j = i + 1; j < n; j++) {
            if (arr[j] < arr[minIdx]) {
                minIdx = j;
            }
        }
        int temp = arr[minIdx];
        arr[minIdx] = arr[i];
        arr[i] = temp;
    }
    for (int i = 0; i < n; i++) {
        cout << arr[i] << " ";
    }
    cout << endl;
    return 0;
}`,
  },
  {
    name: 'Insertion Sort',
    code: `#include <iostream>
using namespace std;

int main() {
    int arr[6] = {12, 11, 13, 5, 6, 7};
    int n = 6;
    for (int i = 1; i < n; i++) {
        int key = arr[i];
        int j = i - 1;
        while (j >= 0 && arr[j] > key) {
            arr[j + 1] = arr[j];
            j--;
        }
        arr[j + 1] = key;
    }
    for (int i = 0; i < n; i++) {
        cout << arr[i] << " ";
    }
    cout << endl;
    return 0;
}`,
  },
  // ========== SEARCHING ==========
  {
    name: 'Binary Search',
    code: `#include <iostream>
using namespace std;

int main() {
    int arr[8] = {2, 5, 8, 12, 16, 23, 38, 56};
    int target = 23;
    int left = 0;
    int right = 7;
    int result = -1;
    while (left <= right) {
        int mid = left + (right - left) / 2;
        if (arr[mid] == target) {
            result = mid;
            break;
        }
        if (arr[mid] < target) {
            left = mid + 1;
        } else {
            right = mid - 1;
        }
    }
    if (result != -1) {
        cout << "Found at index " << result << endl;
    } else {
        cout << "Not found" << endl;
    }
    return 0;
}`,
  },
  {
    name: 'Linear Search',
    code: `#include <iostream>
using namespace std;

int main() {
    int arr[6] = {4, 2, 7, 1, 9, 3};
    int target = 7;
    int found = -1;
    for (int i = 0; i < 6; i++) {
        if (arr[i] == target) {
            found = i;
        }
    }
    if (found != -1) {
        cout << "Found " << target << " at index " << found << endl;
    } else {
        cout << "Not found" << endl;
    }
    return 0;
}`,
  },
  // ========== DATA STRUCTURES ==========
  {
    name: 'Vector Operations',
    code: `#include <iostream>
#include <vector>
using namespace std;

int main() {
    vector<int> v = {10, 20, 30};
    v.push_back(40);
    v.push_back(50);
    int sz = v.size();
    cout << "Size: " << sz << endl;
    for (int i = 0; i < sz; i++) {
        cout << v[i] << " ";
    }
    cout << endl;
    v.pop_back();
    cout << "After pop: " << v.size() << endl;
    return 0;
}`,
  },
  {
    name: 'Stack (Array)',
    code: `#include <iostream>
using namespace std;

int main() {
    int stack[10] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    int top = -1;

    // Push
    top++;
    stack[top] = 10;
    top++;
    stack[top] = 20;
    top++;
    stack[top] = 30;
    cout << "Top: " << stack[top] << endl;

    // Pop
    int popped = stack[top];
    top--;
    cout << "Popped: " << popped << endl;
    cout << "New top: " << stack[top] << endl;

    // Push more
    top++;
    stack[top] = 40;
    cout << "Final top: " << stack[top] << endl;
    return 0;
}`,
  },
  {
    name: 'Queue (Array)',
    code: `#include <iostream>
using namespace std;

int main() {
    int queue[10] = {0, 0, 0, 0, 0, 0, 0, 0, 0, 0};
    int front = 0;
    int rear = -1;
    int size = 0;

    // Enqueue
    rear++;
    queue[rear] = 10;
    size++;
    rear++;
    queue[rear] = 20;
    size++;
    rear++;
    queue[rear] = 30;
    size++;
    cout << "Front: " << queue[front] << endl;

    // Dequeue
    int dequeued = queue[front];
    front++;
    size--;
    cout << "Dequeued: " << dequeued << endl;
    cout << "New front: " << queue[front] << endl;
    cout << "Size: " << size << endl;
    return 0;
}`,
  },
  {
    name: 'Binary Tree',
    code: `#include <iostream>
using namespace std;

struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
};

int main() {
    TreeNode* root = new TreeNode{1, nullptr, nullptr};
    root->left = new TreeNode{2, nullptr, nullptr};
    root->right = new TreeNode{3, nullptr, nullptr};
    root->left->left = new TreeNode{4, nullptr, nullptr};
    root->left->right = new TreeNode{5, nullptr, nullptr};
    root->right->left = new TreeNode{6, nullptr, nullptr};
    root->right->right = new TreeNode{7, nullptr, nullptr};
    cout << "Root: " << root->val << endl;
    cout << "Left: " << root->left->val << endl;
    cout << "Right: " << root->right->val << endl;
    return 0;
}`,
  },
  {
    name: 'BST Insert',
    code: `#include <iostream>
using namespace std;

struct TreeNode {
    int val;
    TreeNode* left;
    TreeNode* right;
};

TreeNode* insert(TreeNode* root, int val) {
    if (root == nullptr) {
        return new TreeNode{val, nullptr, nullptr};
    }
    if (val < root->val) {
        root->left = insert(root->left, val);
    } else {
        root->right = insert(root->right, val);
    }
    return root;
}

int main() {
    TreeNode* root = nullptr;
    root = insert(root, 5);
    root = insert(root, 3);
    root = insert(root, 7);
    root = insert(root, 1);
    root = insert(root, 4);
    root = insert(root, 6);
    root = insert(root, 8);
    cout << "Root: " << root->val << endl;
    cout << "Left: " << root->left->val << endl;
    cout << "Right: " << root->right->val << endl;
    return 0;
}`,
  },
  // ========== CLASSIC ALGORITHMS ==========
  {
    name: 'Two Sum',
    code: `#include <iostream>
using namespace std;

int main() {
    int arr[5] = {2, 7, 11, 15, 1};
    int target = 9;
    int n = 5;
    int found1 = -1;
    int found2 = -1;
    for (int i = 0; i < n; i++) {
        for (int j = i + 1; j < n; j++) {
            if (arr[i] + arr[j] == target) {
                found1 = i;
                found2 = j;
            }
        }
    }
    if (found1 != -1) {
        cout << "Indices: " << found1 << ", " << found2 << endl;
    }
    return 0;
}`,
  },
  {
    name: 'Reverse Array',
    code: `#include <iostream>
using namespace std;

int main() {
    int arr[6] = {1, 2, 3, 4, 5, 6};
    int n = 6;
    int left = 0;
    int right = n - 1;
    while (left < right) {
        int temp = arr[left];
        arr[left] = arr[right];
        arr[right] = temp;
        left++;
        right--;
    }
    for (int i = 0; i < n; i++) {
        cout << arr[i] << " ";
    }
    cout << endl;
    return 0;
}`,
  },
  {
    name: 'GCD (Euclidean)',
    code: `#include <iostream>
using namespace std;

int gcd(int a, int b) {
    if (b == 0) {
        return a;
    }
    return gcd(b, a % b);
}

int main() {
    int a = 48;
    int b = 18;
    int result = gcd(a, b);
    cout << "GCD of " << a << " and " << b << " is " << result << endl;
    return 0;
}`,
  },
  {
    name: 'Power (Recursion)',
    code: `#include <iostream>
using namespace std;

int power(int base, int exp) {
    if (exp == 0) {
        return 1;
    }
    int half = power(base, exp / 2);
    if (exp % 2 == 0) {
        return half * half;
    }
    return base * half * half;
}

int main() {
    int b = 2;
    int e = 10;
    int result = power(b, e);
    cout << b << "^" << e << " = " << result << endl;
    return 0;
}`,
  },
  // ========== POINTERS & HEAP ==========
  {
    name: 'Pointers & Heap',
    code: `#include <iostream>
using namespace std;

int main() {
    int x = 42;
    int* ptr = &x;
    cout << "Value: " << x << endl;
    cout << "Pointer: " << *ptr << endl;
    *ptr = 100;
    cout << "Modified: " << x << endl;
    int* heapVar = new int(55);
    cout << "Heap: " << *heapVar << endl;
    delete heapVar;
    return 0;
}`,
  },
  {
    name: 'Two Inputs',
    code: `#include <iostream>
using namespace std;

int main() {
    int a;
    int b;
    cin >> a;
    cin >> b;
    int sum = a + b;
    int diff = a - b;
    cout << "Sum: " << sum << endl;
    cout << "Difference: " << diff << endl;
    return 0;
}`,
    stdin: '10\n3',
  },
];
