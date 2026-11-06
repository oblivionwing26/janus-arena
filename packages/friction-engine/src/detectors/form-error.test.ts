import { describe, expect, it } from 'vitest';

import { detectFriction } from '../detect-friction.js';
import { RunBuilder } from '../test-support/run-builder.js';

const formErrors = (run: RunBuilder) =>
  detectFriction(run.events()).filter((signal) => signal.detector === 'form-error');

describe('form-error', () => {
  it('fires when an alert appears after submitting', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    const submit = ana.click('/register', 'e10', 'Crear cuenta');
    const shown = ana.act('/register', 'type', {
      ref: 'e7',
      alerts: ['Revisa los campos del formulario.'],
    });

    expect(formErrors(run)).toEqual([
      {
        detector: 'form-error',
        severity: 'medium',
        agentId: 'ana-0',
        evidenceEventIds: [submit.action, shown.step],
        stepIndex: 1,
        url: 'http://shop.test/register',
      },
    ]);
  });

  it('gives one signal while the same error stays on screen', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    const error = ['Email o contraseña incorrectos.'];
    ana.click('/login', 'e21', 'Entrar');
    ana.act('/login', 'type', { ref: 'e20', alerts: error });
    ana.act('/login', 'type', { ref: 'e20', alerts: error });

    expect(formErrors(run).map((signal) => signal.severity)).toEqual(['medium']);
  });

  it('is high when the error goes away and comes back', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    const error = ['Email o contraseña incorrectos.'];
    ana.click('/login', 'e21', 'Entrar');
    ana.act('/login', 'type', { ref: 'e20', alerts: error });
    ana.act('/login', 'type', { ref: 'e20' });
    ana.click('/login', 'e21', 'Entrar', { alerts: error });

    expect(formErrors(run).map((signal) => signal.severity)).toEqual(['medium', 'high']);
  });

  it('typical false positive: an alert that was already on the page is not new', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    const banner = ['Envío gratis a partir de 30 €.'];
    ana.act('/cart', 'scroll', { alerts: banner });
    ana.act('/cart', 'scroll', { alerts: banner });
    ana.click('/cart', 'e9', 'Pagar', { alerts: banner });

    expect(formErrors(run)).toEqual([]);
  });

  it('does not fire on pages without alerts', () => {
    const run = new RunBuilder();
    const ana = run.session('ana-0');
    ana.click('/', 'e6', 'Taza');
    ana.click('/products/taza', 'e8', 'Añadir');

    expect(formErrors(run)).toEqual([]);
  });
});
