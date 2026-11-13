import type { PageActivity, PageTelemetry } from './page-telemetry.js';

/**
 * An element chosen the way a person (or the accessibility tree) sees it, never by CSS:
 * by ARIA role and accessible name, or by the text of its form label. Matching is exact.
 * `nth` picks among elements with the same role and name (0 = the first, the default).
 */
export type ElementTarget =
  | { readonly role: string; readonly name: string; readonly nth?: number }
  | { readonly label: string };

/** Viewport-relative position and size in CSS pixels. */
export interface ElementBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PageSnapshot {
  readonly url: string;
  readonly title: string;
  /** Accessibility tree of the page as YAML (Playwright aria snapshot format). */
  readonly aria: string;
  /**
   * The same tree as JSON nodes with roles, names, states and viewport-relative boxes
   * (Playwright `ariaSnapshotJSON`, AI mode). Raw data: @janus/observation-builder validates it.
   */
  readonly tree: unknown;
  readonly viewport: { readonly width: number; readonly height: number };
}

export interface TypeOptions {
  /** Press Enter after typing (F3.5a): fields that act only on Enter, like a search box. */
  readonly submit?: boolean;
}

export interface FetchTextOptions {
  /** The session cookie holding the token to send as a bearer header. */
  readonly bearerFromCookie?: string;
}

export interface BrowserSessionOptions {
  /**
   * The variant under test. Every request goes through a browse-only NetworkGuard for its
   * origin (F3.1): anything else is blocked and reported in drainTelemetry().
   */
  readonly baseUrl: string;
  /** `mobile` gets a phone-sized touch viewport. Defaults to desktop. */
  readonly device?: 'desktop' | 'mobile';
  /**
   * The address the session presents, sent as X-Forwarded-For on every request (F4.1). A
   * simulation: a target that trusts the header sees a visitor of its own in each session.
   */
  readonly clientIp?: string;
}

/**
 * One isolated browser context per agent session. Every adapter must pass
 * src/test-support/browser-contract.ts.
 */
export interface BrowserPort {
  newSession(options: BrowserSessionOptions): Promise<string>;
  /** ScopeBlockedError, reported in drainTelemetry(), when the URL is outside the variant. */
  goto(sessionId: string, url: string): Promise<void>;
  click(sessionId: string, target: ElementTarget): Promise<void>;
  type(
    sessionId: string,
    target: ElementTarget,
    text: string,
    options?: TypeOptions,
  ): Promise<void>;
  /** Picks the option whose label is `option`; OptionNotFoundError if there is none. */
  select(sessionId: string, target: ElementTarget, option: string): Promise<void>;
  /** Waits until the element is visible and returns where it is. */
  locate(sessionId: string, target: ElementTarget): Promise<ElementBox>;
  /** Scrolls the page by most of one viewport. */
  scroll(sessionId: string, direction: 'up' | 'down'): Promise<void>;
  /** Goes back one entry in the session history. */
  back(sessionId: string): Promise<void>;
  /** Presses Esc, which closes an open menu, dialog or pop-up (F3.5a). */
  dismiss(sessionId: string): Promise<void>;
  /**
   * Waits, for a short bounded time, until the page has finished loading after an action.
   * Never fails because the page is slow: the agent then sees it as it is.
   */
  settle(sessionId: string): Promise<void>;
  /** Mutations counted so far in the current document (F1.6). */
  pageActivity(sessionId: string): Promise<PageActivity>;
  /** Errors since the last call, and the latest vitals of the current document. */
  drainTelemetry(sessionId: string): Promise<PageTelemetry>;
  /** PNG of the visible viewport, after secrets were masked in the page. */
  screenshot(sessionId: string): Promise<Uint8Array>;
  /**
   * GET of a path on the variant (F1.9 oracle), with the session's cookies: what the signed-in
   * shopper would get. Read-only and same-origin; absolute URLs are refused. With
   * `bearerFromCookie`, the value of that session cookie is also sent as `Authorization: Bearer`,
   * for targets whose API reads the session token only from that header (Juice Shop, F3.5a).
   */
  fetchText(
    sessionId: string,
    path: string,
    options?: FetchTextOptions,
  ): Promise<{ status: number; body: string }>;
  /** Waits until the page URL matches, e.g. after a click that navigates. */
  waitForUrl(sessionId: string, pattern: RegExp): Promise<void>;
  snapshot(sessionId: string): Promise<PageSnapshot>;
  /** Closes the session. Safe to call more than once. */
  close(sessionId: string): Promise<void>;
}

export const BROWSER_PORT = Symbol('BrowserPort');

export function describeTarget(target: ElementTarget): string {
  if ('label' in target) return `label=${JSON.stringify(target.label)}`;
  const nth = target.nth === undefined || target.nth === 0 ? '' : ` nth=${String(target.nth)}`;
  return `role=${target.role}[name=${JSON.stringify(target.name)}]${nth}`;
}
