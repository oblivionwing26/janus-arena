import {
  CANARY_CHECK,
  isKnownEvent,
  type JanusEvent,
  type UnknownEvent,
} from '@janus/shared-kernel';
import { abSummary, wilsonInterval, type RateInterval } from '@janus/stats';

/** What a saboteur did, by task, on one variant. */
export interface SaboteurOutcome {
  readonly task: string;
  /** Saboteurs of this task that got a verdict. */
  readonly verdicts: number;
  /** Of those, how many the oracle found exploitable: nothing stopped them. */
  readonly exploitable: number;
  /** For each saboteur the shop refused: how many requests were answered before the first refusal. */
  readonly refusedAfter: readonly number[];
}

/** The three curves of Launch Day (F4.1) on one variant, with the numbers behind them. */
export interface LaunchDayVariant {
  readonly variant: string;
  readonly legitimate: {
    /** Synthetic shoppers (personas) that ended validly. */
    readonly sessions: number;
    /** Task success of those shoppers. Null without any. */
    readonly success: RateInterval | null;
    /** Share that met a defense: a 429 anywhere, or a 403 at checkout. Null without any. */
    readonly blocked: RateInterval | null;
    /**
     * The middle number of agent steps those shoppers took: what a defense that does not block
     * anyone (a step-up code) still costs them. Null without any.
     */
    readonly medianSteps: number | null;
  };
  readonly attacks: {
    /** Share of saboteur verdicts that were exploitable. Null without verdicts. */
    readonly success: RateInterval | null;
    readonly byTask: readonly SaboteurOutcome[];
  };
  /** Shoppers whose orders carried the canary of another session: the run kept nothing apart. */
  readonly contaminated: number;
}

export interface LaunchDayCurves {
  readonly variants: readonly LaunchDayVariant[];
}

const REFUSED = new Set([429, 503]);

/** The middle value (the mean of the two middle ones for an even count); null when empty. */
function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? (sorted[mid] ?? null)
    : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** A response that shows a defense stopped a shopper: the rate limit, or the checkout step-up. */
function isDefenseResponse(status: number, url: string): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  try {
    return new URL(url).pathname === '/api/checkout';
  } catch {
    return false;
  }
}

/**
 * The three curves of a Launch Day run (F4.1), per variant and from its events only: how well
 * the legitimate shoppers do, how well the saboteurs do, and how many shoppers a defense stood in
 * the way of. Shoppers are the personas; the competent baseline is a reference. Only sessions
 * that ended validly count, as in the statistics. A defense is judged by all three together:
 * attacks that fail are worth little if the shoppers fail with them.
 */
export function launchDayCurves(events: readonly (JanusEvent | UnknownEvent)[]): LaunchDayCurves {
  const known = events.filter(isKnownEvent).sort((a, b) => a.seq - b.seq);
  const summary = abSummary(events);
  const excluded = new Set(summary.excluded.map((entry) => entry.agentId));

  const variantOf = new Map<string, string>();
  const shoppers = new Set<string>();
  const saboteurs = new Set<string>();
  for (const event of known) {
    if (event.type !== 'session.started') continue;
    variantOf.set(event.actor.agentId, event.payload.variant);
    if (event.payload.kind === 'saboteur' || event.payload.role === 'saboteur') {
      saboteurs.add(event.actor.agentId);
    } else if (event.payload.kind === 'persona') {
      shoppers.add(event.actor.agentId);
    }
  }
  const validShoppers = [...shoppers].filter((agentId) => !excluded.has(agentId));

  const steps = new Map<string, number>();
  const blocked = new Set<string>();
  const contaminated = new Set<string>();
  const attempts = new Map<string, { agentId: string; task: string }>();
  const answered = new Map<string, number>();
  const refusedAfter = new Map<string, number>();
  const verdicts: { agentId: string; task: string; exploitable: boolean }[] = [];
  for (const event of known) {
    const agentId = event.actor.agentId;
    if (event.type === 'page.error' && shoppers.has(agentId)) {
      const { status, url, kind } = event.payload;
      if (kind === 'http' && status !== undefined && isDefenseResponse(status, url)) {
        blocked.add(agentId);
      }
    } else if (event.type === 'session.ended' && shoppers.has(agentId)) {
      steps.set(agentId, event.payload.steps);
    } else if (event.type === 'task.verified' && shoppers.has(agentId)) {
      const check = event.payload.checks.find((each) => each.check === CANARY_CHECK);
      if (check?.passed === false) contaminated.add(agentId);
    } else if (event.type === 'attack.attempt' && saboteurs.has(agentId)) {
      attempts.set(event.payload.attemptId, { agentId, task: event.payload.testType });
      const { status } = event.payload;
      if (status !== null && REFUSED.has(status)) {
        if (!refusedAfter.has(agentId)) refusedAfter.set(agentId, answered.get(agentId) ?? 0);
      } else if (!refusedAfter.has(agentId) && status !== null) {
        answered.set(agentId, (answered.get(agentId) ?? 0) + 1);
      }
    } else if (event.type === 'attack.verdict') {
      const attempt = attempts.get(event.payload.attemptId);
      if (attempt !== undefined) {
        verdicts.push({
          agentId: attempt.agentId,
          task: event.payload.testType,
          exploitable: event.payload.exploitable,
        });
      }
    }
  }

  const names = [...new Set(variantOf.values())].sort();
  return {
    variants: names.map((variant): LaunchDayVariant => {
      const here = validShoppers.filter((agentId) => variantOf.get(agentId) === variant);
      const mine = verdicts.filter((verdict) => variantOf.get(verdict.agentId) === variant);
      const tasks = [...new Set(mine.map((verdict) => verdict.task))].sort();
      return {
        variant,
        legitimate: {
          sessions: here.length,
          success: summary.variants.find((each) => each.variant === variant)?.personas ?? null,
          medianSteps: median(here.flatMap((agentId) => steps.get(agentId) ?? [])),
          blocked:
            here.length === 0
              ? null
              : wilsonInterval(here.filter((agentId) => blocked.has(agentId)).length, here.length),
        },
        attacks: {
          success:
            mine.length === 0
              ? null
              : wilsonInterval(mine.filter((verdict) => verdict.exploitable).length, mine.length),
          byTask: tasks.map((task): SaboteurOutcome => {
            const ofTask = mine.filter((verdict) => verdict.task === task);
            return {
              task,
              verdicts: ofTask.length,
              exploitable: ofTask.filter((verdict) => verdict.exploitable).length,
              refusedAfter: ofTask
                .flatMap((verdict) => {
                  const after = refusedAfter.get(verdict.agentId);
                  return after === undefined ? [] : [after];
                })
                .sort((a, b) => a - b),
            };
          }),
        },
        contaminated: here.filter((agentId) => contaminated.has(agentId)).length,
      };
    }),
  };
}
