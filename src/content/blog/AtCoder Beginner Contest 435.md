---
routeSlug: 2
title: AtCoder Beginner Contest 435题解
type: 题解
createdAt: "2026-05-14 9:00:00"
updatedAt: "2026-05-14 9:00:00"
---

# [AtCoder Beginner Contest 435](https://atcoder.jp/contests/abc435)题解

简单说一下，这次的abc题非常简单，出的有很多的模板题，跟前几次的难度不一样除了最后一个难之外，剩下的都还行

头文件我放到最前面了

```c++
#include <bits/stdc++.h>

#define endl '\n'
#define x first
#define y second
#define fast ios::sync_with_stdio(0), cin.tie(0), cout.tie(0)
using namespace std;

namespace QuickRead {
    char buf[1 << 21], *p1 = buf, *p2 = buf;
    inline int getc() {
        return p1 == p2 && (p2 = (p1 = buf) + fread(buf, 1, 1 << 21, stdin), p1 == p2) ? EOF : *p1++;
    }
    // #define getc() (p1 == p2 && (p2 = (p1 = buf) + fread(buf, 1, 1 << 21, stdin)), p1 == p2 ? EOF : *p1++)
    template <typename T>
    inline void read(T &a) {
        T ans = 0;
        bool f = 0;
        char c = getc();
        for (; c < '0' || c > '9'; c = getc()) {
            if (c == '-')
                f = 1;
        }
        for (; c >= '0' && c <= '9'; c = getc()) {
            ans = ans * 10 + c - '0';
        }
        a = f ? -ans : ans;
    }

    template <typename T, typename... Args>
    inline void read(T &a, Args &...args) {
        read(a), read(args...);
    }
    template <typename T>
    void write(T x) {
        if (x < 0)
            putchar('-'), x = -x;
        if (x > 9)
            write(x / 10);
        putchar(x % 10 + '0');
    }
} // namespace QuickRead
using namespace QuickRead;

using i64 = long long;
using ll = long long;
using u64 = unsigned long long;
using i128 = __int128_t;
typedef pair<int, int> pii;
typedef pair<int, string> pis;
typedef pair<int, i64> pil;
typedef pair<i64, i64> pll;
typedef tuple<int, int, int> tpii;
constexpr int N = 1e6 + 10, M = 1e3 + 10, INF = 0x3f3f3f3f, mod = 1e9 + 7, MOD = 998244353;
constexpr i64 LINF = 0x3f3f3f3f3f3f3f3fLL;
constexpr int MAXT = 1e6 + 10;
```

## A - Triangular Number

签到题没啥说的求和用公式也好直接求和也好，数据范围小了点。

```c++
void solve() {
    int n;
    read(n);
    i64 ans = 0;
    for (int i = 1; i <= n; i++)
        ans += i;
    write(ans);
}
```

## **B - No-Divisible Range**

是一个小模拟题，按照提示直接模拟就行。

```c++
void solve() {
    read(n);
    int ans = 0;
    for (int i = 1; i <= n; i++) {
        read(w[i]);
    }
    int cnt = 0;
    for (int i = 1; i <= n; i++) {
        i64 sum = 0;
        for (int j = i; j <= n; j++) {
            sum += w[j];
            bool flag = true;
            for (int k = i; k <= j; k++) {
                if (sum % w[k] == 0)
                    flag = false;
                if (!flag)
                    break;
            }
            if (flag)
                cnt++;
        }
    }
    cout << cnt << endl;
}
```

## **C - Domino**

C题多米诺骨牌，一个指针题，维护一个往右边最大的右指针就行，遍历的时候只要超出了这个界限，就停止。答案就是这个

```c++
void solve() {
    read(n);
    for (int i = 1; i <= n; i++)
        read(w[i]);
    int r = 1;
    for (int i = 1; i <= n; i++) {
        if (r >= i) {
            r = max(r, i + w[i] - 1);
        } else {
            cout << i - 1 << endl;
            return;
        }
    }
    cout << n << endl;
}
```

## **D - Reachability Query 2**

这道题反向建边就行了，染色的时候从这个点遍历图，只要点能到达的。就是确定从顶点 *v* 沿边可以到达黑色顶点，逆向思维一下就出来了

```c++
vector<vector<int>> adj;

void add(int a, int b) {
    // a -> b
    adj[a].push_back(b);
}

void dfs(int u) {
    if (color[u])
        return;
    color[u] = 1;
    for (int v: adj[u])
        dfs(v);
}

void solve() {
    read(n, m);
    adj.resize(n + 1);
    for (int i = 0, x, y; i < m; i++) {
        read(x, y);
        // 反向建边
        add(y, x);
    }
    read(k);
    int op, v;
    while (k --) {
        read(op, v);
        if (op == 1) {
            dfs(v);
        } else {
            cout << (color[v] ? "Yes" : "No") << endl;
        }
    }
}

```

## **E - Cover query**

是一个数据结构题，非常经典的染色问题。我是用ODT树写的。有点无脑了。不建议这样写，时间复杂度容易被卡爆炸。我能过纯属是出题人大发慈悲饶了我一命。

```c++
void solve() {
    int q;
    read(n, q);
    ODT tr(n);
    int l, r;
    while (q--) {
        read(l, r);
        tr.assign(l, r, 1);
        cout << tr.sum << endl;
    }
}
```

## **F - Cat exercise**

也是一个数据结构体，我用的是分治加记录下标的st表写的。这道题就是考区间 $l$ 到 $r$ 的最大值的下表在哪，只要知道这个了，那这个题就能解决了。

```c++
SparseTable tr;
i64 calc(int l, int r, int idx) {
    if (r <= l)
        return abs(idx - l);
    int idx1 = 0, mx = 0;
    idx1 = tr.query(l, r + 1);
    return max(calc(l, idx1 - 1, idx1), calc(idx1 + 1, r, idx1)) + abs(idx - idx1);
}

void solve() {
    int idx = 0;
    cin >> n;
    if (n == 1) {
        cout << 0 << endl;
        return;
    }
    vector<i64> w(n + 1);
    for (int i = 1; i <= n; i++) {
        cin >> w[i];
        if (w[i] == n)
            idx = i;
    }
    tr.init(w);
    cout << max(calc(1, idx - 1, idx), calc(idx + 1, n, idx)) << endl;
}
```

下面是st表和ODT树的模板。只有你弄回了模板，才能够熟练掌握他

```c++
struct SparseTable {
    struct stPair {
        long long v;
        int i;
    };
    vector<vector<stPair>> st;
    static int default_e() {
        return -1;
    }
    SparseTable() {
    }

    void init(const vector<i64> &a) {
        int n = a.size();
        if (n == 0)
            return;
        int max_level = 32 - __builtin_clz(n);
        st.resize(n, vector<stPair>(max_level));

        for (int i = 0; i < n; ++i) {
            st[i][0] = {a[i], i};
        }
        for (int j = 1; (1 << j) <= n; ++j) {
            for (int i = 0; i + (1 << j) <= n; ++i) {
                stPair left = st[i][j - 1];
                stPair right = st[i + (1 << (j - 1))][j - 1];
                if (left.v >= right.v) {
                    st[i][j] = left;
                } else {
                    st[i][j] = right;
                }
            }
        }
    }

    SparseTable(const vector<i64> &a) {
        init(a);
    }
    int query(int l, int r) const {
        if (l >= r)
            return 0;
        int len = r - l;
        int k = 31 - __builtin_clz(len);
        stPair left = st[l][k];
        stPair right = st[r - (1 << k)][k];
        if (left.v >= right.v) {
            return left.i;
        } else {
            return right.i;
        }
    }
};
```

```c++
struct ODT {
    struct node {
        int l, r;
        mutable i64 v;
        node(int l, int r = -1, i64 v = 0) : l(l), r(r), v(v) {
        }
        bool operator<(const node &o) const {
            return l < o.l;
        }
    };
    set<node> s;
    int sum;
    ODT(int n) {
        s.clear();
        s.insert(node{1, n + 5});
        sum = n;
    }
    auto split(int pos) {
        auto it = s.lower_bound(node(pos));
        if (it != s.end() && it->l == pos)
            return it;
        it--;
        int l = it->l, r = it->r;
        i64 v = it->v;
        s.erase(it);
        s.insert(node(l, pos - 1, v));
        return s.insert(node(pos, r, v)).first;
    }
    void assign(int l, int r, i64 x) {
        auto itr = split(r + 1), itl = split(l);
        for (auto it = itl; it != itr; ++it) {
            if (it->v == 0)
                sum -= it->r - it->l + 1;
        }
        s.erase(itl, itr);
        s.insert(node(l, r, x));
    }
};
```
