import { describe, expect, it } from 'vitest';

import { ObservationBuilder } from './observation-builder.js';
import { node, page } from './test-support/nodes.js';

const form = (email: string | undefined, extra: unknown[] = []) =>
  page(
    [
      node('heading', { name: 'Crear cuenta', level: 1 }),
      node('textbox', { name: 'Nombre', text: 'Ana' }),
      node('textbox', { name: 'Email', ...(email === undefined ? {} : { text: email }) }),
      node('button', { name: 'Crear cuenta' }),
      ...extra,
    ],
    'http://shop.test/register',
  );

describe('ObservationBuilder: diff against the previous observation', () => {
  it('reports only what was added, removed or changed on the same page', () => {
    const builder = new ObservationBuilder();
    builder.observe(form(undefined, [node('paragraph', { text: 'Rellena el formulario.' })]));

    const result = builder.observe(
      form('ana@shop', [node('alert', { text: 'El email no es válido.' })]),
    );

    expect(result.mode).toBe('diff');
    expect(result.text.split('\n')).toEqual([
      'page /register · "Shop" · changes since the last step:',
      '~ [e2] textbox "Email" = "ana@shop"',
      '- Rellena el formulario.',
      '+ ! alert "El email no es válido."',
    ]);
  });

  it('keeps refs stable between observations', () => {
    const builder = new ObservationBuilder();
    const first = builder.observe(form(undefined));
    const second = builder.observe(form('ana@shop'));

    expect(second.locators).toEqual(first.locators);
  });

  it('says so when nothing changed', () => {
    const builder = new ObservationBuilder();
    builder.observe(form('ana@shop'));

    const result = builder.observe(form('ana@shop'));

    expect(result.text.split('\n')).toEqual([
      'page /register · "Shop" · changes since the last step:',
      '(no changes)',
    ]);
  });

  it('falls back to the full observation after navigating', () => {
    const builder = new ObservationBuilder();
    builder.observe(form(undefined));

    const result = builder.observe(
      page([node('heading', { name: 'Catálogo', level: 1 })], 'http://shop.test/'),
    );

    expect(result.mode).toBe('full');
    expect(result.text).toBe(result.full);
  });

  it('falls back to the full observation when the diff would be longer', () => {
    const builder = new ObservationBuilder();
    builder.observe(page([node('button', { name: 'A' })], 'http://shop.test/x'));

    const result = builder.observe(
      page([node('button', { name: 'B' }), node('button', { name: 'C' })], 'http://shop.test/x'),
    );

    expect(result.mode).toBe('full');
  });

  it('assigns new refs to new elements without reusing old ones', () => {
    const builder = new ObservationBuilder();
    builder.observe(page([node('button', { name: 'A' })], 'http://shop.test/'));
    builder.observe(page([node('button', { name: 'B' })], 'http://shop.test/other'));

    const back = builder.observe(page([node('button', { name: 'A' })], 'http://shop.test/'));

    expect(back.text).toContain('[e1] button "A"');
  });
});
