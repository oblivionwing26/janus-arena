import { chromium, type Browser, type BrowserContext } from 'playwright-core';

import type { BlockedRequest, NetworkGuard } from '../../domain/scope/network-guard.js';
import type {
  ScopedHttpClient,
  ScopedHttpPort,
  ScopedReply,
  ScopedRequest,
} from '../../domain/scope/scoped-http-port.js';
import { guard } from './fetch-scoped-http.js';

const MAX_BODY = 1_000_000;
const TIMEOUT_MS = 10_000;

/**
 * HTTP to sandboxed targets (F3.1). The orchestrator has no route into the internal janus-sbx
 * network (ADR 0005), so requests are sent by the Playwright server that lives there, through a
 * browser context's request API (no page, no cookies shared with agent sessions). The guard
 * decides every request before it leaves; redirects are never followed.
 */
export class PlaywrightScopedHttp implements ScopedHttpPort {
  private browser: Browser | undefined;
  private context: Promise<BrowserContext> | undefined;

  constructor(
    private readonly wsEndpoint = process.env.JANUS_BROWSER_WS ?? 'ws://127.0.0.1:53000/',
  ) {}

  client(
    networkGuard: NetworkGuard,
    onBlocked: (blocked: BlockedRequest) => Promise<void>,
  ): ScopedHttpClient {
    return {
      send: async (request: ScopedRequest): Promise<ScopedReply> => {
        await guard(networkGuard, onBlocked, request);
        const context = await this.requestContext();
        const response = await context.request.fetch(request.url, {
          method: request.method,
          maxRedirects: 0,
          failOnStatusCode: false,
          timeout: TIMEOUT_MS,
          ...(request.headers === undefined ? {} : { headers: { ...request.headers } }),
          ...(request.body === undefined ? {} : { data: request.body }),
        });
        const body = (await response.text()).slice(0, MAX_BODY);
        await response.dispose();
        return { status: response.status(), headers: response.headers(), body };
      },
    };
  }

  async close(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
    this.context = undefined;
  }

  private requestContext(): Promise<BrowserContext> {
    this.context ??= (async () => {
      this.browser ??= await chromium.connect(this.wsEndpoint);
      return this.browser.newContext();
    })();
    return this.context;
  }
}
