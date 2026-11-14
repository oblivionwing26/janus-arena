import { InvalidVariantError, type VariantSpec } from '../../domain/sandbox/variant-spec.js';

/**
 * The environment of a variant's app container (F4.1): what the target's sandbox definition fixes,
 * then what the variant asks for, which must be among the keys the definition lists as
 * `variantEnv`. A variant cannot set anything else, so a run file cannot inject an arbitrary
 * variable into a target.
 */
export function appEnvironment(
  definition: {
    readonly name: string;
    readonly env: Readonly<Record<string, string>>;
    readonly variantEnv?: readonly string[];
  },
  variant: Pick<VariantSpec, 'id' | 'env'>,
): Record<string, string> {
  const allowed = new Set(definition.variantEnv ?? []);
  const refused = Object.keys(variant.env ?? {}).filter((key) => !allowed.has(key));
  if (refused.length > 0) {
    throw new InvalidVariantError(
      `Variant ${variant.id} sets ${refused.join(', ')}, which ${definition.name} does not allow (variantEnv)`,
    );
  }
  return { ...definition.env, ...variant.env };
}
