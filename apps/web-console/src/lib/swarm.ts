import { isKnownEvent } from '@janus/shared-kernel';
import { routeOf } from '@janus/synthlab-report';

import type { ConsoleEvent } from './console-event';

/** Where a session is: still moving, or ended one way or the other. */
export type AgentStatus = 'navigating' | 'success' | 'abandon';

export interface SwarmNode {
  readonly route: string;
  /** Agent steps observed on this route. */
  readonly visits: number;
}

export interface SwarmEdge {
  readonly from: string;
  readonly to: string;
  readonly count: number;
}

export interface SwarmAgent {
  readonly agentId: string;
  readonly variant: string | undefined;
  readonly route: string;
  readonly status: AgentStatus;
  readonly steps: number;
}

/** A friction signal shown as a pulse on the agent and route it points at. */
export interface SwarmPulse {
  /** The signal's event id: a pulse is animated once, when it first appears. */
  readonly id: string;
  readonly agentId: string;
  readonly route: string;
  readonly detector: string;
}

export interface SwarmModel {
  readonly nodes: readonly SwarmNode[];
  readonly edges: readonly SwarmEdge[];
  readonly agents: readonly SwarmAgent[];
  readonly pulses: readonly SwarmPulse[];
}

interface MutableAgent {
  agentId: string;
  variant: string | undefined;
  route: string | undefined;
  status: AgentStatus;
  steps: number;
}

/**
 * The swarm at the replay cursor (F1.12), the same for live runs and replays: nodes are the
 * routes agents visited, edges the transitions between them, each agent sits on its latest
 * route. `known` is every event received so far; friction signals are computed when a run
 * ends, so a signal pulses as soon as the step it points at is on screen: in a replay that is
 * its real moment, in a live run the moment the signal arrives.
 */
export function buildSwarm(
  visible: readonly ConsoleEvent[],
  known: readonly ConsoleEvent[] = visible,
): SwarmModel {
  const visits = new Map<string, number>();
  const edges = new Map<string, SwarmEdge>();
  const agents = new Map<string, MutableAgent>();
  const stepRoutes = new Map<string, string>();

  const agentOf = (agentId: string): MutableAgent => {
    let agent = agents.get(agentId);
    if (agent === undefined) {
      agent = { agentId, variant: undefined, route: undefined, status: 'navigating', steps: 0 };
      agents.set(agentId, agent);
    }
    return agent;
  };

  for (const event of visible) {
    if (!isKnownEvent(event)) continue;
    switch (event.type) {
      case 'session.started':
        agentOf(event.actor.agentId).variant = event.payload.variant;
        break;
      case 'agent.step': {
        const agent = agentOf(event.actor.agentId);
        const route = routeOf(event.payload.url);
        stepRoutes.set(`${agent.agentId}#${String(event.payload.stepIndex)}`, route);
        visits.set(route, (visits.get(route) ?? 0) + 1);
        if (agent.route !== undefined && agent.route !== route) {
          const key = `${agent.route}\u0000${route}`;
          const edge = edges.get(key);
          edges.set(key, { from: agent.route, to: route, count: (edge?.count ?? 0) + 1 });
        }
        agent.route = route;
        agent.steps += 1;
        break;
      }
      case 'session.ended':
        agentOf(event.actor.agentId).status =
          event.payload.outcome === 'success' ? 'success' : 'abandon';
        break;
      default:
        break;
    }
  }

  const pulses: SwarmPulse[] = [];
  for (const event of known) {
    if (!isKnownEvent(event) || event.type !== 'friction.signal') continue;
    const { agentId, stepIndex } = event.payload;
    if (agentId === undefined || stepIndex === undefined) continue;
    const route = stepRoutes.get(`${agentId}#${String(stepIndex)}`);
    if (route === undefined) continue;
    pulses.push({ id: event.id, agentId, route, detector: event.payload.detector });
  }

  return {
    nodes: [...visits]
      .map(([route, count]) => ({ route, visits: count }))
      .sort((a, b) => a.route.localeCompare(b.route)),
    edges: [...edges.values()],
    agents: [...agents.values()].flatMap((agent) =>
      agent.route === undefined
        ? []
        : [
            {
              agentId: agent.agentId,
              variant: agent.variant,
              route: agent.route,
              status: agent.status,
              steps: agent.steps,
            },
          ],
    ),
    pulses,
  };
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Deterministic positions for the nodes (F1.12): columns by distance from the home page over
 * the observed transitions (unreachable routes in a last column), and within a column the
 * busiest route first. Coordinates are in a `width` × `height` box.
 */
export function layoutSwarm(
  model: Pick<SwarmModel, 'nodes' | 'edges'>,
  size: { readonly width: number; readonly height: number },
): Map<string, Point> {
  const depth = new Map<string, number>();
  const start = model.nodes.some((node) => node.route === '/') ? '/' : model.nodes[0]?.route;
  if (start !== undefined) {
    depth.set(start, 0);
    const queue = [start];
    for (let route = queue.shift(); route !== undefined; route = queue.shift()) {
      const here = depth.get(route) ?? 0;
      for (const edge of model.edges) {
        if (edge.from === route && !depth.has(edge.to)) {
          depth.set(edge.to, here + 1);
          queue.push(edge.to);
        }
      }
    }
  }
  const deepest = Math.max(0, ...depth.values());
  const columns = new Map<number, SwarmNode[]>();
  for (const node of model.nodes) {
    const column = depth.get(node.route) ?? deepest + 1;
    columns.set(column, [...(columns.get(column) ?? []), node]);
  }

  const count = Math.max(1, ...[...columns.keys()].map((column) => column + 1));
  const positions = new Map<string, Point>();
  for (const [column, nodes] of columns) {
    nodes.sort((a, b) => b.visits - a.visits || a.route.localeCompare(b.route));
    nodes.forEach((node, index) => {
      positions.set(node.route, {
        x: Math.round(((column + 0.5) / count) * size.width),
        y: Math.round(((index + 0.5) / nodes.length) * size.height),
      });
    });
  }
  return positions;
}

/** A stable offset around a node, so agents on the same route do not hide each other. */
export function agentOffset(agentId: string, radius: number): Point {
  let hash = 2166136261;
  for (let index = 0; index < agentId.length; index++) {
    hash = Math.imul(hash ^ agentId.charCodeAt(index), 16777619);
  }
  const unit = (hash >>> 0) / 2 ** 32;
  const angle = unit * 2 * Math.PI;
  const distance = radius * (0.35 + 0.65 * (((hash >>> 8) & 0xff) / 255));
  return { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
}
