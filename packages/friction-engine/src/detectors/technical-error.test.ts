import { describe, expect, it } from 'vitest';

import { detectFriction } from '../detect-friction.js';
import { RunBuilder } from '../test-support/run-builder.js';

const technical = (run: RunBuilder) =>
  detectFriction(run.events()).filter((signal) => signal.detector === 'technical-error');

describe('technical-error', () => {
  it('grades server errors high, client errors and timeouts medium, console errors low', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.click('/cart', 'e9', 'Pagar');
    const server = ana.error('http', '/api/checkout', 'Internal Server Error', 500);
    const client = ana.error('http', '/api/cart', 'Not Found', 404);
    const slow = ana.error('timeout', '/api/stock', 'No response in 10 s');
    const console = ana.error('console', '/cart', 'TypeError: x is undefined');

    expect(technical(run).map((signal) => [signal.evidenceEventIds[0], signal.severity])).toEqual([
      [server, 'high'],
      [client, 'medium'],
      [slow, 'medium'],
      [console, 'low'],
    ]);
    expect(technical(run)[0]).toMatchObject({ stepIndex: 0, url: 'http://shop.test/cart' });
  });

  it('typical false positive: a missing favicon or image is noise', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.act('/', 'scroll');
    ana.error('http', '/favicon.ico', 'Not Found', 404);
    ana.error('http', '/images/taza.webp?v=2', 'Not Found', 404);

    expect(technical(run)).toEqual([]);
  });

  it('typical false positive: a validation 400 is the form rejecting input, not a fault', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.click('/register', 'e10', 'Crear cuenta');
    ana.error('http', '/api/register', 'Bad Request', 400);
    ana.error('http', '/api/login', 'Unauthorized', 401);

    expect(technical(run)).toEqual([]);
  });

  it('does not fire on redirects or when nothing failed', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.act('/', 'scroll');
    ana.error('http', '/login', 'See Other', 303);

    expect(technical(run)).toEqual([]);
  });
});
