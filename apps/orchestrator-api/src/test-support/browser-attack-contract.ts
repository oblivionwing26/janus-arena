// Shared contract suite for BrowserAttackPort: the in-memory fake runs it in `pnpm test`; the
// Playwright adapter runs it against the Juice Shop sandbox in `pnpm test:sandbox`. Not part of
// the build.

import { describe, expect, it } from 'vitest';

import type { BrowserAttackPort } from '../domain/attack/browser-attack-port.js';
import { xssPayloads } from '../domain/attack/xss-candidates.js';

export interface BrowserAttackContractHarness {
  /** The port, and the origin of a target that has at least one unsafely reflected field. */
  readonly create: () => { port: BrowserAttackPort; origin: string };
  readonly timeoutMs?: number;
}

const MARKER = 'janus-contract-01JC0F28CNS0000';

export function describeBrowserAttackContract(
  name: string,
  harness: BrowserAttackContractHarness,
): void {
  const timeout = harness.timeoutMs ?? 5_000;

  describe(`${name} (BrowserAttackPort contract)`, () => {
    it(
      'finds where the page reflects typed input, as URLs on the origin with a payload slot',
      async () => {
        const { port, origin } = harness.create();
        const points = await port.discover(origin, 'janusprobe0contract');

        expect(points.length).toBeGreaterThan(0);
        for (const point of points) {
          expect(point.template).toContain('{payload}');
          expect(new URL(point.template.replace('{payload}', 'x')).origin).toBe(origin);
        }
      },
      timeout,
    );

    it(
      'records the dialogs a reflected script vector opens',
      async () => {
        const { port, origin } = harness.create();
        const [point] = await port.discover(origin, 'janusprobe0contract');
        const payload = xssPayloads(MARKER)[0] ?? '';
        const visit = await port.visit(
          origin,
          (point?.template ?? `${origin}/?q={payload}`).replace(
            '{payload}',
            encodeURIComponent(payload),
          ),
        );

        expect(visit.blocked).toBeNull();
        expect(visit.dialogs.map((dialog) => dialog.message)).toContain(MARKER);
      },
      timeout,
    );

    it(
      'never leaves the origin',
      async () => {
        const { port, origin } = harness.create();
        const visit = await port.visit(origin, 'http://janus-elsewhere.test/?q=x');

        expect(visit).toEqual({ blocked: 'out-of-scope-origin', status: null, dialogs: [] });
      },
      timeout,
    );
  });
}
