// Captures the ShopLab pages used as golden fixtures by @janus/observation-builder (F1.1).
// Run by a human, local only: `pnpm --filter @janus/orchestrator-api observation:capture-fixtures`.
// Needs `docker compose up -d` (proxy, browser, browser-relay). Starts a fresh ShopLab variant,
// walks the purchase path with fixed synthetic data and writes one raw capture per page.

import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { PageSnapshot } from '../../domain/browser/browser-port.js';
import { PlaywrightRunner } from '../../infrastructure/browser/playwright-runner.js';
import { DockerCli } from '../../infrastructure/sandbox/docker-cli.js';
import { DockerSandbox } from '../../infrastructure/sandbox/docker-sandbox.js';
import { workspacesRoot } from '../../infrastructure/sandbox/workspace.js';
import { repoRoot } from './fixture-request.js';

const envFile = join(repoRoot(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const VARIANT = 'obsfix';
const outDir = join(repoRoot(), 'packages', 'observation-builder', 'fixtures', 'shoplab');
const buyer = {
  name: 'Comprador Fixture',
  email: 'fixture-buyer@shoplab.test',
  password: 'fixture-password-1',
  address: 'Calle Fixture 1, 28001 Madrid',
};

const sandbox = new DockerSandbox({ docker: new DockerCli(), workspacesRoot: workspacesRoot() });
const browser = new PlaywrightRunner();

async function save(name: string, snapshot: PageSnapshot): Promise<void> {
  // The YAML form is redundant with `tree`; the builder only reads the JSON tree.
  const { url, title, viewport, tree } = snapshot;
  const path = join(outDir, `${name}.capture.json`);
  await writeFile(path, `${JSON.stringify({ url, title, viewport, tree }, null, 2)}\n`);
  console.log(`captured ${name}: ${new URL(url).pathname}`);
}

try {
  const { baseUrl } = await sandbox.up({ id: VARIANT, target: 'shoplab', ref: 'main' });
  await mkdir(outDir, { recursive: true });
  const s = await browser.newSession({ baseUrl });
  const capture = async (name: string) => save(name, await browser.snapshot(s));

  await browser.goto(s, `${baseUrl}/register`);
  await capture('register-empty');

  await browser.type(s, { label: 'Nombre' }, buyer.name);
  await browser.type(s, { label: 'Email' }, 'no-es-un-email');
  await browser.type(s, { label: 'Contraseña (mínimo 8 caracteres)' }, 'corta');
  await capture('register-filled');
  await browser.click(s, { role: 'button', name: 'Crear cuenta' });
  await new Promise((resolve) => setTimeout(resolve, 1_000));
  await capture('register-errors');

  await browser.goto(s, `${baseUrl}/register`);
  await browser.type(s, { label: 'Nombre' }, buyer.name);
  await browser.type(s, { label: 'Email' }, buyer.email);
  await browser.type(s, { label: 'Contraseña (mínimo 8 caracteres)' }, buyer.password);
  await browser.type(s, { label: 'Dirección de envío' }, buyer.address);
  await browser.click(s, { role: 'button', name: 'Crear cuenta' });
  await browser.waitForUrl(s, /\/$/);
  await capture('home');

  await browser.click(s, { role: 'link', name: 'Taza de cerámica' });
  await browser.waitForUrl(s, /\/products\/[^/]+$/);
  await capture('product');

  await browser.click(s, { role: 'button', name: 'Añadir al carrito' });
  await browser.waitForUrl(s, /\/cart$/);
  await capture('cart');

  await browser.click(s, { role: 'link', name: 'Ir a pagar' });
  await browser.waitForUrl(s, /\/checkout$/);
  await capture('checkout');

  await browser.click(s, { role: 'button', name: 'Confirmar pedido' });
  await browser.waitForUrl(s, /\/orders\/\d+(\?.*)?$/);
  await capture('order');

  await browser.goto(s, `${baseUrl}/orders`);
  await capture('orders');
} finally {
  await browser.shutdown();
  await sandbox.down(VARIANT);
}
