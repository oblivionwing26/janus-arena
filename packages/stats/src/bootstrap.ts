import { mulberry32 } from './rng.js';

/** The fixed default seed: the same data always give the same interval. */
export const DEFAULT_SEED = 20261106;

export interface BootstrapOptions {
  readonly resamples?: number;
  readonly seed?: number;
  /** Two-sided confidence level, 0.95 by default. */
  readonly level?: number;
}

export interface BootstrapInterval {
  /** Mean of the observed differences (the point estimate). */
  readonly mean: number;
  readonly low: number;
  readonly high: number;
  readonly resamples: number;
  readonly seed: number;
  readonly level: number;
  /** Number of pairs. */
  readonly n: number;
}

/** Quantile of sorted values, interpolating linearly between order statistics. */
export function quantile(sorted: readonly number[], q: number): number {
  const position = q * (sorted.length - 1);
  const low = Math.floor(position);
  const high = Math.ceil(position);
  const a = sorted[low] ?? Number.NaN;
  const b = sorted[high] ?? Number.NaN;
  return a + (b - a) * (position - low);
}

/**
 * Percentile bootstrap of the mean of paired differences (B − A for each persona and seed).
 * Pairs are resampled with replacement, `resamples` times, from a seeded generator.
 */
export function pairedBootstrap(
  differences: readonly number[],
  options: BootstrapOptions = {},
): BootstrapInterval {
  const resamples = options.resamples ?? 10_000;
  const seed = options.seed ?? DEFAULT_SEED;
  const level = options.level ?? 0.95;
  const n = differences.length;
  if (n === 0) throw new RangeError('at least one pair is needed');
  if (!Number.isInteger(resamples) || resamples < 1) {
    throw new RangeError('resamples must be a positive integer');
  }
  const next = mulberry32(seed);
  const means: number[] = [];
  for (let r = 0; r < resamples; r++) {
    let total = 0;
    for (let i = 0; i < n; i++) total += differences[Math.floor(next() * n)] ?? 0;
    means.push(total / n);
  }
  means.sort((a, b) => a - b);
  const alpha = (1 - level) / 2;
  return {
    mean: differences.reduce((sum, value) => sum + value, 0) / n,
    low: quantile(means, alpha),
    high: quantile(means, 1 - alpha),
    resamples,
    seed,
    level,
    n,
  };
}
