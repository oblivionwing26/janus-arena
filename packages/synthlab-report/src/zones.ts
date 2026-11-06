import {
  isKnownEvent,
  type AgentActionEvent,
  type FrictionSignalEvent,
  type FrictionZone,
  type JanusEvent,
  type PageScreenshotEvent,
  type UnknownEvent,
} from '@janus/shared-kernel';

import { routeOf } from './route-pattern.js';

const WEIGHT = { low: 1, medium: 2, high: 3 } as const;
const MAX_EVIDENCE = 20;

interface Located {
  readonly signal: FrictionSignalEvent;
  readonly agentId: string;
  readonly route: string;
  readonly element: string | null;
  readonly actions: readonly AgentActionEvent[];
}

/** `role=link[name="x"] nth=2` and `role=link[name="x"]` are the same element to a shopper. */
function elementOf(selector: string): string {
  return selector.replace(/ nth=\d+$/, '');
}

/**
 * Where each friction signal happened (F1.10). The route is the page of its first evidence
 * event, so a backtrack A → B → A points at B, the page the shopper fled from; the signal's
 * own URL is the fallback. A signal about the whole session with no URL (extra steps) goes to
 * the page where that session spent most of its steps. The element is the target of the
 * actions it points at, if any.
 */
function locate(
  signal: FrictionSignalEvent,
  byId: ReadonlyMap<string, JanusEvent>,
  stepUrls: ReadonlyMap<string, string>,
  dwell: ReadonlyMap<string, string>,
  patterns: readonly string[],
): Located | undefined {
  const evidence = signal.payload.evidenceEventIds.flatMap((id) => {
    const event = byId.get(id);
    return event === undefined ? [] : [event];
  });
  const agentId = signal.payload.agentId ?? evidence[0]?.actor.agentId;
  if (agentId === undefined) return undefined;

  let url: string | undefined;
  for (const event of evidence) {
    if (event.type === 'agent.step') url = event.payload.url;
    if (event.type === 'agent.action') {
      url = stepUrls.get(`${event.actor.agentId}#${String(event.payload.stepIndex)}`);
    }
    if (url !== undefined) break;
  }
  url ??= signal.payload.url;
  const route = url === undefined ? dwell.get(agentId) : routeOf(url, patterns);
  if (route === undefined) return undefined;

  const actions = evidence.filter(
    (event): event is AgentActionEvent => event.type === 'agent.action',
  );
  const selector = actions.find((action) => action.payload.selector !== undefined)?.payload
    .selector;
  return {
    signal,
    agentId,
    route,
    element: selector === undefined ? null : elementOf(selector),
    actions: actions.filter((action) => action.payload.selector !== undefined),
  };
}

/**
 * Groups a run's friction signals into zones (route, element) and ranks them (F1.10). Each
 * session counts once per zone, by its worst signal there, so one agent looping between two
 * pages does not outrank several shoppers stumbling on the same element. Ties go to the zone
 * that touched more sessions, then to the one with more signals.
 */
export function frictionZones(
  events: readonly (JanusEvent | UnknownEvent)[],
  options: {
    readonly routes?: readonly string[];
    readonly top?: number;
    /** Only the signals of sessions on this variant (session.started), F1.11. */
    readonly variant?: string;
  } = {},
): FrictionZone[] {
  const patterns = options.routes ?? [];
  const known = events.filter(isKnownEvent).sort((a, b) => a.seq - b.seq);
  const variantOf = new Map<string, string>();
  for (const event of known) {
    if (event.type === 'session.started') variantOf.set(event.actor.agentId, event.payload.variant);
  }
  const byId = new Map(known.map((event) => [event.id, event]));
  const stepUrls = new Map<string, string>();
  const screenshots: PageScreenshotEvent[] = [];
  for (const event of known) {
    if (event.type === 'agent.step') {
      stepUrls.set(`${event.actor.agentId}#${String(event.payload.stepIndex)}`, event.payload.url);
    }
    if (event.type === 'page.screenshot') screenshots.push(event);
  }
  const dwell = dwellRoutes(known, patterns);

  const groups = new Map<string, Located[]>();
  for (const event of known) {
    if (event.type !== 'friction.signal') continue;
    const located = locate(event, byId, stepUrls, dwell, patterns);
    if (located === undefined) continue;
    if (options.variant !== undefined && variantOf.get(located.agentId) !== options.variant) {
      continue;
    }
    const key = `${located.route}\u0000${located.element ?? ''}`;
    groups.set(key, [...(groups.get(key) ?? []), located]);
  }

  // A screenshot is taken after the step's action, so it shows the page of the next step; its
  // own `url` is where the step began. The last step of a session has no next one.
  const shots = screenshots.map((shot) => ({
    shot,
    route: routeOf(
      stepUrls.get(`${shot.actor.agentId}#${String(shot.payload.stepIndex + 1)}`) ??
        shot.payload.url,
      patterns,
    ),
  }));
  const zones = [...groups.values()].map((group) => zoneOf(group, shots));
  zones.sort(
    (a, b) =>
      b.intensity - a.intensity ||
      b.sessions - a.sessions ||
      b.signals - a.signals ||
      a.route.localeCompare(b.route) ||
      (a.element ?? '').localeCompare(b.element ?? ''),
  );
  return zones
    .slice(0, options.top ?? zones.length)
    .map((zone, index) => ({ ...zone, rank: index + 1 }));
}

/** Per session, the route it spent most steps on; the first one to get there on a tie. */
function dwellRoutes(
  events: readonly JanusEvent[],
  patterns: readonly string[],
): Map<string, string> {
  const counts = new Map<string, Map<string, number>>();
  for (const event of events) {
    if (event.type !== 'agent.step') continue;
    const routes = counts.get(event.actor.agentId) ?? new Map<string, number>();
    const route = routeOf(event.payload.url, patterns);
    routes.set(route, (routes.get(route) ?? 0) + 1);
    counts.set(event.actor.agentId, routes);
  }
  return new Map(
    [...counts].map(([agentId, routes]) => {
      let best = '';
      let most = 0;
      for (const [route, steps] of routes) {
        if (steps > most) [best, most] = [route, steps];
      }
      return [agentId, best];
    }),
  );
}

function zoneOf(
  group: readonly Located[],
  shots: readonly { readonly shot: PageScreenshotEvent; readonly route: string }[],
): FrictionZone {
  const [first] = group;
  if (first === undefined) throw new Error('A zone has at least one signal');

  const worst = new Map<string, number>();
  const detectors = new Map<FrictionSignalEvent['payload']['detector'], number>();
  for (const { agentId, signal } of group) {
    const weight = WEIGHT[signal.payload.severity];
    worst.set(agentId, Math.max(worst.get(agentId) ?? 0, weight));
    detectors.set(signal.payload.detector, (detectors.get(signal.payload.detector) ?? 0) + 1);
  }

  const boxes = group.flatMap(({ actions }) =>
    actions.flatMap((action) =>
      action.payload.boundingBox === undefined
        ? []
        : [
            {
              ...action.payload.boundingBox,
              agentId: action.actor.agentId,
              stepIndex: action.payload.stepIndex,
            },
          ],
    ),
  );

  // The screenshot of a step where one of these signals fired, else any of the same route.
  const onRoute = shots.filter((entry) => entry.route === first.route).map(({ shot }) => shot);
  const fired = onRoute.find((shot) =>
    group.some(
      ({ agentId, signal }) =>
        shot.actor.agentId === agentId && shot.payload.stepIndex === signal.payload.stepIndex,
    ),
  );
  const shot = fired ?? onRoute[0];

  return {
    rank: 1,
    route: first.route,
    element: first.element,
    intensity: [...worst.values()].reduce((sum, weight) => sum + weight, 0),
    signals: group.length,
    sessions: worst.size,
    detectors: [...detectors]
      .map(([detector, signals]) => ({ detector, signals }))
      .sort((a, b) => b.signals - a.signals || a.detector.localeCompare(b.detector)),
    boxes,
    screenshot:
      shot === undefined
        ? null
        : {
            agentId: shot.actor.agentId,
            stepIndex: shot.payload.stepIndex,
            artifact: shot.payload.artifact,
          },
    evidenceEventIds: [
      ...new Set(group.flatMap(({ signal }) => signal.payload.evidenceEventIds)),
    ].slice(0, MAX_EVIDENCE),
  };
}
