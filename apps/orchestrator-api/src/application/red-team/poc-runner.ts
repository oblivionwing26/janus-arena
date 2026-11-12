import { newUlid, type ProofOfConcept } from '@janus/shared-kernel';

import type { BrowserAttackPort } from '../../domain/attack/browser-attack-port.js';
import { verdict, type OracleVerdict } from '../../domain/oracles/oracle-verdict.js';
import type { AttackBench } from './attack-bench.js';
import {
  tryGuessing,
  tryOrderQuantity,
  tryRace,
  tryRequest,
  tryXss,
  type MoveResult,
} from './attack-moves.js';

const PARAM = /:[A-Za-z][\w-]*/;

/**
 * Replays a proof of concept (F3.4, ADR 0011) with no LLM: the move its steps name, on a bench
 * opened with fresh test users, so the run's own ids are bound again and an XSS gets its own
 * marker. Returns the oracle's verdict on the replay, or null when nothing could be judged (the
 * limits refused it, or the target no longer offers the flow). The bench should be opened with
 * `recordFindings: false`: a replay records attempts and verdicts, never new findings.
 */
export class PocRunner {
  constructor(private readonly deps: { readonly browser: BrowserAttackPort | null }) {}

  async replay(bench: AttackBench, poc: ProofOfConcept): Promise<OracleVerdict | null> {
    const result = await this.play(bench, poc);
    return 'verdict' in result ? result.verdict : null;
  }

  private async play(bench: AttackBench, poc: ProofOfConcept): Promise<MoveResult> {
    const steps = poc.steps;
    switch (steps.kind) {
      case 'idor': {
        const id =
          'victim' in steps.bind
            ? steps.bind.victim === 'basketId'
              ? bench.victim.basketId
              : bench.victim.user.userId
            : (bench.attacker.basketId ?? 0) + steps.bind.offsetFromAttackerBasket;
        if (id === null) {
          return { admitted: true, verdict: verdict(false, 'the victim has no such object') };
        }
        return tryRequest(bench, {
          class: 'idor',
          as: 'b',
          method: 'GET',
          path: steps.route.replace(PARAM, String(id)),
        });
      }
      case 'auth-bypass':
        return tryRequest(bench, {
          class: 'auth-bypass',
          as: 'anonymous',
          method: 'POST',
          path: steps.path,
          body: steps.body,
        });
      case 'xss':
        if (this.deps.browser === null) {
          return { admitted: true, verdict: verdict(false, 'no browser to replay an XSS') };
        }
        return tryXss(
          bench,
          this.deps.browser,
          `${bench.origin}${steps.template}`,
          steps.payload,
          `janus-${newUlid()}`,
        );
      case 'order-quantity':
        return tryOrderQuantity(bench, steps.quantity);
      case 'once-effect-race':
        return tryRace(bench, steps.size);
      case 'login-guessing':
        return tryGuessing(
          bench,
          { route: steps.path, identity: steps.identity, password: steps.password },
          steps.guesses,
        );
    }
  }
}
