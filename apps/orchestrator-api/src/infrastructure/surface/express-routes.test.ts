import { describe, expect, it } from 'vitest';

import { expressRoutes } from './express-routes.js';
import { SourceSet } from './source-set.js';

// A small Express app shaped like Juice Shop's server.ts and routes/.
const sources = new SourceSet(
  new Map([
    [
      'server.ts',
      [
        "import * as security from './lib/insecurity'",
        "import * as utils from './lib/utils'",
        "import { retrieveBasket } from './routes/basket'",
        "import * as basketItems from './routes/basketItems'",
        '',
        "app.use('/rest/basket/:id', security.isAuthorized())",
        "app.get('/rest/basket/:id', utils.asyncHandler(retrieveBasket()))",
        "app.post('/api/BasketItems', security.appendUserId(), basketItems.addBasketItem())",
        "app.route('/api/Products/:id').get(security.isAuthorized())",
        "app.get('/rest/health', (req, res) => res.json({ ok: req.query.verbose }))",
        "app.get('/rest/missing/:x', notImported())",
        '',
      ].join('\n'),
    ],
    [
      'routes/basket.ts',
      [
        'export function retrieveBasket () {',
        '  return async (req, res, next) => {',
        '    const basket = await BasketModel.findOne({ where: { id: req.params.id } })',
        '    res.json(basket)',
        '  }',
        '}',
        '',
      ].join('\n'),
    ],
    [
      'routes/basketItems.ts',
      [
        'export function addBasketItem () {',
        '  return async (req, res) => {',
        '    const { ProductId, quantity } = req.body',
        '    res.json({ ProductId, quantity })',
        '  }',
        '}',
        '',
      ].join('\n'),
    ],
  ]),
);

describe('expressRoutes', () => {
  const { routes, mounts } = expressRoutes(sources, ['server.ts']);
  const byRoute = (route: string) =>
    routes.find((entry) => entry.endpoint.route === route)?.endpoint;

  it('follows a wrapped factory to the function that answers, in its own file', () => {
    expect(byRoute('/rest/basket/:id')).toEqual({
      route: '/rest/basket/:id',
      method: 'GET',
      declaredAt: { file: 'server.ts', line: 7 },
      handler: { file: 'routes/basket.ts', line: 2, name: 'retrieveBasket' },
      params: ['id'],
    });
  });

  it('resolves namespace imports and reads the body keys the handler uses', () => {
    expect(byRoute('/api/BasketItems')).toMatchObject({
      method: 'POST',
      handler: { file: 'routes/basketItems.ts', name: 'addBasketItem' },
      params: ['body.ProductId', 'body.quantity'],
    });
    expect(
      routes.find((entry) => entry.endpoint.route === '/api/BasketItems')?.middlewares,
    ).toHaveLength(1);
  });

  it('handles route chains, inline handlers and handlers it cannot find', () => {
    expect(byRoute('/api/Products/:id')).toMatchObject({ method: 'GET', params: ['id'] });
    expect(byRoute('/rest/health')).toMatchObject({
      handler: { file: 'server.ts', name: '(inline)' },
      params: ['query.verbose'],
    });
    expect(byRoute('/rest/missing/:x')?.handler).toBeNull();
  });

  it('collects app.use mounts with their prefix', () => {
    expect(mounts.map((mount) => [mount.prefix, mount.at.line, mount.middlewares.length])).toEqual([
      ['/rest/basket/:id', 6, 1],
    ]);
  });
});
