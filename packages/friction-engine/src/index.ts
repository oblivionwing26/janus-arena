// Public entry point of @janus/friction-engine: a run's events -> friction signals, by code.

export {
  defaultFrictionConfig,
  frictionConfigSchema,
  InvalidFrictionConfigError,
  parseFrictionConfig,
  type FrictionConfig,
} from './config.js';
export { detectFriction } from './detect-friction.js';
export type { FrictionDetector, FrictionSeverity, FrictionSignalDraft } from './signal.js';
