import { describe, expect, it } from 'vitest';

import { funnelOf } from './funnel.js';
import { ReportRun } from './test-support/report-run.js';

const CONFIG = {
  routes: ['/products/:slug', '/orders/:id'],
  funnel: [
    { name: 'Inicio', route: '/' },
    { name: 'Producto', route: '/products/:slug' },
    { name: 'Carrito', route: '/cart' },
    { name: 'Pedido', route: '/orders/:id' },
  ],
};

describe('funnelOf', () => {
  it('counts, per variant, the persona sessions that reached each step in order', () => {
    const run = new ReportRun();
    const walk = (agentId: string, variant: string, paths: string[]) => {
      const session = run.session(agentId, { variant });
      for (const path of paths) session.step(path);
    };
    walk('carmen-a-s1-a1', 'a', ['/', '/products/taza', '/cart', '/checkout', '/orders/6']);
    walk('diego-a-s1-a1', 'a', ['/', '/products/taza', '/cart', '/cart']);
    // Jumped to the cart without visiting a product: it stops at the first step.
    walk('rosa-a-s1-a1', 'a', ['/', '/cart', '/orders/7']);
    walk('carmen-b-s1-a1', 'b', ['/', '/products/cuaderno-a5']);
    // The baseline is a reference, not a shopper of the funnel.
    const baseline = run.session('competent-baseline-a-s1-a1', { kind: 'baseline' });
    baseline.step('/');

    const [a, b] = funnelOf(run.events(), CONFIG);

    expect(a).toEqual({
      variant: 'a',
      sessions: 3,
      steps: [
        { name: 'Inicio', route: '/', reached: 3, rate: 1 },
        { name: 'Producto', route: '/products/:slug', reached: 2, rate: 2 / 3 },
        { name: 'Carrito', route: '/cart', reached: 2, rate: 2 / 3 },
        { name: 'Pedido', route: '/orders/:id', reached: 1, rate: 1 / 3 },
      ],
    });
    expect(b?.steps.map((step) => step.reached)).toEqual([1, 1, 0, 0]);
  });

  it('leaves out excluded sessions and keeps a variant with only the baseline at zero', () => {
    const run = new ReportRun();
    run.session('carmen-a-s1-a1').step('/');
    run.session('competent-baseline-a-s1-a1', { kind: 'baseline' }).step('/');

    const [a] = funnelOf(run.events(), CONFIG, new Set(['carmen-a-s1-a1']));

    expect(a).toMatchObject({ variant: 'a', sessions: 0 });
    expect(a?.steps.every((step) => step.reached === 0 && step.rate === 0)).toBe(true);
  });
});
