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

describe('ObservationBuilder on a single-page app (F3.5a)', () => {
  it('shows the hash route and sends a full page when only the hash changes', () => {
    const builder = new ObservationBuilder();
    const basket = builder.observe(
      page([node('heading', { level: 1, name: 'Your Basket' })], 'http://juice.test/#/basket'),
    );
    const address = builder.observe(
      page(
        [node('heading', { level: 1, name: 'Select an address' })],
        'http://juice.test/#/address/select',
      ),
    );

    expect(basket.text.split('\n')[0]).toContain('page /#/basket');
    expect(address.mode).toBe('full');
    expect(address.text.split('\n')[0]).toContain('page /#/address/select');
  });
});

describe('ObservationBuilder on a page without a main landmark (F3.5a)', () => {
  // Like Juice Shop's basket: a heading, a table and a button named by its text, no `main`.
  const basket = capture(
    [
      node('generic', { box: box(0) }, [
        node('banner', { box: box(0) }, [node('button', { name: 'Show the shopping cart' })]),
        node('heading', { level: 1, name: 'Your Basket' }),
        node('table', { box: box(0) }, [
          node('row', {}, [
            node('cell', { name: 'Apple Juice (1000ml)' }),
            node('cell', { name: '1.99¤' }),
          ]),
        ]),
        node('generic', { text: 'Total Price: 1.99¤' }),
        node('button', { box: box(0) }, ['Checkout']),
      ]),
    ],
    'http://juice.test/#/basket',
  );

  it('reads the whole page as content, so headings, tables and totals reach the agent', () => {
    const text = new ObservationBuilder().observe(basket).text;

    expect(text).toContain('# Your Basket');
    expect(text).toContain('Apple Juice (1000ml) | 1.99¤');
    expect(text).toContain('Total Price: 1.99¤');
  });

  it('names a control by its visible text when it arrives without a name', () => {
    const observation = new ObservationBuilder().observe(basket);

    expect(observation.text).toMatch(/\[e\d+\] button "Checkout"/);
    expect([...observation.locators.values()]).toContainEqual({
      role: 'button',
      name: 'Checkout',
      nth: 0,
    });
  });
});

describe('ObservationBuilder and content hidden from assistive technology (F3.5a)', () => {
  it('leaves aria-hidden icons out of a control’s name, as the browser does', () => {
    const page = capture(
      [
        node('generic', { box: box(0) }, [
          node('button', { box: box(0) }, [
            node('generic', {}, [
              node('img', { ariaHidden: true, text: 'cart-arrow-down' }),
              'Checkout',
            ]),
          ]),
          node('button', { box: box(0) }, [node('img', { ariaHidden: true, text: 'trash-alt' })]),
        ]),
      ],
      'http://juice.test/#/basket',
    );
    const text = new ObservationBuilder().observe(page).text;

    expect(text).toMatch(/\[e\d+\] button "Checkout"/);
    expect(text).not.toContain('cart-arrow-down');
    expect(text).not.toContain('trash-alt');
  });
});

describe('ObservationBuilder and a label that hides the visible text (F3.5a)', () => {
  // Juice Shop: every product card is a button labelled "Click for more information about the
  // product"; the label replaces the product name a sighted shopper reads on the card.
  const card = (product: string) =>
    node('button', { name: 'Click for more information about the product', box: box(0) }, [
      node('img', { name: product, box: box(0) }),
      node('generic', { text: product, box: box(0) }),
    ]);

  it('shows the text the control shows, once, next to its accessible name', () => {
    const text = new ObservationBuilder().observe(
      capture(
        [node('generic', { box: box(0) }, [card('Apple Juice (1000ml)'), card('Pineapple Juice')])],
        'http://juice.test/#/search?q=juice',
      ),
    ).text;

    expect(text).toMatch(
      /\[e\d+\] button "Click for more information about the product" shows "Apple Juice \(1000ml\)"\n/,
    );
    expect(text).toContain('shows "Pineapple Juice"');
  });

  it('keeps the accessible name as the locator, since the browser finds it by that name', () => {
    const observation = new ObservationBuilder().observe(
      capture([card('Apple Juice (1000ml)')], 'http://juice.test/#/search'),
    );

    expect([...observation.locators.values()]).toEqual([
      { role: 'button', name: 'Click for more information about the product', nth: 0 },
    ]);
  });

  it('adds nothing when the name already says what the control shows', () => {
    const text = new ObservationBuilder().observe(
      capture(
        [
          node('button', { name: 'Add to Basket', box: box(0) }, [
            node('generic', { text: 'Add to Basket' }),
          ]),
          node('link', { name: 'Apple Juice (1000ml), 1.99', box: box(0) }, [
            'Apple Juice (1000ml)',
          ]),
        ],
        'http://juice.test/#/search',
      ),
    ).text;

    expect(text).not.toContain('shows');
  });
});
