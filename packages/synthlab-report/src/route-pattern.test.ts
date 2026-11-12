import { describe, expect, it } from 'vitest';

import { routeOf } from './route-pattern.js';

const PATTERNS = ['/products/:slug', '/orders/:id'];

describe('routeOf', () => {
  it('drops the host, the query and the trailing slash', () => {
    expect(routeOf('http://janus-r-x-a-app:3100/cart/?step=2#top', PATTERNS)).toBe('/cart');
    expect(routeOf('http://shop.test/', PATTERNS)).toBe('/');
  });

  it('folds every product into its pattern', () => {
    expect(routeOf('http://shop.test/products/cuaderno-a5', PATTERNS)).toBe('/products/:slug');
    expect(routeOf('http://shop.test/products/taza-ceramica', PATTERNS)).toBe('/products/:slug');
  });

  it('turns numeric segments into :id when no pattern matches', () => {
    expect(routeOf('http://shop.test/invoices/42/lines/7')).toBe('/invoices/:id/lines/:id');
  });

  it('does not match a pattern of another length', () => {
    expect(routeOf('http://shop.test/orders', PATTERNS)).toBe('/orders');
    expect(routeOf('http://shop.test/orders/6', PATTERNS)).toBe('/orders/:id');
  });
});

describe('routeOf on a single-page app (F3.5a)', () => {
  const SPA = ['/#/order-completion/:id'];

  it('keeps the hash route and drops its query', () => {
    expect(routeOf('http://juice.test/#/basket', SPA)).toBe('/#/basket');
    expect(routeOf('http://juice.test/#/search?q=apple', SPA)).toBe('/#/search');
    expect(routeOf('http://juice.test/#/order-completion/5267-f9cd5882f54c75a3', SPA)).toBe(
      '/#/order-completion/:id',
    );
  });

  it('treats the hash home and an in-page anchor as no route', () => {
    expect(routeOf('http://juice.test/#/', SPA)).toBe('/');
    expect(routeOf('http://shop.test/cart#top', SPA)).toBe('/cart');
  });
});
