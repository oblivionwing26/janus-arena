/** The 97.5 % quantile of the standard normal: a two-sided 95 % interval. */
export const Z95 = 1.9599639845400536;

export interface RateInterval {
  /** successes / n */
  readonly rate: number;
  readonly low: number;
  readonly high: number;
  readonly successes: number;
  readonly n: number;
}

/**
 * Wilson score interval for a success rate. Unlike the normal approximation it stays inside
 * [0, 1] and behaves at 0 % and 100 %, which small synthetic samples hit often.
 */
export function wilsonInterval(successes: number, n: number, z: number = Z95): RateInterval {
  if (!Number.isInteger(n) || n < 1) throw new RangeError('n must be a positive integer');
  if (!Number.isInteger(successes) || successes < 0 || successes > n) {
    throw new RangeError('successes must be an integer from 0 to n');
  }
  const rate = successes / n;
  const z2 = z * z;
  const denominator = 1 + z2 / n;
  const centre = (rate + z2 / (2 * n)) / denominator;
  const half = (z * Math.sqrt((rate * (1 - rate)) / n + z2 / (4 * n * n))) / denominator;
  return {
    rate,
    low: Math.max(0, centre - half),
    high: Math.min(1, centre + half),
    successes,
    n,
  };
}
