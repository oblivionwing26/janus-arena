import type { Endpoint } from '../surface/endpoint.js';

export interface AttemptLimitConfig {
  readonly perEndpoint: number;
  readonly total: number;
}

export const DEFAULT_ATTEMPT_LIMITS: AttemptLimitConfig = { perEndpoint: 6, total: 60 };

export type Admission =
  | { readonly admitted: true; readonly endpoint: string }
  | { readonly admitted: false; readonly scope: 'endpoint' | 'run'; readonly reason: string };

const segments = (path: string) => path.split('/').filter((part) => part !== '');

/** Whether a concrete path fits a route template (`:id` matches one segment, `*` the rest). */
function matches(template: string, path: string): boolean {
  const want = segments(template);
  const got = segments(path);
  for (let i = 0; i < want.length; i++) {
    const part = want[i] ?? '';
    if (part === '*' || part.endsWith('*')) return true;
    const value = got[i];
    if (value === undefined) return false;
    if (!part.startsWith(':') && part.toLowerCase() !== value.toLowerCase()) return false;
  }
  return want.length === got.length;
}

/**
 * How many tries the Red Team gets (F3.3): at most `perEndpoint` per endpoint and `total` per
 * run. A concrete path counts against its route in the surface map, so changing an id is not a
 * new endpoint; a path the map does not know counts as its own endpoint.
 */
export class AttemptLimits {
  private readonly used = new Map<string, number>();
  private count = 0;

  constructor(
    private readonly routes: readonly Pick<Endpoint, 'method' | 'route'>[],
    private readonly limits: AttemptLimitConfig = DEFAULT_ATTEMPT_LIMITS,
  ) {}

  /** The endpoint a request belongs to: `GET /rest/basket/:id`. */
  endpointOf(method: string, path: string): string {
    const bare = path.split(/[?#]/)[0] ?? path;
    const route = this.routes.find(
      (each) => (each.method === method || each.method === 'ALL') && matches(each.route, bare),
    );
    return `${method} ${route?.route ?? bare}`;
  }

  /** Counts the attempt when it fits both limits. */
  admit(method: string, path: string): Admission {
    const endpoint = this.endpointOf(method, path);
    if (this.count >= this.limits.total) {
      return {
        admitted: false,
        scope: 'run',
        reason: `the run's ${String(this.limits.total)} attempts are used up`,
      };
    }
    const used = this.used.get(endpoint) ?? 0;
    if (used >= this.limits.perEndpoint) {
      return {
        admitted: false,
        scope: 'endpoint',
        reason: `${endpoint} already had its ${String(this.limits.perEndpoint)} attempts`,
      };
    }
    this.used.set(endpoint, used + 1);
    this.count += 1;
    return { admitted: true, endpoint };
  }
}
