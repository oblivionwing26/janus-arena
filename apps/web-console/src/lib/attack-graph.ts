import {
  isKnownEvent,
  type FindingCreatedEvent,
  type PatchProposedEvent,
  type SurfaceMappedEvent,
  type VerificationResultEvent,
} from '@janus/shared-kernel';

import type { ConsoleEvent } from './console-event';
import { SEVERITIES, type Severity } from './security';

/** Where an endpoint stands (F3.10), from the events seen so far. */
export type NodeState = 'untested' | 'probed' | 'exploited' | 'patched' | 'verified';

export const NODE_STATES: readonly NodeState[] = [
  'untested',
  'probed',
  'exploited',
  'patched',
  'verified',
];

export const STATE_LABELS: Record<NodeState, string> = {
  untested: 'sin probar',
  probed: 'probado',
  exploited: 'explotado',
  patched: 'parcheado',
  verified: 'verificado',
};

export type AttackerId = 'anonymous' | 'a' | 'b';

export const ATTACKER_LABELS: Record<AttackerId, string> = {
  anonymous: 'Anónimo',
  a: 'Usuario A',
  b: 'Usuario B',
};

export interface AttemptView {
  readonly attemptId: string;
  readonly number: number;
  readonly testType: string;
  readonly as: AttackerId;
  readonly method: string;
  readonly path: string;
  readonly status: number | null;
  readonly blocked: string | null;
  /** The oracle's verdict, once it came. */
  readonly verdict: { readonly exploitable: boolean; readonly evidence: string } | null;
}

export interface FindingView {
  readonly findingId: string;
  readonly severity: Severity;
  readonly title: string;
  readonly confirmed: boolean;
  /** Where the PoC is: the run that saved it, for `GET /runs/:id/pocs/:findingId`. */
  readonly pocRunId: string | null;
}

export interface PatchView {
  readonly patchId: string;
  readonly findingId: string;
  readonly branch: string;
  readonly summary: string | null;
  readonly diff: string;
  readonly verifiers: readonly {
    readonly verifier: VerificationResultEvent['payload']['verifier'];
    readonly passed: boolean;
    readonly details: string | null;
  }[];
}

export interface Remediation {
  readonly findingId: string;
  readonly status: 'fixed' | 'open';
  readonly iterations: number;
  readonly reason: string | null;
}

export interface GraphNode {
  /** `GET /rest/basket/:id` */
  readonly id: string;
  readonly method: string;
  readonly route: string;
  readonly state: NodeState;
  /** The worst severity among the endpoint's findings. */
  readonly severity: Severity | null;
  readonly attempts: readonly AttemptView[];
  readonly findings: readonly FindingView[];
  readonly patches: readonly PatchView[];
  readonly remediations: readonly Remediation[];
  readonly position: { readonly x: number; readonly y: number };
}

export interface GraphAttacker {
  readonly id: AttackerId;
  readonly label: string;
  readonly position: { readonly x: number; readonly y: number };
}

export interface GraphEdge {
  readonly id: string;
  readonly source: AttackerId;
  readonly target: string;
  readonly testType: string;
  /** How many attempts of this class this attacker made on the endpoint. */
  readonly count: number;
  readonly exploitable: boolean;
}

export interface AttackGraph {
  readonly attackers: readonly GraphAttacker[];
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
}

interface SurfaceEndpoint {
  readonly method: string;
  readonly route: string;
}

const METHODS = 'GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|ALL';
const TITLE_ENDPOINT = new RegExp(`: ((?:${METHODS}) \\S+) \\(`);

/** The surface endpoint a concrete request path belongs to (`/rest/basket/6` → `/rest/basket/:id`). */
function matchEndpoint(
  method: string,
  path: string,
  surface: readonly SurfaceEndpoint[],
): string | null {
  for (const endpoint of surface) {
    if (endpoint.method !== method && endpoint.method !== 'ALL') continue;
    const pattern = endpoint.route
      .split('/')
      .map((part) => (part.startsWith(':') ? '[^/]+' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('/');
    if (new RegExp(`^${pattern}/?$`).test(path)) return `${endpoint.method} ${endpoint.route}`;
  }
  return null;
}

const COLUMNS = 3;
const CELL = { width: 270, height: 84 };
const ORIGIN = { x: 420, y: 0 };
const ATTACKER_GAP = 150;

/**
 * The attack graph of a gate's events, or of any run's (F3.10): nodes are the HTTP endpoints of
 * the surface map, edges are attack attempts from who made them. It is a pure function of the
 * events seen so far, so the live view and the replay draw the same graph. Events may come from
 * several runs (a gate's Red Team and Blue Team runs): the attempts of a Blue Team run replay a
 * PoC on a patched variant, so they belong to that fix's verifiers, not to the attack.
 */
export function buildAttackGraph(events: readonly ConsoleEvent[]): AttackGraph {
  const known = events.filter(isKnownEvent);
  const blueRuns = new Set(
    known.flatMap((event) =>
      event.type === 'patch.proposed' && event.payload.author === 'blue-team' ? [event.runId] : [],
    ),
  );

  const surface = new Map<string, SurfaceEndpoint>();
  const verdicts = new Map<string, { exploitable: boolean; evidence: string }>();
  const confirmedIn = new Map<string, string>();
  const verifiersOf = new Map<string, PatchView['verifiers'][number][]>();
  const remediationOf = new Map<string, Remediation>();
  for (const event of known) {
    switch (event.type) {
      case 'surface.mapped':
        for (const { method, route } of (event.payload as SurfaceMappedEvent['payload'])
          .endpoints) {
          surface.set(`${method} ${route}`, { method, route });
        }
        break;
      case 'attack.verdict':
        if (!blueRuns.has(event.runId)) {
          verdicts.set(event.payload.attemptId, {
            exploitable: event.payload.exploitable,
            evidence: event.payload.evidence,
          });
        }
        break;
      case 'finding.confirmed':
        confirmedIn.set(event.payload.findingId, event.runId);
        break;
      case 'verification.result': {
        const list = verifiersOf.get(event.payload.patchId) ?? [];
        list.push({
          verifier: event.payload.verifier,
          passed: event.payload.passed,
          details: event.payload.details ?? null,
        });
        verifiersOf.set(event.payload.patchId, list);
        break;
      }
      case 'finding.remediated':
        remediationOf.set(event.payload.findingId, {
          findingId: event.payload.findingId,
          status: event.payload.status,
          iterations: event.payload.iterations,
          reason: event.payload.reason ?? null,
        });
        break;
      default:
        break;
    }
  }
  const surfaceList = [...surface.values()];

  // Attempts, by the endpoint they count against.
  const attemptEndpoint = new Map<string, string>();
  const attemptsAt = new Map<string, AttemptView[]>();
  for (const event of known) {
    if (event.type !== 'attack.attempt' || blueRuns.has(event.runId)) continue;
    const { payload } = event;
    const key =
      payload.endpoint ??
      matchEndpoint(payload.method, payload.path, surfaceList) ??
      `${payload.method} ${payload.path}`;
    attemptEndpoint.set(payload.attemptId, key);
    const list = attemptsAt.get(key) ?? [];
    list.push({
      attemptId: payload.attemptId,
      number: payload.number,
      testType: payload.testType,
      as: payload.as,
      method: payload.method,
      path: payload.path,
      status: payload.status,
      blocked: payload.blocked ?? null,
      verdict: null,
    });
    attemptsAt.set(key, list);
  }

  // Dynamic findings, by the endpoint they name.
  const findingsAt = new Map<string, FindingView[]>();
  const findingEndpoint = new Map<string, string>();
  for (const event of known) {
    if (event.type !== 'finding.created' || event.payload.kind !== 'dynamic') continue;
    const payload: FindingCreatedEvent['payload'] = event.payload;
    const key =
      payload.endpoint ??
      (payload.attemptId === undefined ? undefined : attemptEndpoint.get(payload.attemptId)) ??
      TITLE_ENDPOINT.exec(payload.title)?.[1];
    if (key === undefined) continue;
    findingEndpoint.set(payload.findingId, key);
    const list = findingsAt.get(key) ?? [];
    list.push({
      findingId: payload.findingId,
      severity: payload.severity,
      title: payload.title,
      confirmed: payload.status === 'confirmed' || confirmedIn.has(payload.findingId),
      pocRunId: confirmedIn.get(payload.findingId) ?? null,
    });
    findingsAt.set(key, list);
  }

  // The Blue Team's patches, by the endpoint of the finding they fix.
  const patchesAt = new Map<string, PatchView[]>();
  for (const event of known) {
    if (event.type !== 'patch.proposed' || event.payload.author !== 'blue-team') continue;
    const payload: PatchProposedEvent['payload'] = event.payload;
    const key =
      payload.findingId === undefined ? undefined : findingEndpoint.get(payload.findingId);
    if (key === undefined || payload.findingId === undefined) continue;
    const list = patchesAt.get(key) ?? [];
    list.push({
      patchId: payload.patchId,
      findingId: payload.findingId,
      branch: payload.branch,
      summary: payload.summary ?? null,
      diff: payload.diff,
      verifiers: verifiersOf.get(payload.patchId) ?? [],
    });
    patchesAt.set(key, list);
  }

  const keys = new Set([...surface.keys(), ...attemptsAt.keys(), ...findingsAt.keys()]);
  const nodes = [...keys].map((id): Omit<GraphNode, 'position'> => {
    const [method = '', ...rest] = id.split(' ');
    const attempts = (attemptsAt.get(id) ?? []).map((attempt) => ({
      ...attempt,
      verdict: verdicts.get(attempt.attemptId) ?? null,
    }));
    const findings = findingsAt.get(id) ?? [];
    const patches = patchesAt.get(id) ?? [];
    const remediations = findings.flatMap(({ findingId }) => {
      const remediation = remediationOf.get(findingId);
      return remediation === undefined ? [] : [remediation];
    });
    const fixed = remediations.some((each) => each.status === 'fixed');
    const open = remediations.some((each) => each.status === 'open');
    let state: NodeState = 'untested';
    if (fixed) state = 'verified';
    else if (patches.length > 0 && !open) state = 'patched';
    else if (findings.length > 0 || attempts.some((each) => each.verdict?.exploitable === true)) {
      state = 'exploited';
    } else if (attempts.length > 0) state = 'probed';
    const worst = findings.reduce<Severity | null>(
      (best, { severity }) =>
        best === null || SEVERITIES.indexOf(severity) < SEVERITIES.indexOf(best) ? severity : best,
      null,
    );
    return {
      id,
      method,
      route: rest.join(' '),
      state,
      severity: worst,
      attempts,
      findings,
      patches,
      remediations,
    };
  });

  // The attackers who appear, and the edges from them.
  const edges = new Map<string, { edge: Omit<GraphEdge, 'id'>; id: string }>();
  for (const node of nodes) {
    for (const attempt of node.attempts) {
      const id = `${attempt.as}|${node.id}|${attempt.testType}`;
      const current = edges.get(id)?.edge;
      edges.set(id, {
        id,
        edge: {
          source: attempt.as,
          target: node.id,
          testType: attempt.testType,
          count: (current?.count ?? 0) + 1,
          exploitable: (current?.exploitable ?? false) || attempt.verdict?.exploitable === true,
        },
      });
    }
  }
  const present = new Set([...edges.values()].map(({ edge }) => edge.source));
  const attackerOrder: AttackerId[] = ['anonymous', 'a', 'b'];
  const attackers = attackerOrder
    .filter((id) => present.has(id))
    .map((id, index, all) => ({
      id,
      label: ATTACKER_LABELS[id],
      position: { x: 0, y: (index - (all.length - 1) / 2) * ATTACKER_GAP + 160 },
    }));

  // Touched endpoints first, near the attackers; the untested ones fill the grid after them.
  const ordered = [...nodes].sort(
    (a, b) =>
      Number(a.state === 'untested') - Number(b.state === 'untested') || a.id.localeCompare(b.id),
  );
  const placed = ordered.map((node, index): GraphNode => ({
    ...node,
    position: {
      x: ORIGIN.x + (index % COLUMNS) * CELL.width,
      y: ORIGIN.y + Math.floor(index / COLUMNS) * CELL.height,
    },
  }));

  return {
    attackers,
    nodes: placed,
    edges: [...edges.values()]
      .map(({ id, edge }) => ({ id, ...edge }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
}
