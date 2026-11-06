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
