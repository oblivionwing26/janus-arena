import { DomainError } from '../errors/domain-error.js';
import type { OracleVerdict } from '../oracles/oracle-verdict.js';

export class FindingNotConfirmableError extends DomainError {
  readonly code = 'attack.finding-not-confirmable';
}

export interface Confirmation {
  readonly findingId: string;
  readonly pocRef: string;
  readonly evidence: string;
}

/**
 * The only way a finding becomes `confirmed` (F3.4, CLAUDE.md): it has a reproducible PoC, and
 * replaying that PoC with fresh test users made its oracle say exploitable again. A tool's
 * suspicion, an LLM's opinion or a single lucky attempt never confirms anything.
 */
export function confirmFinding(
  findingId: string,
  poc: { readonly pocRef: string | null; readonly replay: OracleVerdict | null },
): Confirmation {
  if (poc.pocRef === null || poc.pocRef.trim() === '') {
    throw new FindingNotConfirmableError(`Finding ${findingId} has no reproducible PoC`);
  }
  if (poc.replay === null) {
    throw new FindingNotConfirmableError(`The PoC of finding ${findingId} was not replayed`);
  }
  if (!poc.replay.exploitable) {
    throw new FindingNotConfirmableError(
      `The PoC of finding ${findingId} did not reproduce: ${poc.replay.evidence}`,
    );
  }
  return { findingId, pocRef: poc.pocRef, evidence: poc.replay.evidence };
}
