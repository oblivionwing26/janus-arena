import { describe, expect, it } from 'vitest';

import { detectFriction } from '../detect-friction.js';
import { RunBuilder } from '../test-support/run-builder.js';

const backtracks = (run: RunBuilder) =>
  detectFriction(run.events()).filter((signal) => signal.detector === 'backtrack');

describe('backtrack', () => {
  it('fires on an explicit back action', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.click('/', 'e6', 'Taza');
    const back = ana.act('/products/taza', 'back');
    ana.act('/', 'scroll');

    expect(backtracks(run)).toEqual([
      {
        detector: 'backtrack',
        severity: 'low',
        agentId: 'ana-0',
        evidenceEventIds: [back.action],
        stepIndex: 1,
        url: 'http://shop.test/products/taza',
      },
    ]);
  });

  it('fires when the persona leaves a page and returns to it right away', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.click('/cart', 'e3', 'Carrito');
    const detour = ana.click('/checkout', 'e1', 'Volver al carrito');
    const arrival = ana.click('/cart', 'e9', 'Pagar');

    expect(backtracks(run).map((signal) => signal.evidenceEventIds)).toEqual([
      [detour.step, arrival.step],
    ]);
  });

  it('counts a back action once, not again as a return to the same page', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.click('/', 'e6', 'Taza');
    ana.act('/products/taza', 'back');
    ana.act('/', 'scroll');

    expect(backtracks(run)).toHaveLength(1);
  });

  it('typical false positive: normal forward progress through the purchase', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.click('/', 'e6', 'Taza');
    ana.click('/products/taza', 'e8', 'Añadir');
    ana.click('/cart', 'e9', 'Pagar');
    ana.click('/checkout', 'e10', 'Confirmar');
    ana.act('/orders/7', 'done');

    expect(backtracks(run)).toEqual([]);
  });

  it('does not fire when the detour lasted longer than the return window', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.click('/cart', 'e9', 'Pagar');
    ana.act('/checkout', 'type', { ref: 'e6' });
    ana.click('/checkout', 'e1', 'Carrito');
    ana.act('/cart', 'scroll');

    expect(backtracks(run)).toEqual([]);
  });
});
