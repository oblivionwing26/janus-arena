import type { RunOutcome } from '../event-store/run-summary.js';
import type { SessionResult, SessionStatus } from './session-queue-port.js';

export interface RunVerdict {
  readonly outcome: RunOutcome;
  readonly reason?: string;
}

/** Outcome of a run from its session results: run.completed's payload. */
export function decideOutcome(results: readonly SessionResult[]): RunVerdict {
  const count = (status: SessionStatus) => results.filter((r) => r.status === status).length;
  if (count('budget_exhausted') > 0) {
    return { outcome: 'budget_exhausted', reason: 'Run budget exhausted' };
  }
  const completed = count('completed');
  if (results.length > 0 && completed === results.length) return { outcome: 'success' };

  const others = (['failed', 'infra_error', 'cancelled'] as const)
    .filter((status) => count(status) > 0)
    .map((status) => `${status}: ${String(count(status))}`);
  return {
    outcome: 'error',
    reason: [`${String(completed)}/${String(results.length)} sessions completed`, ...others].join(
      '; ',
    ),
  };
}
