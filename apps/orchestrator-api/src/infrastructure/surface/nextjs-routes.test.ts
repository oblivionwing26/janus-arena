import { describe, expect, it } from 'vitest';

import { nextjsEndpoints, nextRoute } from './nextjs-routes.js';
import { SourceSet } from './source-set.js';

describe('nextRoute', () => {
  it('turns app router files into Express-style routes with their parameters', () => {
    expect(nextRoute('src/app/api/orders/[id]/route.ts')).toEqual({
      route: '/api/orders/:id',
      params: ['id'],
    });
    expect(nextRoute('app/(shop)/api/files/[...path]/route.js')).toEqual({
      route: '/api/files/*path',
      params: ['path'],
    });
    expect(nextRoute('src/app/route.ts')).toEqual({ route: '/', params: [] });
    expect(nextRoute('src/app/cart/page.tsx')).toBeNull();
  });
});

describe('nextjsEndpoints', () => {
  const sources = new SourceSet(
    new Map([
      [
        'src/app/api/orders/[id]/route.ts',
        [
          "import { requireUser } from '@/lib/http';",
          'export async function GET(request: Request) {',
          '  return Response.json({});',
          '}',
          'export const DELETE = async (request: Request) => Response.json({});',
          'function helper() {}',
          '',
        ].join('\n'),
      ],
      [
        'src/app/api/cart/items/route.ts',
        [
          'export async function POST(request: Request) {',
          '  const body = await request.json();',
          '  const { searchParams } = new URL(request.url);',
          "  return Response.json({ p: body.productId, q: body.quantity, c: searchParams.get('coupon') });",
          '}',
          '',
        ].join('\n'),
      ],
      [
        'src/app/actions.ts',
        ["'use server';", 'export async function placeOrder(form: FormData) {}', ''].join('\n'),
      ],
      ['src/lib/http.ts', 'export async function requireUser() {}\n'],
    ]),
  );

  it('finds route handlers by HTTP method export, and server actions', () => {
    expect(nextjsEndpoints(sources)).toEqual([
      {
        route: '/api/cart/items',
        method: 'POST',
        declaredAt: { file: 'src/app/api/cart/items/route.ts', line: 1 },
        handler: { file: 'src/app/api/cart/items/route.ts', line: 1, name: 'POST' },
        params: ['body.productId', 'body.quantity', 'query.coupon'],
      },
      {
        route: '/api/orders/:id',
        method: 'DELETE',
        declaredAt: { file: 'src/app/api/orders/[id]/route.ts', line: 5 },
        handler: { file: 'src/app/api/orders/[id]/route.ts', line: 5, name: 'DELETE' },
        params: ['id'],
      },
      {
        route: '/api/orders/:id',
        method: 'GET',
        declaredAt: { file: 'src/app/api/orders/[id]/route.ts', line: 2 },
        handler: { file: 'src/app/api/orders/[id]/route.ts', line: 2, name: 'GET' },
        params: ['id'],
      },
      {
        route: 'action:src/app/actions.ts#placeOrder',
        method: 'POST',
        declaredAt: { file: 'src/app/actions.ts', line: 2 },
        handler: { file: 'src/app/actions.ts', line: 2, name: 'placeOrder' },
        params: [],
      },
    ]);
  });
});
