// Shared contract suite for BrowserPort. The scripted fake runs it in `pnpm test`;
// PlaywrightRunner runs it against ShopLab in `pnpm test:sandbox`. Not part of the build.

import { describe, expect, it } from 'vitest';

import {
  BrowserSessionNotFoundError,
  ElementNotFoundError,
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

    it('rejects actions on a closed session and closes idempotently', async () => {
      const browser = harness.browser();
      const session = await browser.newSession({ baseUrl: harness.baseUrl() });
      await browser.close(session);

      await expect(browser.snapshot(session)).rejects.toBeInstanceOf(BrowserSessionNotFoundError);
      await expect(browser.close(session)).resolves.toBeUndefined();
    });
  });
}
