import { describe, expect, it } from 'vitest';

import type { StaticFinding } from '../../domain/analysis/static-finding.js';
import type { Endpoint } from '../../domain/surface/endpoint.js';
import { gate, introducedFindings, surfaceChanges } from './diff-audit.js';

const finding = (overrides: Partial<StaticFinding> = {}): StaticFinding => ({
  kind: 'static',
  tool: 'semgrep',
  rule: 'janus.dom-inner-html',
  severity: 'medium',
  message: 'x',
  file: 'src/a.ts',
  line: 10,
  snippet: 'el.innerHTML = value',
  ...overrides,
});

const endpoint = (overrides: Partial<Endpoint> = {}): Endpoint => ({
  route: '/api/orders/:id',
  method: 'GET',
  declaredAt: { file: 'src/app/api/orders/[id]/route.ts', line: 12 },
  handler: null,
  params: ['id'],
  auth: true,
  ownerCheck: true,
  ...overrides,
});

describe('introducedFindings', () => {
  it('ignores findings that only moved to another line', () => {
    expect(
      introducedFindings([finding()], [finding({ line: 42, snippet: '  el.innerHTML =   value' })]),
    ).toEqual([]);
  });

  it('counts the same finding as a multiset', () => {
    const introduced = introducedFindings(
      [finding(), finding()],
      [finding(), finding(), finding()],
    );

    expect(introduced).toHaveLength(1);
  });

  it('reports what is new in B, and nothing B fixed', () => {
    const xss = finding({ rule: 'janus.angular-bypass-security-trust', severity: 'high' });

    expect(introducedFindings([finding()], [xss])).toEqual([xss]);
    expect(introducedFindings([finding(), xss], [finding()])).toEqual([]);
  });
});

describe('surfaceChanges', () => {
  it('reports a new public endpoint as medium and a new IDOR lead as high', () => {
    const changes = surfaceChanges(
      [endpoint()],
      [
        endpoint(),
        endpoint({ route: '/api/promo', auth: false, ownerCheck: 'unknown' }),
        endpoint({ route: '/api/orders/:id/invoice', ownerCheck: false }),
      ],
    );

    expect(
      changes.map((change) => [change.endpoint.route, change.change, change.severity]),
    ).toEqual([
      ['/api/promo', 'new-public', 'medium'],
      ['/api/orders/:id/invoice', 'new-idor-lead', 'high'],
    ]);
  });

  it('reports an endpoint that loses its auth or its owner check as high', () => {
    expect(
      surfaceChanges([endpoint()], [endpoint({ auth: false, ownerCheck: 'unknown' })]).map(
        (change) => change.change,
      ),
    ).toEqual(['lost-auth']);
    expect(
      surfaceChanges([endpoint()], [endpoint({ ownerCheck: false })]).map(
        (change) => change.change,
      ),
    ).toEqual(['new-idor-lead']);
  });

  it('says nothing about changes from or to unknown, or about removed endpoints', () => {
    expect(
      surfaceChanges([endpoint({ ownerCheck: 'unknown' })], [endpoint({ ownerCheck: false })]),
    ).toEqual([]);
    expect(surfaceChanges([endpoint()], [endpoint({ ownerCheck: 'unknown' })])).toEqual([]);
    expect(surfaceChanges([endpoint()], [])).toEqual([]);
  });
});

describe('gate', () => {
  it('blocks B for anything high or critical, with one reason each', () => {
    const verdict = gate(
      [finding({ severity: 'critical', tool: 'gitleaks', rule: 'generic-api-key', line: 3 })],
      surfaceChanges([], [endpoint({ route: '/api/orders/:id/invoice', ownerCheck: false })]),
    );

    expect(verdict).toEqual({
      blocked: true,
      high: 1,
      critical: 1,
      reasons: [
        'gitleaks generic-api-key at src/a.ts:3 (critical)',
        'GET /api/orders/:id/invoice: new endpoint with a session but no owner check (IDOR lead) (high)',
      ],
    });
  });

  it('lets B pass with only medium and low changes', () => {
    expect(
      gate([finding()], surfaceChanges([], [endpoint({ auth: false, ownerCheck: 'unknown' })])),
    ).toEqual({ blocked: false, high: 0, critical: 0, reasons: [] });
  });
});
