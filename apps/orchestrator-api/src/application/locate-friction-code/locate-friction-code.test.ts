import { newUlid, parseEvent, type JanusEvent } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { InMemoryVcs } from '../../infrastructure/vcs/in-memory-vcs.js';
import { buildContext } from './build-context.js';
import { LocateFrictionCode } from './locate-friction-code.js';
import { localImports, pageFilesFor } from './next-routes.js';
import { isCodeFile, rankCandidates } from './rank-candidates.js';
import { zoneHints } from './zone-hints.js';

const RUN_ID = '01JC0F22RNK0000000000000AA';
const BASE = 'http://janus-r-x-a-app:3100';
const URL = 'file:///fixtures/shop';
const ROUTES = ['/products/:slug', '/orders/:id'];

/** A small Next.js shop, shaped like ShopLab but written for these tests. */
const SHOP: Record<string, string> = {
  'src/app/layout.tsx':
    'export default function Layout() { return <nav>Tienda · Carrito · Mis pedidos</nav>; }\n',
  'src/app/page.tsx': 'export default function Home() { return <h1>Tienda</h1>; }\n',
  'src/app/cart/page.tsx': [
    "import { TotalsTable } from '@/components/totals-table';",
    "import { MoreOptions } from '../../components/more-options';",
    '',
    'export default function Cart() {',
    '  return (',
    '    <>',
    '      <h1>Carrito</h1>',
    '      <MoreOptions label="Otras opciones" />',
    '      <TotalsTable showShipping={false} />',
    '      <a href="/checkout">Ir a pagar</a>',
    '    </>',
    '  );',
    '}',
    '',
  ].join('\n'),
  'src/app/checkout/page.tsx': [
    "import { TotalsTable } from '@/components/totals-table';",
    '',
    'export default function Checkout() {',
    '  return <><h1>Pago</h1><TotalsTable /><button>Confirmar pedido</button></>;',
    '}',
    '',
  ].join('\n'),
  'src/app/products/[slug]/page.tsx':
    'export default function Product() { return <button>Añadir al carrito</button>; }\n',
  'src/app/register/page.tsx': [
    "import { JsonForm } from '@/components/json-form';",
    'export default function Register() {',
    '  return <JsonForm submitLabel="Crear cuenta" />;',
    '}',
    '',
  ].join('\n'),
  'src/components/totals-table.tsx':
    'export function TotalsTable() { return <table><tr><th>Subtotal</th></tr><tr><th>Envío</th></tr><tr><th>Total</th></tr></table>; }\n',
  'src/components/more-options.tsx':
    'export function MoreOptions({ label }: { label: string }) { return <a href="#">{label}</a>; }\n',
  'src/components/json-form.tsx':
    'export function JsonForm() { return <form role="alert">Revisa los campos del formulario.</form>; }\n',
  'src/components/totals-table.test.tsx': 'it("shows Otras opciones and Subtotal", () => {});\n',
  'UX_FLAWS.md': '# Ground truth: Otras opciones, Envío, Crear cuenta, src/app/cart/page.tsx\n',
};

let seq = 0;
function event(agentId: string, type: string, payload: unknown): JanusEvent {
  seq += 1;
  return parseEvent({
    id: newUlid(),
    runId: RUN_ID,
    seq,
    ts: new Date(Date.UTC(2026, 10, 7, 10, 0, seq)).toISOString(),
    schemaVersion: 1,
    actor: { agentId, role: 'navigator' },
    type,
    payload,
  }) as JanusEvent;
}

const step = (
  agentId: string,
  stepIndex: number,
  path: string,
  texts: string[],
  alerts?: string[],
) =>
  event(agentId, 'agent.step', {
    stepIndex,
    url: BASE + path,
    durationMs: 3000,
    texts,
    ...(alerts === undefined ? {} : { alerts }),
  });

const CHROME = ['ShopLab', 'Tienda', 'Carrito', 'Mis pedidos'];

describe('pageFilesFor and localImports', () => {
  const files = Object.keys(SHOP);

  it('maps routes to app-router pages, dynamic segments and groups included', () => {
    expect(pageFilesFor('/cart', files)).toEqual(['src/app/cart/page.tsx']);
    expect(pageFilesFor('/', files)).toEqual(['src/app/page.tsx']);
    expect(pageFilesFor('/products/:slug', files)).toEqual(['src/app/products/[slug]/page.tsx']);
    expect(pageFilesFor('/products/taza', files)).toEqual(['src/app/products/[slug]/page.tsx']);
    expect(pageFilesFor('/shop/cart', ['app/(shop)/shop/cart/page.tsx'])).toEqual([
      'app/(shop)/shop/cart/page.tsx',
    ]);
    expect(pageFilesFor('/nowhere', files)).toEqual([]);
  });

  it('resolves @/ and relative imports to project files, packages left out', () => {
    expect(
      localImports('src/app/cart/page.tsx', SHOP['src/app/cart/page.tsx'] ?? '', files),
    ).toEqual(['src/components/more-options.tsx', 'src/components/totals-table.tsx']);
  });
});

describe('zoneHints', () => {
  it('takes the element and the texts of the zone page, without the site chrome', () => {
    const steps = [
      step('carmen-a-s1-a1', 0, '/', [...CHROME, 'Taza de cerámica']),
      step('carmen-a-s1-a1', 1, '/register', [...CHROME, 'Crear cuenta', 'Nombre', 'Email']),
      step(
        'carmen-a-s1-a1',
        2,
        '/register',
        [...CHROME, 'Crear cuenta', 'Nombre', '12,90 €'],
        ['Revisa los campos del formulario.'],
      ),
      step('carmen-a-s1-a1', 3, '/cart', [...CHROME, 'Subtotal']),
      step('diego-a-s1-a1', 0, '/register', ['Otro usuario']),
    ];

    const hints = zoneHints(
      {
        route: '/register',
        element: 'role=button[name="Crear cuenta"]',
        evidenceEventIds: [steps[2]?.id ?? ''],
      },
      steps,
      ROUTES,
    );

    expect(hints).toEqual({
      route: '/register',
      element: {
        role: 'button',
        name: 'Crear cuenta',
        selector: 'role=button[name="Crear cuenta"]',
      },
      texts: ['Crear cuenta', 'Nombre', 'Email'],
      alerts: ['Revisa los campos del formulario.'],
    });
  });
});

describe('rankCandidates', () => {
  const sources = new Map(Object.entries(SHOP));

  it('puts the page of the route and its components first, with their reasons', () => {
    const [first, ...rest] = rankCandidates(
      { route: '/cart', element: null, texts: ['Otras opciones', 'Ir a pagar'], alerts: [] },
      sources,
    );

    expect(first).toMatchObject({ path: 'src/app/cart/page.tsx', score: 7 });
    expect(first?.reasons).toContain('renders /cart');
    expect(rest.map((candidate) => candidate.path).slice(0, 2)).toEqual([
      'src/components/more-options.tsx',
      'src/components/totals-table.tsx',
    ]);
  });

  // The typical false positive: "Total" or "Subtotal" appear in a shared table; they must not
  // outrank the page that renders the route where the friction happened.
  it('does not let common texts outrank the page of the route', () => {
    const ranked = rankCandidates(
      { route: '/checkout', element: null, texts: ['Subtotal', 'Total', 'Envío'], alerts: [] },
      sources,
    );

    expect(ranked[0]?.path).toBe('src/app/checkout/page.tsx');
    expect(ranked[1]?.path).toBe('src/components/totals-table.tsx');
  });

  it('never ranks the ground truth, tests or documents, whatever they contain', () => {
    const ranked = rankCandidates(
      {
        route: '/register',
        element: { role: 'button', name: 'Crear cuenta', selector: 'x' },
        texts: ['Otras opciones', 'Envío'],
        alerts: [],
      },
      sources,
    );
    const paths = ranked.map((candidate) => candidate.path);

    expect(paths.slice(0, 2)).toEqual([
      'src/app/register/page.tsx',
      'src/components/json-form.tsx',
    ]);
    expect(paths.some((path) => /UX_FLAWS|\.test\./.test(path))).toBe(false);
    expect(isCodeFile('UX_FLAWS.md')).toBe(false);
    expect(isCodeFile('src/ux_flaws.ts')).toBe(false);
  });
});

describe('buildContext', () => {
  const sources = new Map(Object.entries(SHOP));
  const hints = { route: '/cart', element: null, texts: ['Otras opciones'], alerts: [] };

  it('gives numbered lines around each text and the imports of the page', () => {
    const context = buildContext(hints, rankCandidates(hints, sources), sources);
    const cart = context.snippets.find((snippet) => snippet.path === 'src/app/cart/page.tsx');

    expect(cart?.startLine).toBe(1);
    expect(cart?.text).toContain('   8|       <MoreOptions label="Otras opciones" />');
    expect(context.tokens).toBeGreaterThan(0);
  });

  it('stops at the token budget and says what it left out', () => {
    const context = buildContext(hints, rankCandidates(hints, sources), sources, { maxTokens: 60 });

    expect(context.tokens).toBeLessThanOrEqual(60);
    expect(context.omitted.length).toBeGreaterThan(0);
  });
});

describe('LocateFrictionCode', () => {
  it('reads the workspace through VcsPort and never sees the hidden ground truth', async () => {
    const vcs = new InMemoryVcs({ [URL]: { main: SHOP } });
    const workspace = await vcs.clone(URL, {
      runId: RUN_ID,
      ref: 'main',
      excludeFiles: ['UX_FLAWS.md'],
    });
    const cart = step('rosa-a-s1-a1', 0, '/cart', [...CHROME, 'Otras opciones', 'Ir a pagar']);

    const found = await new LocateFrictionCode({ vcs }).execute({
      zone: { route: '/cart', element: null, evidenceEventIds: [cart.id] },
      events: [step('rosa-a-s1-a1', 1, '/', CHROME), cart],
      workspace,
      routes: ROUTES,
    });

    expect(found.candidates[0]?.path).toBe('src/app/cart/page.tsx');
    expect(found.context.snippets.some((snippet) => snippet.path.includes('UX_FLAWS'))).toBe(false);
    expect(JSON.stringify(found)).not.toContain('Ground truth');
  });
});
