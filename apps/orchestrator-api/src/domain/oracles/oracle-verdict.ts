/**
 * What a deterministic oracle concluded (F3.2): an attack succeeds only when one says so, never
 * because an LLM thinks it did. The evidence is short, human-readable and holds no secret.
 */
export interface OracleVerdict {
  readonly exploitable: boolean;
  readonly evidence: string;
}

export const verdict = (exploitable: boolean, evidence: string): OracleVerdict => ({
  exploitable,
  evidence: evidence.slice(0, 500),
});
