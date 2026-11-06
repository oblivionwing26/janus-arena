"""Independent reference values for @janus/stats (F1.8), with the Python standard library only.

Run by hand: `python packages/stats/reference/reference.py`. The TypeScript tests hard-code what
this prints (3 decimals). It re-implements, without sharing code, the same Wilson interval and the
same paired bootstrap: mulberry32 generator, `floor(u * n)` resampling, percentile interval with
linear interpolation between order statistics.
"""

import json
import math
from statistics import NormalDist

Z95 = NormalDist().inv_cdf(0.975)


def to_int32(x):
    x &= 0xFFFFFFFF
    return x - 0x100000000 if x & 0x80000000 else x


def imul(a, b):
    return to_int32((a & 0xFFFFFFFF) * (b & 0xFFFFFFFF))


def urshift(x, n):
    return (x & 0xFFFFFFFF) >> n


def mulberry32(seed):
    state = [to_int32(seed)]

    def next_float():
        state[0] = to_int32(state[0] + 0x6D2B79F5)
        a = state[0]
        t = imul(a ^ urshift(a, 15), 1 | a)
        t = to_int32(to_int32(t + imul(t ^ urshift(t, 7), 61 | t)) ^ t)
        return urshift(t ^ urshift(t, 14), 0) / 4294967296

    return next_float


def wilson(k, n, z=Z95):
    p = k / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return max(0.0, center - half), min(1.0, center + half)


def quantile(sorted_values, q):
    pos = q * (len(sorted_values) - 1)
    low = math.floor(pos)
    high = math.ceil(pos)
    return sorted_values[low] + (sorted_values[high] - sorted_values[low]) * (pos - low)


def paired_bootstrap(diffs, resamples=10_000, seed=20261106, level=0.95):
    rng = mulberry32(seed)
    n = len(diffs)
    means = []
    for _ in range(resamples):
        total = 0.0
        for _ in range(n):
            total += diffs[math.floor(rng() * n)]
        means.append(total / n)
    means.sort()
    alpha = (1 - level) / 2
    return sum(diffs) / n, quantile(means, alpha), quantile(means, 1 - alpha)


def r3(x):
    return round(x, 3)


rng = mulberry32(20261106)
cases = {
    "z95": Z95,
    "mulberry32_first5_seed20261106": [rng() for _ in range(5)],
    "wilson": {
        f"{k}/{n}": [r3(v) for v in wilson(k, n)]
        for k, n in [(8, 10), (0, 20), (1, 1), (5, 10), (45, 50), (3, 4)]
    },
    "bootstrap": {
        name: [r3(v) for v in paired_bootstrap(diffs)]
        for name, diffs in {
            "mixed12": [1, 0, 0, 1, -1, 0, 1, 0, 0, 1, 0, -1],
            "allzero8": [0] * 8,
            "positive10": [1, 1, 0, 1, 0, 1, 1, 0, 1, 0],
            "aa4": [0, 0, 0, 0],
        }.items()
    },
}
print(json.dumps(cases, indent=2))
