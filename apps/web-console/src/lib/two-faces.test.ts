import { readFileSync, writeFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { buildAttackTree, type RunEvent } from './attack-tree';
import { apiEndpoint, buildTwoFaces, clientRoute } from './two-faces';
import committed from './two-faces.data.json';

const runs = new URL('../../public/demo/runs/', import.meta.url);
const events = (id: string) =>
  (JSON.parse(readFileSync(new URL(`${id}.json`, runs), 'utf8')) as { events: RunEvent[] }).events;

const SYNTHLAB = '01M79YYRATK9KNKWMMD4317E77';
const RED = '01M79ZA35SZ9QRNF6K3AAGXNQN';
const BLUE = '01M79ZC3PHE7YQA5EQR02YHTBC';

function build() {
  const red = events(RED);
  const scope = red.find((e) => e.type === 'scope.verified')?.payload.excludedPaths;
  return buildTwoFaces(events(SYNTHLAB), buildAttackTree(red, events(BLUE)), scope as string[]);
}

describe('buildTwoFaces on the recorded Juice Shop gate', () => {
  const faces = build();

  it('matches the committed summary the page loads (UPDATE_TWO_FACES=1 rewrites it)', () => {
    if (process.env.UPDATE_TWO_FACES === '1') {
      writeFileSync(
        new URL('./two-faces.data.json', import.meta.url),
        `${JSON.stringify(faces, null, 2)}\n`,
      );
    }
    expect(faces).toEqual(committed);
  });

  it('counts the sessions and the purchases', () => {
    expect(faces.sessions).toBe(10);
    expect(faces.passed).toBe(6);
  });

  it('follows the purchase funnel in order', () => {
    expect(faces.pages.map((p) => p.route)).toEqual([
      '/',
      '/search',
      '/login',
      '/basket',
      '/address/select',
      '/delivery-method',
      '/payment/shop',
      '/order-summary',
      '/order-completion/:id',
    ]);
  });

  it('bridges the faces through the calls each page made', () => {
    const search = faces.pages.find((p) => p.route === '/search');
    expect(search?.pageState).toBe('exploited');
    expect(search?.endpoints.find((e) => e.endpoint === 'GET /rest/basket/:id')?.state).toBe(
      'fixed',
    );
    const login = faces.pages.find((p) => p.route === '/login');
    expect(login?.endpoints.find((e) => e.endpoint === 'POST /rest/user/login')?.state).toBe(
      'exploited',
    );
  });

  it('never shows a path the scope excludes', () => {
    const all = faces.pages.flatMap((p) => p.endpoints.map((e) => e.endpoint));
    expect(all.some((e) => e.includes('/api/Challenges'))).toBe(false);
    expect(all.some((e) => e.includes('application-configuration'))).toBe(false);
  });
});

describe('route helpers', () => {
  it('reads the client route and folds ids', () => {
    expect(clientRoute('http://x:3000/#/order-completion/af-7b')).toBe('/order-completion/:id');
    expect(clientRoute('http://x:3000/#/search?q=apple')).toBe('/search');
    expect(clientRoute('http://x:3000/')).toBe('/');
  });

  it('keeps only API calls, with ids folded', () => {
    expect(apiEndpoint('GET', '/rest/basket/6')).toBe('GET /rest/basket/:id');
    expect(apiEndpoint('POST', '/api/BasketItems/')).toBe('POST /api/BasketItems');
    expect(apiEndpoint('GET', '/assets/i18n/en.json')).toBeNull();
    expect(apiEndpoint('GET', '/rest/track-order/1be8-02be38c5f27bee93')).toBe(
      'GET /rest/track-order/:id',
    );
  });
});
