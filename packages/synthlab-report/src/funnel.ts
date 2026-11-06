import { isKnownEvent, type JanusEvent, type UnknownEvent } from '@janus/shared-kernel';

import type { ReportConfig } from './report-config.js';
import { routeOf } from './route-pattern.js';

export interface FunnelRow {
  readonly variant: string;
  readonly sessions: number;
  readonly steps: readonly {
    readonly name: string;
    readonly route: string;
    readonly reached: number;
    readonly rate: number;
  }[];
}

/**
 * The purchase funnel per variant (F1.10): of the persona sessions, how many reached each step
 * having gone through the ones before it, in order. The competent baseline is a reference and
 * is left out, and so are the sessions the statistics exclude (`excluded`).
 */
export function funnelOf(
  events: readonly (JanusEvent | UnknownEvent)[],
  config: Pick<ReportConfig, 'funnel' | 'routes'>,
  excluded: ReadonlySet<string> = new Set(),
): FunnelRow[] {
  const variantOf = new Map<string, string>();
  const variants = new Set<string>();
  const visits = new Map<string, string[]>();
  for (const event of events.filter(isKnownEvent).sort((a, b) => a.seq - b.seq)) {
    if (event.type === 'session.started') {
      variants.add(event.payload.variant);
      if (event.payload.kind === 'persona' && !excluded.has(event.actor.agentId)) {
        variantOf.set(event.actor.agentId, event.payload.variant);
        visits.set(event.actor.agentId, []);
      }
    }
    if (event.type === 'agent.step') {
      visits.get(event.actor.agentId)?.push(routeOf(event.payload.url, config.routes));
    }
  }

  /** How many funnel steps a session went through, in order. */
  const depth = (routes: readonly string[]): number => {
    let reached = 0;
    for (const route of routes) {
      if (route === config.funnel[reached]?.route) reached += 1;
    }
    return reached;
  };

  return [...variants].sort().map((variant) => {
    const depths = [...visits]
      .filter(([agentId]) => variantOf.get(agentId) === variant)
      .map(([, routes]) => depth(routes));
    return {
      variant,
      sessions: depths.length,
      steps: config.funnel.map((step, index) => {
        const reached = depths.filter((value) => value > index).length;
        return {
          name: step.name,
          route: step.route,
          reached,
          rate: depths.length === 0 ? 0 : reached / depths.length,
        };
      }),
    };
  });
}
