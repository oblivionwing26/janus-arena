import { DomainError } from '../errors/domain-error.js';

/** One variant of a target app to run in the sandbox. */
export interface VariantSpec {
  /** Readable slug, unique while the variant is up (e.g. `a`, `run-01-b`). */
  readonly id: string;
  /** Name of a sandbox definition in docker/sandboxes/ (e.g. `shoplab`). */
  readonly target: string;
  /** Branch, tag or commit of the target repository. */
  readonly ref: string;
}

const VARIANT_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

export class InvalidVariantError extends DomainError {
  readonly code = 'sandbox.invalid-variant';
}

export function assertValidVariant(variant: VariantSpec): void {
  if (!VARIANT_ID.test(variant.id)) {
    throw new InvalidVariantError(`Variant id must match ${VARIANT_ID.source}: ${variant.id}`);
  }
  if (variant.target === '' || variant.ref === '' || variant.ref.startsWith('-')) {
    throw new InvalidVariantError(`Variant ${variant.id} needs a target and a ref`);
  }
}
