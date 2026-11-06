/**
 * An element chosen the way a person (or the accessibility tree) sees it, never by CSS:
 * by ARIA role and accessible name, or by the text of its form label. Matching is exact.
 */
export type ElementTarget =
  { readonly role: string; readonly name: string } | { readonly label: string };

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

export interface BrowserSessionOptions {
  /** The variant under test. Requests to any other origin are blocked. */
  readonly baseUrl: string;
}

/**
 * One isolated browser context per agent session. Every adapter must pass
 * src/test-support/browser-contract.ts.
 */
export interface BrowserPort {
  newSession(options: BrowserSessionOptions): Promise<string>;
  goto(sessionId: string, url: string): Promise<void>;
  click(sessionId: string, target: ElementTarget): Promise<void>;
  type(sessionId: string, target: ElementTarget, text: string): Promise<void>;
  /** Waits until the page URL matches, e.g. after a click that navigates. */
  waitForUrl(sessionId: string, pattern: RegExp): Promise<void>;
  snapshot(sessionId: string): Promise<PageSnapshot>;
  /** Closes the session. Safe to call more than once. */
  close(sessionId: string): Promise<void>;
}

export const BROWSER_PORT = Symbol('BrowserPort');

export function describeTarget(target: ElementTarget): string {
  return 'label' in target
    ? `label=${JSON.stringify(target.label)}`
    : `role=${target.role}[name=${JSON.stringify(target.name)}]`;
}
