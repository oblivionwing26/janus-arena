import {
  chromium,
  errors,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from 'playwright-core';

import {
  BrowserSessionNotFoundError,
  ElementDisabledError,
  ElementNotFoundError,
  ElementObscuredError,
  NavigationTimeoutError,
  OptionNotFoundError,
} from '../../domain/browser/browser-errors.js';
import type {
  BrowserPort,
  BrowserSessionOptions,
  ElementBox,
  ElementTarget,
  FetchTextOptions,
  PageSnapshot,
  TypeOptions,
} from '../../domain/browser/browser-port.js';
import type {
  PageActivity,
  PageDialogRecord,
  PageErrorRecord,
  PageTelemetry,
} from '../../domain/browser/page-telemetry.js';
import {
  NetworkGuard,
  ScopeBlockedError,
  type BlockedRequest,
} from '../../domain/scope/network-guard.js';
import { actionFailureOf } from './action-failure.js';
import {
  instrumentationScript,
  parseInstrumentation,
  READ_INSTRUMENTATION,
} from './page-instrumentation.js';
import { NetworkQuiet } from './network-quiet.js';
import { watchPageErrors } from './watch-page-errors.js';
import { maskSecrets } from './mask-secrets.js';

type AriaRole = Parameters<Page['getByRole']>[0];

// Playwright's own default when a context sets no viewport.
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };
// A mid-size phone. Chromium only; no user agent spoofing.
const MOBILE_CONTEXT = {
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
};
// How long settle() waits for the page to load, then for the network to go quiet.
const SETTLE_LOAD_MS = 5_000;
// The network must stay quiet this long, waiting at most SETTLE_MAX_MS in total.
const SETTLE_QUIET_MS = 500;
const SETTLE_MAX_MS = 5_000;
const SETTLE_POLL_MS = 50;

interface Session {
  readonly context: BrowserContext;
  readonly page: Page;
  /** Technical errors seen since the last drainTelemetry(). */
  readonly errors: PageErrorRecord[];
  readonly network: NetworkQuiet;
  readonly guard: NetworkGuard;
  /** Requests the guard refused since the last drainTelemetry(). */
  readonly blocked: BlockedRequest[];
  /** Dialogs the page opened since the last drainTelemetry(); each is dismissed at once. */
  readonly dialogs: PageDialogRecord[];
}

export interface PlaywrightRunnerOptions {
  /** Playwright server reached through browser-relay (docker-compose.yml). */
  readonly wsEndpoint?: string;
  readonly actionTimeoutMs?: number;
}

/**
 * Drives the remote Playwright server that lives on janus-sbx (ADR 0005): one BrowserContext
 * per session. Each context also aborts every request outside the variant's origin, on top of
 * the network having no internet route.
 */
export class PlaywrightRunner implements BrowserPort {
  private browser: Browser | undefined;
  private readonly sessions = new Map<string, Session>();
  private nextId = 1;
  private script: string | undefined;
  private readonly wsEndpoint: string;
  private readonly actionTimeoutMs: number;

  constructor(options: PlaywrightRunnerOptions = {}) {
    this.wsEndpoint = options.wsEndpoint ?? process.env.JANUS_BROWSER_WS ?? 'ws://127.0.0.1:53000/';
    this.actionTimeoutMs = options.actionTimeoutMs ?? 5_000;
  }

  async newSession(options: BrowserSessionOptions): Promise<string> {
    const guard = NetworkGuard.forOrigin('variant', options.baseUrl);
    const blocked: BlockedRequest[] = [];
    this.browser ??= await chromium.connect(this.wsEndpoint);
    const context = await this.browser.newContext({
      locale: 'es-ES',
      ...(options.device === 'mobile' ? MOBILE_CONTEXT : {}),
    });
    await context.route('**/*', (route) => {
      const request = {
        method: route.request().method(),
        url: route.request().url(),
        testType: 'browse',
      } as const;
      const decision = guard.check(request);
      if (decision.allowed) return route.continue();
      blocked.push(guard.describe(request, decision.reason));
      return route.abort('blockedbyclient');
    });
    await context.addInitScript({ content: (this.script ??= instrumentationScript()) });
    const page = await context.newPage();
    page.setDefaultTimeout(this.actionTimeoutMs);
    const errors = watchPageErrors(page);
    const dialogs: PageDialogRecord[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push({
        kind: dialog.type(),
        message: dialog.message().slice(0, 200),
        url: page.url(),
      });
      void dialog.dismiss().catch(() => undefined);
    });
    const network = new NetworkQuiet(page);
    const id = `pw-${String(this.nextId++)}`;
    this.sessions.set(id, { context, page, errors, network, guard, blocked, dialogs });
    return id;
  }

  async goto(sessionId: string, url: string): Promise<void> {
    const session = this.session(sessionId);
    // Checked here too, so an off-scope navigation fails the same way as in the fakes.
    const request = { method: 'GET', url, testType: 'browse' } as const;
    const decision = session.guard.check(request);
    if (!decision.allowed) {
      const blocked = session.guard.describe(request, decision.reason);
      session.blocked.push(blocked);
      throw new ScopeBlockedError(blocked);
    }
    await session.page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async click(sessionId: string, target: ElementTarget): Promise<void> {
    const locator = await this.visible(sessionId, target);
    await this.acting(sessionId, target, () => locator.click());
  }

  async type(
    sessionId: string,
    target: ElementTarget,
    text: string,
    options: TypeOptions = {},
  ): Promise<void> {
    const locator = await this.visible(sessionId, target);
    await this.acting(sessionId, target, async () => {
      await locator.fill(text);
      if (options.submit === true) await locator.press('Enter');
    });
  }

  async select(sessionId: string, target: ElementTarget, option: string): Promise<void> {
    const locator = await this.visible(sessionId, target);
    // Checked up front: selectOption would otherwise keep waiting for the option to appear.
    const labels = (await locator.locator('option').allInnerTexts()).map((label) => label.trim());
    if (labels.length > 0 && !labels.includes(option)) {
      throw new OptionNotFoundError(target, option, this.session(sessionId).page.url());
    }
    await this.acting(sessionId, target, () => locator.selectOption({ label: option }));
  }

  async locate(sessionId: string, target: ElementTarget): Promise<ElementBox> {
    const locator = await this.visible(sessionId, target);
    const box = await locator.boundingBox();
    if (box === null) throw new ElementNotFoundError(target, this.session(sessionId).page.url());
    return box;
  }

  async scroll(sessionId: string, direction: 'up' | 'down'): Promise<void> {
    const { page } = this.session(sessionId);
    const step = (page.viewportSize() ?? DEFAULT_VIEWPORT).height * 0.8;
    const dy = Math.round(direction === 'down' ? step : -step);
    // A string expression: the orchestrator has no DOM types. `dy` is a number we computed.
    await page.evaluate(`window.scrollBy({ top: ${String(dy)}, behavior: 'instant' })`);
  }

  async dismiss(sessionId: string): Promise<void> {
    await this.session(sessionId).page.keyboard.press('Escape');
  }

  async back(sessionId: string): Promise<void> {
    await this.session(sessionId).page.goBack({ waitUntil: 'domcontentloaded' });
  }

  async waitForUrl(sessionId: string, pattern: RegExp): Promise<void> {
    const { page } = this.session(sessionId);
    try {
      await page.waitForURL(pattern, { waitUntil: 'domcontentloaded' });
    } catch (error) {
      if (error instanceof errors.TimeoutError) {
        throw new NavigationTimeoutError(pattern.source, page.url());
      }
      throw error;
    }
  }

  async snapshot(sessionId: string): Promise<PageSnapshot> {
    const { page } = this.session(sessionId);
    const body = page.locator('body');
    const passwords = page.locator('input[type="password"]');
    const secrets = await Promise.all(
      Array.from({ length: await passwords.count() }, (_, index) =>
        passwords.nth(index).inputValue(),
      ),
    );
    const tree: unknown = await body.ariaSnapshotJSON({ mode: 'ai', boxes: true });
    return maskSecrets<PageSnapshot>(
      {
        url: page.url(),
        title: await page.title(),
        aria: await body.ariaSnapshot(),
        tree,
        viewport: page.viewportSize() ?? DEFAULT_VIEWPORT,
      },
      secrets,
    );
  }

  async settle(sessionId: string): Promise<void> {
    const { page, network } = this.session(sessionId);
    const deadline = performance.now() + SETTLE_MAX_MS;
    // Requests a click starts (a form submission, a redirect) begin a moment after it returns.
    await page.waitForTimeout(SETTLE_POLL_MS);
    while (!network.isQuiet(SETTLE_QUIET_MS) && performance.now() < deadline) {
      await page.waitForTimeout(SETTLE_POLL_MS);
    }
    try {
      await page.waitForLoadState('load', {
        timeout: Math.max(1, Math.min(SETTLE_LOAD_MS, deadline - performance.now())),
      });
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;
    }
  }

  async pageActivity(sessionId: string): Promise<PageActivity> {
    const state = await this.instrumentation(sessionId);
    return state === null
      ? { documentId: 'uninstrumented', mutations: 0 }
      : { documentId: state.doc, mutations: state.mutations };
  }

  async drainTelemetry(sessionId: string): Promise<PageTelemetry> {
    const { page, errors, blocked, dialogs } = this.session(sessionId);
    const drained = errors.splice(0);
    const vitals = (await this.instrumentation(sessionId))?.vitals ?? {};
    const measured = Object.values(vitals).some((value) => value !== undefined);
    return {
      errors: drained,
      vitals: measured ? { url: page.url(), ...vitals } : null,
      blocked: blocked.splice(0),
      dialogs: dialogs.splice(0),
    };
  }

  async screenshot(sessionId: string): Promise<Uint8Array> {
    // Password fields render as dots in the page itself, so nothing secret is captured.
    return new Uint8Array(await this.session(sessionId).page.screenshot({ type: 'png' }));
  }

  async fetchText(
    sessionId: string,
    path: string,
    options: FetchTextOptions = {},
  ): Promise<{ status: number; body: string }> {
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new Error(`fetchText only takes a path on the variant, not ${path}`);
    }
    const { context, page } = this.session(sessionId);
    const url = new URL(path, page.url()).toString();
    let headers: Record<string, string> = {};
    if (options.bearerFromCookie !== undefined) {
      const token = (await context.cookies(url)).find(
        (cookie) => cookie.name === options.bearerFromCookie,
      )?.value;
      if (token !== undefined && token !== '') headers = { authorization: `Bearer ${token}` };
    }
    const response = await context.request.get(url, { maxRedirects: 0, headers });
    return { status: response.status(), body: await response.text() };
  }

  async close(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) return;
    this.sessions.delete(sessionId);
    await session.context.close();
  }

  /** Closes every session and the connection to the remote browser. */
  async shutdown(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.close(id)));
    await this.browser?.close();
    this.browser = undefined;
  }

  private async instrumentation(sessionId: string) {
    const { page } = this.session(sessionId);
    try {
      return parseInstrumentation(await page.evaluate(READ_INSTRUMENTATION));
    } catch {
      // The page was navigating; the next step reads it again.
      return null;
    }
  }

  private session(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (session === undefined) throw new BrowserSessionNotFoundError(sessionId);
    return session;
  }

  private async visible(sessionId: string, target: ElementTarget): Promise<Locator> {
    const { page } = this.session(sessionId);
    const locator =
      'label' in target
        ? page.getByLabel(target.label, { exact: true }).first()
        : page
            .getByRole(target.role as AriaRole, { name: target.name, exact: true })
            .nth(target.nth ?? 0);
    try {
      await locator.waitFor({ state: 'visible' });
    } catch (error) {
      if (error instanceof errors.TimeoutError) throw new ElementNotFoundError(target, page.url());
      throw error;
    }
    return locator;
  }

  /** Runs an action on a visible element, turning Playwright's timeouts into domain errors. */
  private async acting(
    sessionId: string,
    target: ElementTarget,
    action: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await action();
    } catch (error) {
      if (!(error instanceof errors.TimeoutError)) throw error;
      const url = this.session(sessionId).page.url();
      switch (actionFailureOf(error.message)) {
        case 'obscured':
          throw new ElementObscuredError(target, url);
        case 'disabled':
          throw new ElementDisabledError(target, url);
        case 'not-found':
          throw new ElementNotFoundError(target, url);
      }
    }
  }
}
