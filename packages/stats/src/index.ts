// Public entry point of @janus/stats: success rates and A/B comparisons, computed by code.

export { abSummary, type AbComparison, type AbSummary, type VariantSummary } from './ab-summary.js';
export {
  DEFAULT_SEED,
  pairedBootstrap,
  quantile,
  type BootstrapInterval,
  type BootstrapOptions,
} from './bootstrap.js';
export { decide, type AbVerdict } from './decide.js';
export { mulberry32 } from './rng.js';
export { wilsonInterval, Z95, type RateInterval } from './wilson.js';
