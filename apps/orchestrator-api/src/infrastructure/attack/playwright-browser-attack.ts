import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';

import type {
  BrowserAttackPort,
  BrowserVisit,
  InjectionPoint,
} from '../../domain/attack/browser-attack-port.js';
import type { PageDialogRecord } from '../../domain/browser/page-telemetry.js';
import { NetworkGuard } from '../../domain/scope/network-guard.js';

const NAVIGATION_MS = 15_000;
const REFLECT_WAIT_MS = 1_500;
const VISIT_WAIT_MS = 8_000;
const MAX_FIELDS = 10;
const OVERLAY_MS = 800;
// Overlays a first-time visitor closes (welcome banners, cookie notices); never "close search".
const DISMISS = /^(?!.*search).*\b(dismiss|close|accept|agree|got it)\b/i;
// Buttons that reveal a hidden search field.
const REVEAL_SEARCH = /^(open |show |toggle )?search$/i;

/** The template where `probe` came back in the URL's query (or the hash route's query). */
function reflectedTemplate(url: string, probe: string): string | null {
  const parsed = new URL(url);
  for (const [key, value] of parsed.searchParams) {
    if (value === probe) {
      parsed.searchParams.set(key, '__JANUS_SLOT__');
      return parsed.href.replace('__JANUS_SLOT__', '{payload}');
    }
  }
  const [route, query] = parsed.hash.split('?');
  if (query !== undefined) {
    const params = new URLSearchParams(query);
    for (const [key, value] of params) {
      if (value === probe) {
        params.set(key, '__JANUS_SLOT__');
        parsed.hash = `${route ?? ''}?${params.toString()}`;
        return parsed.href.replace('__JANUS_SLOT__', '{payload}');
      }
    }
  }
  return null;
}

/**
 * The Red Team's browser (F3.3, ADR 0011), on the remote Playwright server in janus-sbx. One
 * fresh context per discovery and per visit; each context aborts every request outside the
 * target's origin, through a NetworkGuard, and records then dismisses every dialog. Discovery
 * types a harmless probe into each text field and presses Enter; a field whose value comes
 * back in the URL is an injection point. No script is evaluated in the page.
 */
export class PlaywrightBrowserAttack implements BrowserAttackPort {
  private browser: Browser | undefined;

  constructor(
    private readonly wsEndpoint = process.env.JANUS_BROWSER_WS ?? 'ws://127.0.0.1:53000/',
  ) {}

  async discover(origin: string, probe: string): Promise<readonly InjectionPoint[]> {
    const { context, page } = await this.open(origin, []);
    const points = new Map<string, InjectionPoint>();
    try {
      const fieldCount = await this.prepare(page, origin);
      for (let index = 0; index < Math.min(fieldCount, MAX_FIELDS); index++) {
        if (index > 0) await this.prepare(page, origin);
        const field = page.getByRole('textbox').or(page.getByRole('searchbox')).nth(index);
        if (!(await field.isVisible().catch(() => false))) continue;
        const label = (await field.getAttribute('aria-label').catch(() => null))?.trim();
        const placeholder = (await field.getAttribute('placeholder').catch(() => null))?.trim();
        // An empty label is no name either.
        const name =
          [label, placeholder].find((each) => each !== undefined && each !== '') ??
          `text field ${String(index + 1)}`;
        try {
          await field.fill(probe, { timeout: 3_000 });
          await field.press('Enter', { timeout: 3_000 });
          await page.waitForTimeout(REFLECT_WAIT_MS);
        } catch {
          continue;
        }
        const template = reflectedTemplate(page.url(), probe);
        if (template !== null && new URL(template.replace('{payload}', 'x')).origin === origin) {
          points.set(template, { template, field: name });
        }
      }
    } finally {
      await context.close();
    }
    return [...points.values()];
  }

  async visit(origin: string, url: string): Promise<BrowserVisit> {
    const dialogs: PageDialogRecord[] = [];
    const { context, page, guard } = await this.open(origin, dialogs);
    try {
      const decision = guard.check({ method: 'GET', url, testType: 'browse' });
      if (!decision.allowed) return { blocked: decision.reason, status: null, dialogs: [] };
      const response = await page
        .goto(url, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_MS })
        .catch(() => null);
      const deadline = Date.now() + VISIT_WAIT_MS;
      while (Date.now() < deadline && dialogs.length < 2) await page.waitForTimeout(250);
      return { blocked: null, status: response?.status() ?? null, dialogs: [...dialogs] };
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
  }

  private async open(
    origin: string,
    dialogs: PageDialogRecord[],
  ): Promise<{ context: BrowserContext; page: Page; guard: NetworkGuard }> {
    this.browser ??= await chromium.connect(this.wsEndpoint);
    const guard = NetworkGuard.forOrigin('red-team', origin);
    const context = await this.browser.newContext({ locale: 'en-US' });
    await context.route('**/*', (route) => {
      const decision = guard.check({
        method: route.request().method(),
        url: route.request().url(),
        testType: 'browse',
      });
      return decision.allowed ? route.continue() : route.abort('blockedbyclient');
    });
    const page = await context.newPage();
    page.on('dialog', (dialog) => {
      dialogs.push({
        kind: dialog.type(),
        message: dialog.message().slice(0, 200),
        url: page.url(),
      });
      void dialog.dismiss().catch(() => undefined);
    });
    return { context, page, guard };
  }

  /** Loads the home page, closes first-visit overlays and reveals search; counts text fields. */
  private async prepare(page: Page, origin: string): Promise<number> {
    await page.goto(`${origin}/`, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_MS });
    await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
    // A modal overlay hides the rest of the page until it has closed, and may cover the next
    // notice: two passes, each followed by a pause for the closing animation.
    for (let pass = 0; pass < 2; pass++) {
      for (const button of await page.getByRole('button', { name: DISMISS }).all()) {
        await button.click({ timeout: 1_000 }).catch(() => undefined);
      }
      await page.waitForTimeout(OVERLAY_MS);
    }
    for (const button of await page.getByRole('button', { name: REVEAL_SEARCH }).all()) {
      await button.click({ timeout: 1_000 }).catch(() => undefined);
    }
    await page.waitForTimeout(OVERLAY_MS);
    return page.getByRole('textbox').or(page.getByRole('searchbox')).count();
  }
}
