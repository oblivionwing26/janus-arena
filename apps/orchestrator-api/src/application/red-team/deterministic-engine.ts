import type { RedTeamClass } from '@janus/shared-kernel';

import type { BrowserAttackPort } from '../../domain/attack/browser-attack-port.js';
import { DEFAULT_IDOR_CONFIG, idorCandidates } from '../../domain/attack/idor-candidates.js';
import { loginBypassCandidates } from '../../domain/attack/login-bypass-candidates.js';
import { OUT_OF_RANGE_QUANTITIES, takesQuantity } from '../../domain/attack/quantity-candidates.js';
import { xssPayloads } from '../../domain/attack/xss-candidates.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import type { AttackBench } from './attack-bench.js';
import { tryOrderQuantity, tryRace, tryRequest, tryXss } from './attack-moves.js';

/** How many identical requests a race fires; below every scope's rate. */
export const RACE_SIZE = 6;

export interface DeterministicEngineInput {
  readonly runId: string;
  readonly classes: readonly RedTeamClass[];
  readonly endpoints: readonly Endpoint[];
}

/**
 * The deterministic Red Team engine (F3.3, ADR 0011). Each class has a strategy that generates
 * its attempts from what Janus knows (the surface map, what the browser finds) and never from an
 * LLM, and plays them as moves: one HTTP request for IDOR and login bypass, a browser visit for
 * XSS, and the target's own flows for business logic. A deterministic oracle judges every move.
 * A class stops at its first confirmed finding; the attempt limits bound everything. No API is
 * called.
 */
export class DeterministicEngine {
  constructor(private readonly deps: { readonly browser: BrowserAttackPort | null }) {}

  async run(
    bench: AttackBench,
    input: DeterministicEngineInput,
  ): Promise<{ readonly summary: string; readonly skipped: readonly string[] }> {
    const skipped: string[] = [];
    for (const cls of input.classes) {
      if (cls === 'idor' || cls === 'auth-bypass') await this.http(bench, cls, input.endpoints);
      else if (cls === 'xss') {
        if (this.deps.browser === null) skipped.push('xss (no browser)');
        else await this.xss(bench, this.deps.browser, `janus-${input.runId}`);
      } else if (!(await this.businessLogic(bench, input.endpoints))) {
        skipped.push('business-logic (nothing to manipulate)');
      }
    }
    const found = [...new Set(bench.findings.map((finding) => finding.testType))];
    const missing = input.classes.filter((cls) => !found.includes(cls));
    const tail = skipped.length === 0 ? '' : ` Skipped: ${skipped.join(', ')}.`;
    return {
      skipped,
      summary:
        (missing.length === 0
          ? `Confirmed ${found.join(', ')} in ${String(bench.attempts.length)} attempts.`
          : `Confirmed ${found.length === 0 ? 'nothing' : found.join(', ')}; no finding for ${missing.join(', ')} in ${String(bench.attempts.length)} attempts.`) +
        tail,
    };
  }

  private found(bench: AttackBench, cls: RedTeamClass): boolean {
    return bench.findings.some((finding) => finding.testType === cls);
  }

  /** IDOR and login bypass: one guarded request per candidate. */
  private async http(
    bench: AttackBench,
    cls: 'idor' | 'auth-bypass',
    endpoints: readonly Endpoint[],
  ): Promise<void> {
    const candidates =
      cls === 'idor'
        ? idorCandidates(endpoints, {
            ...DEFAULT_IDOR_CONFIG,
            baseId: bench.attacker.basketId ?? 1,
          })
        : loginBypassCandidates(endpoints);
    for (const candidate of candidates) {
      if (this.found(bench, cls)) return;
      const result = await tryRequest(bench, candidate);
      // An endpoint's budget used up moves on to the next endpoint; only the run's total stops.
      if (!result.admitted && result.limit === 'run') return;
    }
  }

  /** XSS: find where the target reflects typed input, then visit it with each payload. */
  private async xss(bench: AttackBench, browser: BrowserAttackPort, marker: string): Promise<void> {
    const probe = `janusprobe${marker.slice(-8).toLowerCase()}`;
    for (const point of await browser.discover(bench.origin, probe)) {
      for (let payload = 0; payload < xssPayloads(marker).length; payload++) {
        if (this.found(bench, 'xss')) return;
        const result = await tryXss(bench, browser, point.template, payload, marker);
        if (!result.admitted && result.limit === 'run') return;
      }
    }
  }

  /**
   * Business logic: an order with each out-of-range quantity (when the surface map shows a
   * quantity the target takes), then a race on a once-per-user effect. False when there was
   * nothing to try.
   */
  private async businessLogic(
    bench: AttackBench,
    endpoints: readonly Endpoint[],
  ): Promise<boolean> {
    let ran = false;
    if (takesQuantity(endpoints)) {
      ran = true;
      for (const quantity of OUT_OF_RANGE_QUANTITIES) {
        const result = await tryOrderQuantity(bench, quantity);
        if (!result.admitted || result.verdict?.exploitable === true) break;
      }
    }
    const raced = await tryRace(bench, RACE_SIZE);
    return ran || raced.admitted;
  }
}
