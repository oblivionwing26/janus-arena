// Shared contract suite for BrowserPort. The scripted fake runs it in `pnpm test`;
// PlaywrightRunner runs it against ShopLab in `pnpm test:sandbox`. Not part of the build.

import { describe, expect, it } from 'vitest';

import {
  BrowserSessionNotFoundError,
  ElementNotFoundError,
  OptionNotFoundError,
} from '../domain/browser/browser-errors.js';
import type { BrowserPort, ElementTarget } from '../domain/browser/browser-port.js';

export interface BrowserContractHarness {
  readonly browser: () => BrowserPort;
  readonly baseUrl: () => string;
  /** A page on baseUrl that has `field` (a labelled input) and `link`. */
  readonly page: string;
  readonly field: ElementTarget;
  readonly link: ElementTarget;
  /** Where clicking `link` leads. */
  readonly linkTarget: RegExp;
  /** A password field on `page`. */
  readonly secret: ElementTarget;
  /** A page with a select (`target`) that has an option labelled `option`. */
  readonly choice: {
    /** Whatever the page needs first, e.g. signing in. */
    readonly prepare?: (browser: BrowserPort, session: string) => Promise<void>;
    readonly page: string;
    readonly target: ElementTarget;
    readonly option: string;
  };
}

export function describeBrowserContract(name: string, harness: BrowserContractHarness): void {
  describe(`BrowserPort contract: ${name}`, () => {
    it('gives every session its own id', async () => {
      const browser = harness.browser();
      const a = await browser.newSession({ baseUrl: harness.baseUrl() });
      const b = await browser.newSession({ baseUrl: harness.baseUrl() });

      expect(a).not.toBe(b);
      await browser.close(a);
      await browser.close(b);
    });

    it('navigates, types, clicks and reports the current page', async () => {
      const browser = harness.browser();
      const session = await browser.newSession({ baseUrl: harness.baseUrl() });
      try {
        await browser.goto(session, `${harness.baseUrl()}${harness.page}`);
        await browser.type(session, harness.field, 'contract@janus.test');
        const before = await browser.snapshot(session);
        expect(new URL(before.url).pathname).toBe(harness.page);
        expect(before.aria.length).toBeGreaterThan(0);
        expect(Array.isArray(before.tree)).toBe(true);
        expect(before.tree).not.toEqual([]);
        expect(before.viewport.width).toBeGreaterThan(0);

        await browser.click(session, harness.link);
        await browser.waitForUrl(session, harness.linkTarget);
        expect((await browser.snapshot(session)).url).toMatch(harness.linkTarget);
      } finally {
        await browser.close(session);
      }
    });

    it('fails clearly when an element is missing', async () => {
      const browser = harness.browser();
      const session = await browser.newSession({ baseUrl: harness.baseUrl() });
      try {
        await browser.goto(session, `${harness.baseUrl()}${harness.page}`);
        await expect(
          browser.click(session, { role: 'button', name: 'No such button 7f3a' }),
        ).rejects.toBeInstanceOf(ElementNotFoundError);
      } finally {
        await browser.close(session);
      }
    });

    it('locates a visible element and counts nth among equals', async () => {
      const browser = harness.browser();
      const session = await browser.newSession({ baseUrl: harness.baseUrl() });
      try {
        await browser.goto(session, `${harness.baseUrl()}${harness.page}`);
        const box = await browser.locate(session, harness.field);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);

        if ('label' in harness.link) throw new Error('the contract link must be a role target');
        await expect(browser.locate(session, { ...harness.link, nth: 0 })).resolves.toBeDefined();
        await expect(browser.locate(session, { ...harness.link, nth: 9 })).rejects.toBeInstanceOf(
          ElementNotFoundError,
        );
      } finally {
        await browser.close(session);
      }
    });

    it('selects an option by its label and rejects a missing one', async () => {
      const browser = harness.browser();
      const session = await browser.newSession({ baseUrl: harness.baseUrl() });
      const { prepare, page, target, option } = harness.choice;
      try {
        await prepare?.(browser, session);
        await browser.goto(session, `${harness.baseUrl()}${page}`);
        await browser.select(session, target, option);
        await expect(browser.select(session, target, 'No such option 7f3a')).rejects.toBeInstanceOf(
          OptionNotFoundError,
        );
      } finally {
        await browser.close(session);
      }
    });

    it('goes back in history and scrolls without leaving the page', async () => {
      const browser = harness.browser();
      const session = await browser.newSession({ baseUrl: harness.baseUrl() });
      try {
        await browser.goto(session, `${harness.baseUrl()}${harness.page}`);
        await browser.click(session, harness.link);
        await browser.waitForUrl(session, harness.linkTarget);
        await browser.back(session);
        await browser.waitForUrl(session, new RegExp(`${harness.page}$`));

        await browser.scroll(session, 'down');
        await browser.scroll(session, 'up');
        expect(new URL((await browser.snapshot(session)).url).pathname).toBe(harness.page);
      } finally {
        await browser.close(session);
      }
    });

    it('never shows what was typed into a password field', async () => {
      const browser = harness.browser();
      const session = await browser.newSession({ baseUrl: harness.baseUrl() });
      try {
        await browser.goto(session, `${harness.baseUrl()}${harness.page}`);
        await browser.type(session, harness.secret, 'contract-secret-9f2c');
        await browser.settle(session);
        const snapshot = await browser.snapshot(session);

        expect(JSON.stringify(snapshot.tree)).not.toContain('contract-secret-9f2c');
        expect(snapshot.aria).not.toContain('contract-secret-9f2c');
      } finally {
        await browser.close(session);
      }
    });

    it('counts DOM activity per document and drains telemetry once', async () => {
      const browser = harness.browser();
      const session = await browser.newSession({ baseUrl: harness.baseUrl() });
      try {
        await browser.goto(session, `${harness.baseUrl()}${harness.page}`);
        await browser.settle(session);
        const before = await browser.pageActivity(session);
        expect(Number.isInteger(before.mutations) && before.mutations >= 0).toBe(true);

        // A full page load is a new document. (A client-side navigation, as in Next.js, keeps
        // the document: dead-click detection compares URLs for that reason.)
        await browser.goto(session, `${harness.baseUrl()}${harness.page}`);
        await browser.settle(session);
        expect((await browser.pageActivity(session)).documentId).not.toBe(before.documentId);

        const first = await browser.drainTelemetry(session);
        expect(Array.isArray(first.errors)).toBe(true);
        expect((await browser.drainTelemetry(session)).errors).toEqual([]);
      } finally {
        await browser.close(session);
      }
    });

    it('takes a PNG screenshot of the page', async () => {
      const browser = harness.browser();
      const session = await browser.newSession({ baseUrl: harness.baseUrl() });
      try {
        await browser.goto(session, `${harness.baseUrl()}${harness.page}`);
        const png = await browser.screenshot(session);
        expect([...png.slice(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
      } finally {
        await browser.close(session);
      }
    });

    it('gives mobile sessions a phone-sized viewport', async () => {
      const browser = harness.browser();
      const session = await browser.newSession({ baseUrl: harness.baseUrl(), device: 'mobile' });
      try {
        await browser.goto(session, `${harness.baseUrl()}${harness.page}`);
        const { viewport } = await browser.snapshot(session);
        expect(viewport.width).toBeLessThan(500);
        expect(viewport.height).toBeGreaterThan(viewport.width);
      } finally {
        await browser.close(session);
      }
    });

    it('rejects actions on a closed session and closes idempotently', async () => {
      const browser = harness.browser();
      const session = await browser.newSession({ baseUrl: harness.baseUrl() });
      await browser.close(session);

      await expect(browser.snapshot(session)).rejects.toBeInstanceOf(BrowserSessionNotFoundError);
      await expect(browser.close(session)).resolves.toBeUndefined();
    });
  });
}
