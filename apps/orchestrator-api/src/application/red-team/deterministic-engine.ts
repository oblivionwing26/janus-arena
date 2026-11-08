import type { RedTeamClass } from '@janus/shared-kernel';

import type { AttackRequest } from '../../domain/attack/attack-request.js';
import { DEFAULT_IDOR_CONFIG, idorCandidates } from '../../domain/attack/idor-candidates.js';
import { loginBypassCandidates } from '../../domain/attack/login-bypass-candidates.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import type { AttackBench } from './attack-bench.js';

export interface DeterministicEngineInput {
  readonly classes: readonly RedTeamClass[];
  readonly endpoints: readonly Endpoint[];
}

/** The candidate requests for a class, built from the surface map and the attacker's own id. */
function candidatesFor(
  cls: RedTeamClass,
  endpoints: readonly Endpoint[],
  baseId: number,
): AttackRequest[] {
  if (cls === 'idor') return idorCandidates(endpoints, { ...DEFAULT_IDOR_CONFIG, baseId });
  return loginBypassCandidates(endpoints);
}

/**
 * The deterministic Red Team engine (F3.3, ADR 0011): for each class, it generates candidate
 * requests from the surface map (never an LLM), sends each through the bench and lets the
 * oracle judge it. It stops a class as soon as one attempt is confirmed exploitable, and moves
 * on when the attempt limits refuse further requests. No API is called.
 */
export class DeterministicEngine {
  async run(
    bench: AttackBench,
    input: DeterministicEngineInput,
  ): Promise<{ readonly summary: string }> {
    const baseId = bench.attacker$.basketId ?? 1;
    for (const cls of input.classes) {
      for (const candidate of candidatesFor(cls, input.endpoints, baseId)) {
        if (bench.findings.some((finding) => finding.testType === cls)) break;
        const result = await bench.send(candidate);
        if (!result.admitted) {
          // An endpoint's budget is used up: move on to the next endpoint's candidates. Only the
          // run's total budget stops the class.
          if (result.limit === 'run') break;
          continue;
        }
        await bench.judge(result.attempt);
      }
    }
    const found = bench.findings.map((finding) => finding.testType);
    const missing = input.classes.filter((cls) => !found.includes(cls));
    return {
      summary:
        missing.length === 0
          ? `Confirmed ${found.join(', ')} in ${String(bench.attempts.length)} attempts.`
          : `Confirmed ${found.length === 0 ? 'nothing' : found.join(', ')}; no finding for ${missing.join(', ')} in ${String(bench.attempts.length)} attempts.`,
    };
  }
}
