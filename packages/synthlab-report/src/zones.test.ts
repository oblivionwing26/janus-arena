import { describe, expect, it } from 'vitest';

import { ReportRun } from './test-support/report-run.js';
import { frictionZones } from './zones.js';

const ROUTES = ['/products/:slug', '/orders/:id'];
const SUBMIT = 'role=button[name="Crear cuenta"]';
const box = { x: 20, y: 600, width: 350, height: 44 };

describe('frictionZones', () => {
  it('groups signals by route and element, with the boxes and screenshot of the element', () => {
    const run = new ReportRun();
    const ids: string[] = [];
    for (const [index, who] of ['carmen', 'diego'].entries()) {
      const session = run.session(`${who}-a-s1-a1`);
      session.step('/');
      const click = session.step('/register', { selector: `${SUBMIT} nth=0`, box });
      const shown = session.step('/register');
      if (index === 0) session.screenshot(shown.stepIndex, '/register', 'form-error');
      ids.push(
        run.signal(`${who}-a-s1-a1`, 'form-error', 'medium', [click.action, shown.step], {
          stepIndex: shown.stepIndex,
          path: '/register',
        }).id,
      );
    }

    const [zone, ...rest] = frictionZones(run.events(), { routes: ROUTES });

    expect(rest).toEqual([]);
    expect(zone).toMatchObject({
      rank: 1,
      route: '/register',
      element: SUBMIT,
      intensity: 4,
      signals: 2,
      sessions: 2,
      detectors: [{ detector: 'form-error', signals: 2 }],
      screenshot: {
        agentId: 'carmen-a-s1-a1',
        stepIndex: 2,
        artifact: 'carmen-a-s1-a1/step-2.png',
      },
    });
    expect(zone?.boxes).toEqual([
      { ...box, agentId: 'carmen-a-s1-a1', stepIndex: 1 },
      { ...box, agentId: 'diego-a-s1-a1', stepIndex: 1 },
    ]);
    expect(zone?.evidenceEventIds).toHaveLength(4);
    expect(ids).toHaveLength(2);
  });

  it('puts a backtrack on the page the shopper fled from, as a page-level zone', () => {
    const run = new ReportRun();
    const session = run.session('lucia-a-s1-a1');
    session.step('/cart');
    const detour = session.step('/checkout');
    const back = session.step('/cart');
    run.signal('lucia-a-s1-a1', 'backtrack', 'low', [detour.step, back.step], {
      stepIndex: back.stepIndex,
      path: '/cart',
    });

    expect(frictionZones(run.events())).toMatchObject([
      { route: '/checkout', element: null, boxes: [], screenshot: null },
    ]);
  });

  // F1.6 records page.screenshot with the URL the step began on, but takes it after the
  // action: when the action navigated, the image shows the next step's page.
  it('files a screenshot under the page it shows, the next step of its session', () => {
    const run = new ReportRun();
    const session = run.session('lucia-a-s1-a1');
    const pay = session.step('/cart'); // clicks "Ir a pagar": the screenshot shows /checkout
    session.screenshot(pay.stepIndex, '/cart', 'backtrack');
    const detour = session.step('/checkout');
    const back = session.step('/cart', { selector: 'role=link[name="Otras opciones"]', box });
    run.signal('lucia-a-s1-a1', 'backtrack', 'low', [detour.step, back.step], {
      stepIndex: back.stepIndex,
      path: '/cart',
    });
    run.signal('lucia-a-s1-a1', 'dead-click', 'low', [back.action], {
      stepIndex: back.stepIndex,
      path: '/cart',
    });

    const zones = frictionZones(run.events());

    expect(zones.map((zone) => [zone.route, zone.screenshot?.artifact ?? null])).toEqual([
      ['/cart', null],
      ['/checkout', 'lucia-a-s1-a1/step-0.png'],
    ]);
  });

  it('falls back to the signal URL when the evidence has no page, and folds products', () => {
    const run = new ReportRun();
    const session = run.session('javier-a-s1-a1');
    session.step('/products/cuaderno-a5');
    const ended = session.end('abandon');
    run.signal('javier-a-s1-a1', 'abandonment', 'high', [ended], {
      stepIndex: 0,
      path: '/products/cuaderno-a5',
    });

    expect(frictionZones(run.events(), { routes: ROUTES })).toMatchObject([
      { route: '/products/:slug', element: null, intensity: 3 },
    ]);
  });

  it('puts a session-wide signal without URL on the page where the session spent most steps', () => {
    const run = new ReportRun();
    const session = run.session('rosa-a-s1-a1');
    for (const path of ['/', '/cart', '/checkout', '/cart', '/cart', '/checkout']) {
      session.step(path);
    }
    const ended = session.end('success');
    run.signal('rosa-a-s1-a1', 'extra-steps', 'medium', [ended]);

    expect(frictionZones(run.events())).toMatchObject([
      { route: '/cart', element: null, detectors: [{ detector: 'extra-steps', signals: 1 }] },
    ]);
  });

  // The typical false positive: one agent looping between two pages fires a backtrack on every
  // lap. It must not outrank three shoppers who each hit the same element once.
  it('counts a looping session once, by its worst signal', () => {
    const run = new ReportRun();
    const looper = run.session('tomas-a-s1-a1');
    for (let lap = 0; lap < 10; lap++) {
      looper.step('/cart');
      const detour = looper.step('/checkout');
      const back = looper.step('/cart');
      run.signal('tomas-a-s1-a1', 'backtrack', 'low', [detour.step, back.step], {
        stepIndex: back.stepIndex,
        path: '/cart',
      });
    }
    for (const who of ['carmen', 'diego', 'rosa']) {
      const session = run.session(`${who}-a-s1-a1`);
      const click = session.step('/cart', { selector: 'role=link[name="Otras opciones"]', box });
      run.signal(`${who}-a-s1-a1`, 'dead-click', 'low', [click.action], {
        stepIndex: click.stepIndex,
        path: '/cart',
      });
    }

    const zones = frictionZones(run.events());

    expect(zones.map((zone) => [zone.route, zone.element, zone.intensity, zone.signals])).toEqual([
      ['/cart', 'role=link[name="Otras opciones"]', 3, 3],
      ['/checkout', null, 1, 10],
    ]);
  });

  it('breaks ties by sessions, then signals, then route, and keeps the top N', () => {
    const run = new ReportRun();
    // /a: one session, high (3). /b: three sessions, low (3). /c: one session, low, twice (1).
    const one = run.session('a-a-s1-a1');
    const onA = one.step('/a');
    run.signal('a-a-s1-a1', 'technical-error', 'high', [onA.step], { path: '/a' });
    for (const who of ['b1', 'b2', 'b3']) {
      const step = run.session(`${who}-a-s1-a1`).step('/b');
      run.signal(`${who}-a-s1-a1`, 'technical-error', 'low', [step.step], { path: '/b' });
    }
    const three = run.session('c-a-s1-a1');
    for (let index = 0; index < 2; index++) {
      const step = three.step('/c');
      run.signal('c-a-s1-a1', 'technical-error', 'low', [step.step], { path: '/c' });
    }

    const zones = frictionZones(run.events(), { top: 2 });

    expect(zones.map((zone) => [zone.rank, zone.route])).toEqual([
      [1, '/b'],
      [2, '/a'],
    ]);
  });

  it('is empty for a run without friction', () => {
    const run = new ReportRun();
    run.session('carmen-a-s1-a1').step('/');

    expect(frictionZones(run.events())).toEqual([]);
  });
});
