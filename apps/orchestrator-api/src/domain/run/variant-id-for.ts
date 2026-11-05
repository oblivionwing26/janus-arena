/**
 * The sandbox variant of a run, derived from its id so nothing has to be stored: the last
 * eight characters of a ULID are random, so two runs practically never share a variant id.
 */
export function variantIdFor(runId: string): string {
  return `r-${runId.slice(-8).toLowerCase()}`;
}
