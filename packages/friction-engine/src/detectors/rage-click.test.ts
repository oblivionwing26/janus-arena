import { describe, expect, it } from 'vitest';

import { defaultFrictionConfig } from '../config.js';
import { detectFriction } from '../detect-friction.js';
import { RunBuilder } from '../test-support/run-builder.js';

const rage = (run: RunBuilder, config = defaultFrictionConfig) =>
  detectFriction(run.events(), config).filter((signal) => signal.detector === 'rage-click');

describe('rage-click', () => {
  it('fires on 3 clicks on the same element within 4 actions and 30 s', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    const clicks = [1, 2, 3].map(() => ana.click('/cart', 'e9', 'Pagar').action);

    expect(rage(run)).toEqual([
      {
        detector: 'rage-click',
        severity: 'medium',
        agentId: 'ana-0',
        evidenceEventIds: clicks,
        stepIndex: 0,
        url: 'http://shop.test/cart',
      },
    ]);
  });

  it('is high for a longer burst, and waits in between do not break it', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.click('/cart', 'e9', 'Pagar');
    ana.click('/cart', 'e9', 'Pagar');
    ana.act('/cart', 'wait');
    ana.click('/cart', 'e9', 'Pagar');
    ana.click('/cart', 'e9', 'Pagar');

    expect(rage(run).map((signal) => [signal.severity, signal.evidenceEventIds.length])).toEqual([
      ['medium', 4],
    ]);
    const tight = {
      ...defaultFrictionConfig,
      rageClick: { minClicks: 2, windowActions: 4, windowMs: 30_000 },
    };
    expect(rage(run, tight)[0]?.severity).toBe('high');
  });

  it('does not fire on clicks spread out in time', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    [1, 2, 3].forEach(() => ana.click('/cart', 'e9', 'Pagar', { after: 20_000 }));

    expect(rage(run)).toEqual([]);
  });

  it('typical false positive: three different buttons in a row', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.click('/', 'e1', 'Tienda');
    ana.click('/', 'e2', 'Carrito');
    ana.click('/', 'e3', 'Mis pedidos');

    expect(rage(run)).toEqual([]);
  });

  it('keeps sessions apart', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    const luis = run.session('luis-1');
    ana.click('/cart', 'e9', 'Pagar');
    luis.click('/cart', 'e9', 'Pagar');
    ana.click('/cart', 'e9', 'Pagar');

    expect(rage(run)).toEqual([]);
  });
});
