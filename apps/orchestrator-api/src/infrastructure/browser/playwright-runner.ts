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
  PageSnapshot,
} from '../../domain/browser/browser-port.js';
import { actionFailureOf } from './action-failure.js';
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
const SETTLE_IDLE_MS = 1_500;

interface Session {
  readonly context: BrowserContext;
  readonly page: Page;
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
  private readonly wsEndpoint: string;
  private readonly actionTimeoutMs: number;

  constructor(options: PlaywrightRunnerOptions = {}) {
    this.wsEndpoint = options.wsEndpoint ?? process.env.JANUS_BROWSER_WS ?? 'ws://127.0.0.1:53000/';
    this.actionTimeoutMs = options.actionTimeoutMs ?? 5_000;
  }

  async newSession(options: BrowserSessionOptions): Promise<string> {
    const origin = new URL(options.baseUrl).origin;
    this.browser ??= await chromium.connect(this.wsEndpoint);
    const context = await this.browser.newContext({
      locale: 'es-ES',
      ...(options.device === 'mobile' ? MOBILE_CONTEXT : {}),
    });
    await context.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin
        ? route.continue()
        : route.abort('blockedbyclient'),
    );
    const page = await context.newPage();
    page.setDefaultTimeout(this.actionTimeoutMs);
    const id = `pw-${String(this.nextId++)}`;
    this.sessions.set(id, { context, page });
    return id;
  }

  async goto(sessionId: string, url: string): Promise<void> {
    await this.session(sessionId).page.goto(url, { waitUntil: 'domcontentloaded' });
  }

  async click(sessionId: string, target: ElementTarget): Promise<void> {
    const locator = await this.visible(sessionId, target);
    await this.acting(sessionId, target, () => locator.click());
  }

  async type(sessionId: string, target: ElementTarget, text: string): Promise<void> {
    const locator = await this.visible(sessionId, target);
    await this.acting(sessionId, target, () => locator.fill(text));
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
    const { page } = this.session(sessionId);
    for (const [state, timeout] of [
      ['load', SETTLE_LOAD_MS],
      ['networkidle', SETTLE_IDLE_MS],
    ] as const) {
      try {
        await page.waitForLoadState(state, { timeout });
      } catch (error) {
        if (!(error instanceof errors.TimeoutError)) throw error;
      }
    }
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
