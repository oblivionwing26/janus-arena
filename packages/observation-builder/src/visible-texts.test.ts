import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { ObservationBuilder } from './observation-builder.js';
import { MAX_TEXTS } from './visible-texts.js';

const dir = fileURLToPath(new URL('../fixtures/shoplab/', import.meta.url));
const observe = (name: string) =>
  new ObservationBuilder().observe(
    JSON.parse(readFileSync(`${dir}${name}.capture.json`, 'utf8')) as unknown,
  );

describe('Observation.texts', () => {
  it('lists headings, cells and control names of the real cart, once each', () => {
    const { texts } = observe('cart');

    expect(texts).toEqual(
      expect.arrayContaining(['Carrito', 'Subtotal', 'Total', 'Otras opciones', 'Ir a pagar']),
    );
    expect(texts).not.toContain('# Carrito');
    expect(texts).not.toContain('Totales:');
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('keeps the submit button and the validation error of the sign-up form', () => {
    const { texts, alerts } = observe('register-errors');

    expect(alerts.length).toBeGreaterThan(0);
    expect(texts).toEqual(expect.arrayContaining(['Crear cuenta', ...alerts]));
  });

  it('never keeps more than the cap', () => {
    for (const page of ['home', 'cart', 'checkout', 'order', 'orders']) {
      expect(observe(page).texts.length).toBeLessThanOrEqual(MAX_TEXTS);
    }
  });
});
