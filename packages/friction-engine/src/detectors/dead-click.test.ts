import { describe, expect, it } from 'vitest';

import { detectFriction } from '../detect-friction.js';
import { RunBuilder } from '../test-support/run-builder.js';

const dead = (run: RunBuilder) =>
  detectFriction(run.events()).filter((signal) => signal.detector === 'dead-click');

describe('dead-click', () => {
  it('fires on a click that changed neither the page nor the DOM', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    const click = ana.click('/', 'e7', 'Otras opciones', { domMutations: 0 });
    ana.act('/', 'scroll');

    expect(dead(run)).toEqual([
      {
        detector: 'dead-click',
        severity: 'low',
        agentId: 'ana-0',
        evidenceEventIds: [click.action],
        stepIndex: 0,
        url: 'http://shop.test/',
      },
    ]);
  });

  it('grades by how many times the same element was dead-clicked', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    [1, 2, 3].forEach(() =>
      ana.click('/', 'e7', 'Otras opciones', { domMutations: 0, after: 20_000 }),
    );

    expect(dead(run).map((signal) => [signal.severity, signal.evidenceEventIds.length])).toEqual([
      ['high', 3],
    ]);
  });

  it('does not fire when the click navigated, changed the DOM or was not measured', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.click('/', 'e6', 'Taza', { domMutations: 0 });
    ana.click('/products/taza', 'e8', 'Añadir', { domMutations: 12 });
    ana.click('/products/taza', 'e8', 'Añadir');
    ana.act('/products/taza', 'scroll');

    expect(dead(run)).toEqual([]);
  });

  it('typical false positive: clicking a field only gives it focus', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.act('/register', 'click', {
      ref: 'e6',
      selector: 'role=textbox[name="Nombre"]',
      domMutations: 0,
    });
    ana.act('/register', 'click', { ref: 'e7', selector: 'label="Email"', domMutations: 0 });
    ana.act('/register', 'scroll');

    expect(dead(run)).toEqual([]);
  });
});
