// The launch page's attack tree, built from two recorded runs of the Juice Shop gate: the Red Team
// run (surface map, attempts, verdicts, scope refusals, findings) and the Blue Team run (patch,
// verifiers, remediation). Pure: events in, tree out.

export interface RunEvent {
  type: string;
  payload: Record<string, unknown>;
}

export type LeafState = 'exploited' | 'fixed' | 'refused' | 'blocked';

export interface Attempt {
  number: number;
  status: number | null;
  exploitable: boolean | null;
  evidence: string | null;
}

export interface Leaf {
  /** "METHOD /route", as the Red Team names the endpoint. */
  endpoint: string;
  testType: string;
  state: LeafState;
  attempts: Attempt[];
  severity: string | null;
  findingId: string | null;
  /** What the oracle saw when the proof was replayed (confirmed findings only). */
  evidence: string | null;
}

export interface AttackClass {
  testType: string;
  label: string;
  attempts: number;
  leaves: Leaf[];
}

export interface Verification {
  verifier: string;
  passed: boolean;
  details: string;
}

export interface AttackTree {
  target: string;
  /** Every endpoint the surface map found, "METHOD /route", sorted by route. */
  surface: string[];
  classes: AttackClass[];
  totals: { attempts: number; confirmed: number; blocked: number; mapped: number };
  fix: {
    findingId: string;
    endpoint: string;
    iterations: number;
    diff: string;
    verifications: Verification[];
  } | null;
}

const LABELS: Record<string, string> = {
  idor: 'IDOR',
  'auth-bypass': 'Login bypass',
  xss: 'XSS',
  'business-logic': 'Business logic',
  'brute-force': 'Brute force',
  race: 'Race',
};

const ORDER = ['idor', 'auth-bypass', 'xss', 'business-logic', 'brute-force', 'race'];

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** Recorded exports store a curly apostrophe as U+FFFD; show it as the apostrophe it was. */
export function cleanText(s: string): string {
  return s.replace(/�/g, '’');
}

/** "/api/Hints/7" → "GET /api/Hints/:id", matching how attempts name parameterised routes. */
function blockedEndpoint(method: string, path: string): string {
  return `${method} ${path.replace(/\/\d+(?=\/|$)/g, '/:id')}`;
}

export function buildAttackTree(
  red: readonly RunEvent[],
  blue: readonly RunEvent[] = [],
): AttackTree {
  const target =
    str(red.find((e) => e.type === 'scope.verified')?.payload.target) ?? 'unknown target';
  const surfaceEvent = red.find((e) => e.type === 'surface.mapped');
  const rawSurface = Array.isArray(surfaceEvent?.payload.endpoints)
    ? (surfaceEvent.payload.endpoints as Record<string, unknown>[])
    : [];
  const surface = [
    ...new Set(rawSurface.map((e) => `${str(e.method) ?? '?'} ${str(e.route) ?? '?'}`)),
  ].sort(
    (a, b) =>
      a.slice(a.indexOf(' ') + 1).localeCompare(b.slice(b.indexOf(' ') + 1)) || a.localeCompare(b),
  );

  const verdicts = new Map<string, Record<string, unknown>>();
  for (const e of red) {
    if (e.type === 'attack.verdict') {
      const id = str(e.payload.attemptId);
      if (id) verdicts.set(id, e.payload);
    }
  }

  const leaves = new Map<string, Leaf>();
  const leafFor = (testType: string, endpoint: string): Leaf => {
    const key = `${testType}|${endpoint}`;
    let leaf = leaves.get(key);
    if (!leaf) {
      leaf = {
        endpoint,
        testType,
        state: 'refused',
        attempts: [],
        severity: null,
        findingId: null,
        evidence: null,
      };
      leaves.set(key, leaf);
    }
    return leaf;
  };

  let attempts = 0;
  for (const e of red) {
    if (e.type !== 'attack.attempt') continue;
    attempts += 1;
    const p = e.payload;
    const v = verdicts.get(str(p.attemptId) ?? '');
    leafFor(str(p.testType) ?? '?', str(p.endpoint) ?? '?').attempts.push({
      number: num(p.number) ?? 0,
      status: num(p.status),
      exploitable: v ? v.exploitable === true : null,
      evidence: v ? cleanText(str(v.evidence) ?? '') : null,
    });
  }

  let blocked = 0;
  for (const e of red) {
    if (e.type !== 'scope.blocked') continue;
    blocked += 1;
    const leaf = leafFor(
      str(e.payload.testType) ?? '?',
      blockedEndpoint(str(e.payload.method) ?? 'GET', str(e.payload.path) ?? '?'),
    );
    if (!leaf.attempts.some((a) => a.exploitable !== null)) leaf.state = 'blocked';
  }

  const confirmedIds = new Set(
    red.filter((e) => e.type === 'finding.confirmed').map((e) => str(e.payload.findingId)),
  );
  const confirmedEvidence = new Map(
    red
      .filter((e) => e.type === 'finding.confirmed')
      .map((e) => [str(e.payload.findingId), cleanText(str(e.payload.evidence) ?? '')] as const),
  );
  for (const e of red) {
    if (e.type !== 'finding.created') continue;
    const id = str(e.payload.findingId);
    if (!confirmedIds.has(id)) continue;
    const leaf = leafFor(str(e.payload.rule) ?? '?', str(e.payload.endpoint) ?? '?');
    leaf.state = 'exploited';
    leaf.severity = str(e.payload.severity);
    leaf.findingId = id;
    leaf.evidence = confirmedEvidence.get(id) ?? null;
  }

  let fix: AttackTree['fix'] = null;
  const remediated = blue.find(
    (e) => e.type === 'finding.remediated' && e.payload.status === 'fixed',
  );
  if (remediated) {
    const findingId = str(remediated.payload.findingId) ?? '';
    const leaf = [...leaves.values()].find((l) => l.findingId === findingId);
    if (leaf) leaf.state = 'fixed';
    const patch = blue.find((e) => e.type === 'patch.proposed');
    fix = {
      findingId,
      endpoint: leaf?.endpoint ?? '?',
      iterations: num(remediated.payload.iterations) ?? 0,
      diff: str(patch?.payload.diff) ?? '',
      verifications: blue
        .filter((e) => e.type === 'verification.result')
        .map((e) => ({
          verifier: str(e.payload.verifier) ?? '?',
          passed: e.payload.passed === true,
          details: cleanText(str(e.payload.details) ?? ''),
        })),
    };
  }

  const byClass = new Map<string, Leaf[]>();
  for (const leaf of leaves.values()) {
    const list = byClass.get(leaf.testType) ?? [];
    list.push(leaf);
    byClass.set(leaf.testType, list);
  }
  const rank = (t: string) => (ORDER.indexOf(t) === -1 ? ORDER.length : ORDER.indexOf(t));
  const classes = [...byClass.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([testType, list]) => ({
      testType,
      label: LABELS[testType] ?? testType,
      attempts: list.reduce((n, l) => n + l.attempts.length, 0),
      leaves: list.sort((a, b) => a.endpoint.localeCompare(b.endpoint)),
    }));

  return {
    target,
    surface,
    classes,
    totals: { attempts, confirmed: confirmedIds.size, blocked, mapped: surface.length },
    fix,
  };
}

/**
 * Where an attacked endpoint sits on the arc of the surface map (0 to 1). Endpoints the static map
 * does not list (client routes such as /#/search) go after the last one.
 */
export function arcPosition(tree: AttackTree, endpoint: string): number {
  const n = tree.surface.length;
  const i = tree.surface.indexOf(endpoint);
  if (n === 0) return 0.5;
  if (i === -1) return 1;
  return n === 1 ? 0.5 : i / (n - 1);
}

/** Push labels apart so none is closer than `gap` to the next, keeping their order. */
export function spreadLabels(
  ys: readonly number[],
  gap: number,
  min: number,
  max: number,
): number[] {
  const order = ys.map((y, i) => [y, i] as const).sort((a, b) => a[0] - b[0]);
  const placed = order.map(([y]) => y);
  for (let k = 1; k < placed.length; k++) {
    placed[k] = Math.max(placed[k] ?? 0, (placed[k - 1] ?? 0) + gap);
  }
  const overflow = (placed[placed.length - 1] ?? 0) - max;
  if (overflow > 0) {
    for (let k = placed.length - 1; k >= 0; k--) {
      placed[k] = Math.min(placed[k] ?? 0, max - (placed.length - 1 - k) * gap);
    }
  }
  const out = new Array<number>(ys.length);
  order.forEach(([, i], k) => {
    out[i] = Math.max(min, placed[k] ?? 0);
  });
  return out;
}
