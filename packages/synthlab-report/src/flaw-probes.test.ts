// F1.10 "Done when" as a regression test: the scripted probes of ShopLab's three seeded flaws
// (apps/orchestrator-api/src/ux-flaws.sandbox.test.ts, recorded with JANUS_WRITE_FIXTURE=1)
// put each flaw among the heatmap's 5 most intense zones. Reads the recorded events only.

import { readFileSync } from 'node:fs';

import { parseRunExport } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { frictionZones } from './zones.js';

const { events } = parseRunExport(
  readFileSync(new URL('../fixtures/flaw-probes-f110.json', import.meta.url), 'utf8'),
);
const zones = frictionZones(events, { routes: ['/products/:slug', '/orders/:id'], top: 5 });
const zoneWith = (route: string, detector: string) =>
  zones.find(
    (zone) => zone.route === route && zone.detectors.some((entry) => entry.detector === detector),
  );

describe('the seeded ShopLab flaws in the heatmap (F1.10)', () => {
  it('UX-1, shipping only at checkout: the checkout page the shopper went back from', () => {
    expect(zoneWith('/checkout', 'backtrack')?.rank).toBeLessThanOrEqual(5);
  });

  it('UX-2, hidden coupon: the cart, where finding the coupon cost extra steps', () => {
    expect(zoneWith('/cart', 'extra-steps')?.rank).toBeLessThanOrEqual(5);
  });

  it('UX-3, sign-up cleared on error: the button whose validation error empties the form', () => {
    const zone = zoneWith('/register', 'form-error');
    expect(zone?.element).toBe('role=button[name="Crear cuenta"]');
    expect(zone?.boxes.length).toBeGreaterThan(0);
  });
});
