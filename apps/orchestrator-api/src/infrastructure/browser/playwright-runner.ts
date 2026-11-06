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
  ElementNotFoundError,
  NavigationTimeoutError,
} from '../../domain/browser/browser-errors.js';
import type {
  BrowserPort,
  BrowserSessionOptions,
  ElementTarget,
  PageSnapshot,
} from '../../domain/browser/browser-port.js';

type AriaRole = Parameters<Page['getByRole']>[0];

// Playwright's own default when a context sets no viewport.
const DEFAULT_VIEWPORT = { width: 1280, height: 720 };

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
    const context = await this.browser.newContext({ locale: 'es-ES' });
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
    await locator.click();
  }

  async type(sessionId: string, target: ElementTarget, text: string): Promise<void> {
    const locator = await this.visible(sessionId, target);
    await locator.fill(text);
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
    return {
      url: page.url(),
      title: await page.title(),
      aria: await body.ariaSnapshot(),
      tree: await body.ariaSnapshotJSON({ mode: 'ai', boxes: true }),
      viewport: page.viewportSize() ?? DEFAULT_VIEWPORT,
    };
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
        ? page.getByLabel(target.label, { exact: true })
        : page.getByRole(target.role as AriaRole, { name: target.name, exact: true });
    try {
      await locator.first().waitFor({ state: 'visible' });
    } catch (error) {
      if (error instanceof errors.TimeoutError) throw new ElementNotFoundError(target, page.url());
      throw error;
    }
    return locator.first();
  }
}
