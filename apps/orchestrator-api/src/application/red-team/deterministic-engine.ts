import type { RedTeamClass } from '@janus/shared-kernel';

import type { BrowserAttackPort } from '../../domain/attack/browser-attack-port.js';
import { DEFAULT_IDOR_CONFIG, idorCandidates } from '../../domain/attack/idor-candidates.js';
import { loginBypassCandidates } from '../../domain/attack/login-bypass-candidates.js';
import { OUT_OF_RANGE_QUANTITIES, takesQuantity } from '../../domain/attack/quantity-candidates.js';
import { xssCandidates } from '../../domain/attack/xss-candidates.js';
import { duplicateEffect } from '../../domain/oracles/duplicate-effect.js';
import { verdict } from '../../domain/oracles/oracle-verdict.js';
import { priceMismatch } from '../../domain/oracles/price-mismatch.js';
import { scriptExecuted } from '../../domain/oracles/script-executed.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import { race } from '../attack/race.js';
import type { AttackBench } from './attack-bench.js';

/** How many identical requests a race fires; below every scope's rate. */
export const RACE_SIZE = 6;
// A race must start on an empty rate window, or the guard blocks its overflow.
const RATE_WINDOW_MS = 1_100;

export interface DeterministicEngineInput {
  readonly runId: string;
  readonly classes: readonly RedTeamClass[];
  readonly endpoints: readonly Endpoint[];
}

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** The page a URL shows, for the record: its path plus a hash route, never its query. */
function pageOf(url: string): string {
  const parsed = new URL(url);
  const route = parsed.hash.split('?')[0] ?? '';
  return `${parsed.pathname}${route}`;
}

/**
 * The deterministic Red Team engine (F3.3, ADR 0011). Each class has a strategy that generates
 * its attempts from what Janus knows (the surface map, what the browser finds) and never from an
 * LLM: one HTTP request per attempt for IDOR and login bypass, a browser visit for XSS, and the
 * target's own flows for business logic. A deterministic oracle judges every attempt through the
 * bench. A class stops at its first confirmed finding; the attempt limits bound everything. No
 * API is called.
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
      } else {
        const ran = await this.businessLogic(bench, input.endpoints);
        if (!ran) skipped.push('business-logic (nothing to manipulate)');
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

  /** IDOR and login bypass: one guarded request per candidate, judged by its oracle. */
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
      const result = await bench.send(candidate);
      if (!result.admitted) {
        // An endpoint's budget is used up: move on to the next endpoint. Only the run's total
        // budget stops the class.
        if (result.limit === 'run') return;
        continue;
      }
      await bench.judge(result.attempt);
    }
  }

  /** XSS: find where the target reflects typed input, then visit it with each payload. */
  private async xss(bench: AttackBench, browser: BrowserAttackPort, marker: string): Promise<void> {
    const probe = `janusprobe${marker.slice(-8).toLowerCase()}`;
    const points = await browser.discover(bench.origin, probe);
    for (const candidate of xssCandidates(points, marker)) {
      if (this.found(bench, 'xss') || bench.budgetLeft === 0) return;
      const visit = await browser.visit(bench.origin, candidate.url);
      const result = await bench.record({
        class: 'xss',
        as: 'anonymous',
        method: 'GET',
        path: pageOf(candidate.url),
        status: visit.status,
        ...(visit.blocked === null ? {} : { blocked: visit.blocked }),
      });
      if (!result.admitted) {
        if (result.limit === 'run') return;
        continue;
      }
      if (visit.blocked === null) {
        await bench.conclude(
          result.attempt,
          'script-executed',
          scriptExecuted(visit.dialogs, marker),
        );
      }
    }
  }

  /**
   * Business logic: an order with each out-of-range quantity (when the surface map shows a
   * quantity the target takes), then a race on a once-per-user effect. Each is one attempt,
   * recorded at the step that carried the manipulation. False when there was nothing to try.
   */
  private async businessLogic(
    bench: AttackBench,
    endpoints: readonly Endpoint[],
  ): Promise<boolean> {
    const flows = bench.target.businessLogic;
    let ran = false;

    if (takesQuantity(endpoints)) {
      ran = true;
      for (const quantity of OUT_OF_RANGE_QUANTITIES) {
        if (bench.budgetLeft === 0) return ran;
        const placed = await flows.orderWithQuantity(bench.attacker, quantity);
        const result = await bench.record({
          class: 'business-logic',
          as: 'b',
          method: placed.step.method,
          path: placed.step.path,
          status: placed.step.status,
        });
        if (!result.admitted) break;
        await bench.conclude(
          result.attempt,
          'price-mismatch',
          placed.order === null
            ? verdict(false, `the shop refused an order with quantity ${String(quantity)}`)
            : priceMismatch(placed.order),
        );
        if (bench.findings.some((f) => f.attempt === result.attempt.number)) break;
      }
    }

    const effect = await flows.prepareOnceEffect(bench.attacker);
    if (effect !== null && bench.budgetLeft > 0) {
      ran = true;
      await pause(RATE_WINDOW_MS);
      const raced = await race(bench.asAttacker, effect.request, RACE_SIZE);
      const status = Number(
        Object.entries(raced.statuses).sort(([, a], [, b]) => b - a)[0]?.[0] ?? Number.NaN,
      );
      const result = await bench.record({
        class: 'business-logic',
        as: 'b',
        method: effect.request.method,
        path: new URL(effect.request.url).pathname,
        status: Number.isInteger(status) ? status : null,
      });
      if (result.admitted) {
        await bench.conclude(
          result.attempt,
          'duplicate-effect',
          duplicateEffect(await effect.readBack(), effect.actor),
        );
      }
    }
    return ran;
  }
}
