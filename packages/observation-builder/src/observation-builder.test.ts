import { describe, expect, it } from 'vitest';

import { InvalidCaptureError } from './invalid-capture-error.js';
import { ObservationBuilder } from './observation-builder.js';
import { box, capture, node, page } from './test-support/nodes.js';

function lines(text: string): string[] {
  return text.split('\n').slice(1);
}

describe('ObservationBuilder: pruned snapshot', () => {
  it('keeps interactive elements with short refs, states and body text in document order', () => {
    const result = new ObservationBuilder().observe(
      page([
        node('heading', { name: 'Taza de cerámica', level: 1 }),
        node('paragraph', { text: 'Taza de 350 ml apta para lavavajillas.' }),
        node('paragraph', {}, [node('strong', { text: '12,90 €' })]),
        node('generic', {}, [
          'Cantidad',
          node('combobox', { name: 'Cantidad' }, [
            { role: 'option', name: '1', selected: true },
            { role: 'option', name: '2' },
          ]),
        ]),
        node('button', { name: 'Añadir al carrito', cursor: 'pointer' }),
        node('textbox', { name: 'Email', text: 'ana@shop.test', invalid: true }),
        node('button', { name: 'Pagar', disabled: true }),
        node('link', { name: 'Seguir comprando', url: '/' }),
        node('alert', { text: 'Revisa los campos del formulario.' }),
      ]),
    );

    expect(result.mode).toBe('full');
    expect(lines(result.text)).toEqual([
      '# Taza de cerámica',
      'Taza de 350 ml apta para lavavajillas.',
      '12,90 €',
      '[e1] combobox "Cantidad" = "1" options: 1|2',
      '[e2] button "Añadir al carrito"',
      '[e3] textbox "Email" = "ana@shop.test" [invalid]',
      '[e4] button "Pagar" [disabled]',
      '[e5] link "Seguir comprando" → /',
      '! alert "Revisa los campos del formulario."',
    ]);
  });

  it('starts with the page path and title', () => {
    const result = new ObservationBuilder().observe(
      page([], 'http://janus-a-app:3100/cart?x=1', 'Carrito'),
    );

    expect(result.text.split('\n')[0]).toBe('page /cart?x=1 · "Carrito"');
  });

  it('drops elements more than one screen away from the viewport, and zero-size ones', () => {
    const result = new ObservationBuilder().observe(
      page([
        node('button', { name: 'Arriba', box: box(-700) }),
        node('button', { name: 'Lejos arriba', box: box(-800) }),
        node('button', { name: 'Abajo', box: box(1400) }),
        node('button', { name: 'Lejos abajo', box: box(1500) }),
        node('button', { name: 'Oculto', box: { x: 0, y: 10, width: 0, height: 0 } }),
      ]),
    );

    expect(lines(result.text)).toEqual(['[e1] button "Arriba"', '[e2] button "Abajo"']);
  });

  it('keeps navigation elements but not banner or footer prose', () => {
    const result = new ObservationBuilder().observe(
      capture([
        node('generic', {}, [
          node('banner', {}, [
            node('link', { name: 'Carrito', url: '/cart' }),
            node('generic', { text: 'Hola, Ana' }),
          ]),
          node('main', {}, [node('paragraph', { text: 'Bienvenida' })]),
          node('contentinfo', { text: 'Tienda de demostración.' }),
        ]),
      ]),
    );

    expect(lines(result.text)).toEqual(['[e1] link "Carrito" → /cart', 'Bienvenida']);
  });

  it('ignores the route announcer: an alert that only repeats the title or a heading', () => {
    const result = new ObservationBuilder().observe(
      page(
        [
          node('heading', { name: 'Carrito', level: 1 }),
          node('alert', { text: 'Shop' }),
          node('alert', {}),
          node('alert', { text: 'Carrito' }),
          node('status', { text: 'Añadido al carrito' }),
        ],
        undefined,
        'Shop',
      ),
    );

    expect(lines(result.text)).toEqual(['# Carrito', '! status "Añadido al carrito"']);
    expect(result.alerts).toEqual([]);
  });

  it('lists the texts of alert notices, not statuses', () => {
    const result = new ObservationBuilder().observe(
      page([
        node('alert', { text: 'Revisa los campos del formulario.' }),
        node('status', { text: 'Guardado.' }),
        node('alert', {
          text: 'Email o contraseña incorrectos.',
          box: { x: 0, y: 5000, width: 10, height: 10 },
        }),
      ]),
    );

    expect(result.alerts).toEqual(['Revisa los campos del formulario.']);
  });

  it('writes a table row as one line and keeps the elements inside it', () => {
    const result = new ObservationBuilder().observe(
      page([
        node('table', { name: 'Totales' }, [
          node('row', {}, [
            node('rowheader', { name: 'Subtotal' }),
            node('cell', { name: '12,90 €' }),
          ]),
          node('row', {}, [
            node('cell', {}, [node('link', { name: 'Taza', url: '/products/taza' })]),
            node('cell', { name: '1' }),
            node('cell', {}, [node('button', { name: 'Quitar Taza' })]),
          ]),
        ]),
      ]),
    );

    expect(lines(result.text)).toEqual([
      'Totales:',
      'Subtotal | 12,90 €',
      '[e1] link "Taza" → /products/taza',
      '1',
      '[e2] button "Quitar Taza"',
    ]);
  });

  it('writes a heading that wraps a link as the link alone', () => {
    const result = new ObservationBuilder().observe(
      page([node('heading', { level: 2 }, [node('link', { name: 'Agenda', url: '/p/agenda' })])]),
    );

    expect(lines(result.text)).toEqual(['[e1] link "Agenda" → /p/agenda']);
  });

  it('marks checked radios and the focused element', () => {
    const result = new ObservationBuilder().observe(
      page([
        node('radio', { name: 'Tarjeta', checked: true }),
        node('radio', { name: 'Transferencia', active: true }),
      ]),
    );

    expect(lines(result.text)).toEqual([
      '[e1] radio "Tarjeta" [checked]',
      '[e2] radio "Transferencia" [focused]',
    ]);
  });

  it('maps every ref to a role, exact name and position among equals', () => {
    const result = new ObservationBuilder().observe(
      page([
        node('button', { name: 'Comprar' }),
        node('button', { name: 'Comprar' }),
        node('link', { name: 'Inicio' }),
      ]),
    );

    expect(Object.fromEntries(result.locators)).toEqual({
      e1: { role: 'button', name: 'Comprar', nth: 0 },
      e2: { role: 'button', name: 'Comprar', nth: 1 },
      e3: { role: 'link', name: 'Inicio', nth: 0 },
    });
  });

  it('counts position among equals over the whole page, not just the window', () => {
    const result = new ObservationBuilder().observe(
      page([
        node('button', { name: 'Comprar', box: box(-2000) }),
        node('button', { name: 'Comprar', box: box(100) }),
      ]),
    );

    expect(result.locators.get('e1')).toEqual({ role: 'button', name: 'Comprar', nth: 1 });
  });

  it('rejects a capture that is not a Playwright aria tree', () => {
    expect(() => new ObservationBuilder().observe({ url: 'x' })).toThrow(InvalidCaptureError);
  });
});
