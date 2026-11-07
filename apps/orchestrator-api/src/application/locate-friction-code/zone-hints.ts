import {
  isKnownEvent,
  type AgentStepEvent,
  type FrictionZone,
  type JanusEvent,
  type UnknownEvent,
} from '@janus/shared-kernel';
import { routeOf } from '@janus/synthlab-report';

/** What a friction zone tells us to look for in the target's code (F2.2). */
export interface ZoneHints {
  readonly route: string;
  /** The element the agents acted on, when the zone has one. */
  readonly element: {
    readonly role: string;
    readonly name: string;
    readonly selector: string;
  } | null;
  /** Texts seen on the zone's page by its sessions, most frequent first, site chrome left out. */
  readonly texts: readonly string[];
  /** Validation errors shown there. */
  readonly alerts: readonly string[];
}

const SELECTOR = /^role=([a-z]+)\[name="((?:[^"\\]|\\.)*)"\]/;

/** Prices, counts and other texts too short or too generic to find code with. */
function searchable(text: string): boolean {
  return text.length >= 3 && !/^[\d\s.,:€%+\-−×x/]+$/i.test(text);
}

/**
 * The hints of a zone, from the run's events only: the element's role and accessible name, and
 * the texts (agent.step `texts`, F2.2) and alerts of the steps its sessions spent on its route.
 * Texts seen on at least half of all the routes of the run are navigation chrome (header, menu)
 * and say nothing about this page, so they are left out.
 */
export function zoneHints(
  zone: Pick<FrictionZone, 'route' | 'element' | 'evidenceEventIds'>,
  events: readonly (JanusEvent | UnknownEvent)[],
  routes: readonly string[] = [],
): ZoneHints {
  const known = events.filter(isKnownEvent);
  const evidence = new Set(zone.evidenceEventIds);
  const agents = new Set(
    known.filter((event) => evidence.has(event.id)).map((event) => event.actor.agentId),
  );
  const steps = known.filter((event): event is AgentStepEvent => event.type === 'agent.step');

  const routesOfText = new Map<string, Set<string>>();
  const allRoutes = new Set<string>();
  for (const step of steps) {
    const route = routeOf(step.payload.url, routes);
    allRoutes.add(route);
    for (const text of step.payload.texts ?? []) {
      routesOfText.set(text, (routesOfText.get(text) ?? new Set()).add(route));
    }
  }
  const chrome = (text: string) =>
    allRoutes.size > 1 && (routesOfText.get(text)?.size ?? 0) >= allRoutes.size / 2;

  const counts = new Map<string, number>();
  const alerts = new Set<string>();
  for (const step of steps) {
    if (!agents.has(step.actor.agentId)) continue;
    if (routeOf(step.payload.url, routes) !== zone.route) continue;
    for (const text of step.payload.texts ?? []) {
      if (searchable(text) && !chrome(text)) counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    for (const alert of step.payload.alerts ?? []) alerts.add(alert);
  }

  const parsed = zone.element === null ? null : SELECTOR.exec(zone.element);
  return {
    route: zone.route,
    element:
      parsed?.[1] === undefined || parsed[2] === undefined || zone.element === null
        ? null
        : { role: parsed[1], name: parsed[2].replace(/\\(.)/g, '$1'), selector: zone.element },
    texts: [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([text]) => text),
    alerts: [...alerts],
  };
}
