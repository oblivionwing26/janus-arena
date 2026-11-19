// Phase 4 of the launch page, "the two faces": each page of Juice Shop as the synthetic shoppers
// lived it (SynthLab run) and as the Red Team found it (attack tree). The bridge between the two is
// real: the API calls the shoppers' own browser made from each page.

import type { AttackTree, LeafState, RunEvent } from './attack-tree';

export interface FacePage {
  route: string;
  label: string;
  /** Agent steps taken on this page, across all sessions. */
  steps: number;
  /** Sessions that reached the page, out of `sessions` in the run. */
  reached: number;
  /** Personas that reached it (persona ids). */
  personas: string[];
  /** Friction signals on this page by detector. */
  friction: Record<string, number>;
  /** API endpoints the page called, with what the Red Team found there (null: not attacked). */
  endpoints: { endpoint: string; calls: number; state: LeafState | null }[];
  /** What the Red Team found on the page itself (a client route such as /#/search). */
  pageState: LeafState | null;
}

export interface TwoFaces {
  sessions: number;
  passed: number;
  pages: FacePage[];
}

/** The purchase funnel, in order; any other route is left out. */
const FUNNEL: readonly [string, string][] = [
  ['/', 'Home'],
  ['/search', 'Search'],
  ['/login', 'Log in'],
  ['/basket', 'Basket'],
  ['/address/select', 'Address'],
  ['/delivery-method', 'Delivery'],
  ['/payment/shop', 'Payment'],
  ['/order-summary', 'Summary'],
  ['/order-completion/:id', 'Order placed'],
];

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** The client route of a Juice Shop URL: "http://x/#/order-completion/af-7" → "/order-completion/:id". */
export function clientRoute(url: string): string {
  const m = /#(\/[^?]*)/.exec(url);
  const route = m?.[1] ?? '/';
  if (route.startsWith('/order-completion/')) return '/order-completion/:id';
  return route.replace(/\/\d+(?=\/|$)/g, '/:id');
}

/** "GET /api/Cards/12?x" → "GET /api/Cards/:id"; only the API, not assets or sockets. */
export function apiEndpoint(method: string, path: string): string | null {
  const clean = path.split('?')[0] ?? path;
  if (!clean.startsWith('/api') && !clean.startsWith('/rest')) return null;
  const folded = clean
    .replace(/\/[0-9a-f]{4}-[0-9a-f]{16}(?=\/|$)/g, '/:id') // order codes such as 1be8-02be38c5f27bee93
    .replace(/\/\d+(?=\/|$)/g, '/:id')
    .replace(/\/$/, '');
  return `${method} ${folded}`;
}

/** Paths the scope policy excludes (ground truth and admin config): never shown. */
function excluded(endpoint: string, patterns: readonly string[]): boolean {
  const path = endpoint.slice(endpoint.indexOf(' ') + 1);
  return patterns.some((p) => {
    const base = p.replace(/\*\*$/, '').replace(/\*$/, '');
    return p.endsWith('*') ? path.startsWith(base.replace(/\/$/, '')) : path === p;
  });
}

const RANK: LeafState[] = ['exploited', 'fixed', 'blocked', 'refused'];

export function buildTwoFaces(
  synthlab: readonly RunEvent[],
  tree: AttackTree,
  excludedPaths: readonly string[],
): TwoFaces {
  const stateOf = new Map<string, LeafState>();
  for (const leaf of tree.classes.flatMap((c) => c.leaves)) {
    const now = stateOf.get(leaf.endpoint);
    if (!now || RANK.indexOf(leaf.state) < RANK.indexOf(now))
      stateOf.set(leaf.endpoint, leaf.state);
  }
  // The attack tree names routes with :id; the shoppers' calls end without a trailing slash.
  const stateFor = (endpoint: string) =>
    stateOf.get(endpoint) ?? stateOf.get(`${endpoint}/`) ?? null;

  const steps = new Map<string, number>();
  const agents = new Map<string, Set<string>>();
  const friction = new Map<string, Record<string, number>>();
  const calls = new Map<string, Map<string, number>>();
  const routeAt = new Map<string, string>();
  let sessions = 0;
  let passed = 0;

  for (const e of synthlab) {
    const p = e.payload;
    const agent = str((e as { actor?: { agentId?: unknown } }).actor?.agentId) ?? '?';
    if (e.type === 'session.started') sessions += 1;
    if (e.type === 'task.verified' && p.status === 'passed') passed += 1;
    if (e.type === 'agent.step') {
      const r = clientRoute(str(p.url) ?? '');
      steps.set(r, (steps.get(r) ?? 0) + 1);
      const set = agents.get(r) ?? new Set<string>();
      set.add(agent);
      agents.set(r, set);
      routeAt.set(`${agent}#${String(p.stepIndex)}`, r);
    }
    if (e.type === 'friction.signal') {
      const r = clientRoute(str(p.url) ?? '');
      const f = friction.get(r) ?? {};
      const d = str(p.detector) ?? '?';
      f[d] = (f[d] ?? 0) + 1;
      friction.set(r, f);
    }
    if (e.type === 'page.requests' && Array.isArray(p.requests)) {
      const r = routeAt.get(`${agent}#${String(p.stepIndex)}`);
      if (!r) continue;
      const m = calls.get(r) ?? new Map<string, number>();
      for (const q of p.requests as Record<string, unknown>[]) {
        const ep = apiEndpoint(str(q.method) ?? 'GET', str(q.path) ?? '');
        if (ep && !excluded(ep, excludedPaths)) m.set(ep, (m.get(ep) ?? 0) + 1);
      }
      calls.set(r, m);
    }
  }

  const pages = FUNNEL.filter(([route]) => steps.has(route)).map(([route, label]) => {
    const who = agents.get(route) ?? new Set<string>();
    const endpoints = [...(calls.get(route) ?? new Map<string, number>()).entries()]
      .map(([endpoint, n]) => ({ endpoint, calls: n, state: stateFor(endpoint) }))
      .sort(
        (a, b) =>
          Number(b.state !== null) - Number(a.state !== null) ||
          b.calls - a.calls ||
          a.endpoint.localeCompare(b.endpoint),
      )
      .slice(0, 5);
    return {
      route,
      label,
      steps: steps.get(route) ?? 0,
      reached: who.size,
      personas: [...new Set([...who].map((a) => a.split('-a-')[0] ?? a))].sort(),
      friction: friction.get(route) ?? {},
      endpoints,
      pageState: stateFor(`GET /#${route}`),
    };
  });

  return { sessions, passed, pages };
}
