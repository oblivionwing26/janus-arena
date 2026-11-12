import { describe, expect, it } from 'vitest';

import { pageOf } from './session.js';

describe('pageOf', () => {
  it('compares pages by path, whatever the query or an anchor', () => {
    expect(pageOf('http://shop.test/cart?step=2')).toBe('/cart');
    expect(pageOf('http://shop.test/cart#top')).toBe('/cart');
  });

  it('keeps a single-page app’s hash route, without its query (F3.5a)', () => {
    expect(pageOf('http://juice.test/#/basket')).toBe('/#/basket');
    expect(pageOf('http://juice.test/#/search?q=apple')).toBe('/#/search');
    expect(pageOf('http://juice.test/#/')).toBe('/');
  });
});
