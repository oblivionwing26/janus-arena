/**
 * The sandbox variant of a run, derived from its id and the variant key so nothing has to be
 * stored: the last eight characters of a ULID are random, so two runs practically never share
 * a variant id. Variant `a` keeps the single-variant name of earlier runs.
 */
export function variantIdFor(runId: string, key = 'a'): string {
  const base = `r-${runId.slice(-8).toLowerCase()}`;
  return key === 'a' ? base : `${base}-${key}`;
}
