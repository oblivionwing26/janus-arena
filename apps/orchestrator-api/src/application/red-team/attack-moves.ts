import type { AttackRequest } from '../../domain/attack/attack-request.js';
import type { BrowserAttackPort } from '../../domain/attack/browser-attack-port.js';
import { xssPayloads } from '../../domain/attack/xss-candidates.js';
import { duplicateEffect } from '../../domain/oracles/duplicate-effect.js';
import { verdict, type OracleVerdict } from '../../domain/oracles/oracle-verdict.js';
import { priceMismatch } from '../../domain/oracles/price-mismatch.js';
import { scriptExecuted } from '../../domain/oracles/script-executed.js';
import { race } from '../attack/race.js';
import type { AttackBench } from './attack-bench.js';

/** What one move did: refused by the limits, or done and judged (null: nothing to judge). */
export type MoveResult =
  | { readonly admitted: false; readonly limit?: 'endpoint' | 'run' }
  | { readonly admitted: true; readonly verdict: OracleVerdict | null };

// A race must start on an empty rate window, or the guard blocks its overflow.
const RATE_WINDOW_MS = 1_100;

const pause = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

/** The page a URL shows, for the record: its path plus a hash route, never its query. */
function pageOf(url: string): string {
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.hash.split('?')[0] ?? ''}`;
}

/**
 * The Red Team's moves (F3.3, F3.4): each makes one attempt through the bench, judges it with its
 * oracle and, when the oracle confirms it, leaves the PoC that reproduces it. The deterministic
 * engine plays them over its candidates; the PoC runner plays the one a PoC names, with the
 * values a fresh run binds. There is no other way to attack.
 */

/** One HTTP request (IDOR, login bypass), judged by its class's oracle. */
export async function tryRequest(bench: AttackBench, request: AttackRequest): Promise<MoveResult> {
  const sent = await bench.send(request);
  if (!sent.admitted) {
    return sent.limit === undefined ? { admitted: false } : { admitted: false, limit: sent.limit };
  }
  return { admitted: true, verdict: await bench.judge(sent.attempt) };
}

/**
 * One visit to a reflected field with one of the engine's payloads, built with `marker`. The
 * template is absolute (as the crawler found it); the PoC keeps it relative to the origin.
 */
export async function tryXss(
  bench: AttackBench,
  browser: BrowserAttackPort,
  template: string,
  payload: number,
  marker: string,
): Promise<MoveResult> {
  const text = xssPayloads(marker)[payload];
  if (text === undefined || bench.budgetLeft === 0) return { admitted: false, limit: 'run' };
  const url = template.replace('{payload}', encodeURIComponent(text));
  const visit = await browser.visit(bench.origin, url);
  const recorded = await bench.record({
    class: 'xss',
    as: 'anonymous',
    method: 'GET',
    path: pageOf(url),
    status: visit.status,
    ...(visit.blocked === null ? {} : { blocked: visit.blocked }),
  });
  if (!recorded.admitted) {
    return recorded.limit === undefined
      ? { admitted: false }
      : { admitted: false, limit: recorded.limit };
  }
  if (visit.blocked !== null) return { admitted: true, verdict: null };
  const judged = scriptExecuted(visit.dialogs, marker);
  await bench.conclude(recorded.attempt, 'script-executed', judged, {
    kind: 'xss',
    template: template.startsWith(bench.origin) ? template.slice(bench.origin.length) : template,
    payload,
  });
  return { admitted: true, verdict: judged };
}

/** One order with an item's quantity set to `quantity`, judged by price mismatch. */
export async function tryOrderQuantity(bench: AttackBench, quantity: number): Promise<MoveResult> {
  if (bench.budgetLeft === 0) return { admitted: false, limit: 'run' };
  const placed = await bench.target.businessLogic.orderWithQuantity(bench.attacker, quantity);
  const recorded = await bench.record({
    class: 'business-logic',
    as: 'b',
    method: placed.step.method,
    path: placed.step.path,
    status: placed.step.status,
  });
  if (!recorded.admitted) {
    return recorded.limit === undefined
      ? { admitted: false }
      : { admitted: false, limit: recorded.limit };
  }
  const judged =
    placed.order === null
      ? verdict(false, `the shop refused an order with quantity ${String(quantity)}`)
      : priceMismatch(placed.order);
  await bench.conclude(recorded.attempt, 'price-mismatch', judged, {
    kind: 'order-quantity',
    quantity,
  });
  return { admitted: true, verdict: judged };
}

/**
 * A race of `size` identical requests on the target's once-per-user effect, judged by duplicate
 * effect. Not admitted when the target has no such effect.
 */
export async function tryRace(bench: AttackBench, size: number): Promise<MoveResult> {
  if (bench.budgetLeft === 0) return { admitted: false, limit: 'run' };
  const effect = await bench.target.businessLogic.prepareOnceEffect(bench.attacker);
  if (effect === null) return { admitted: false };
  await pause(RATE_WINDOW_MS);
  const raced = await race(bench.asAttacker, effect.request, size);
  const status = Number(
    Object.entries(raced.statuses).sort(([, a], [, b]) => b - a)[0]?.[0] ?? Number.NaN,
  );
  const recorded = await bench.record({
    class: 'business-logic',
    as: 'b',
    method: effect.request.method,
    path: new URL(effect.request.url).pathname,
    status: Number.isInteger(status) ? status : null,
  });
  if (!recorded.admitted) {
    return recorded.limit === undefined
      ? { admitted: false }
      : { admitted: false, limit: recorded.limit };
  }
  const judged = duplicateEffect(await effect.readBack(), effect.actor);
  await bench.conclude(recorded.attempt, 'duplicate-effect', judged, {
    kind: 'once-effect-race',
    size,
  });
  return { admitted: true, verdict: judged };
}
