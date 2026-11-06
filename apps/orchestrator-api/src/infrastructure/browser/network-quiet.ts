import type { Page } from 'playwright-core';

/**
 * Tracks a page's requests in flight, so settle() can wait for the network to go quiet after
 * an action. Playwright's `networkidle` load state is reached once per document and resolves
 * at once afterwards, so it never waits for the fetch a form submission starts.
 */
export class NetworkQuiet {
  private inFlight = 0;
  private lastChange: number;

  constructor(
    page: Page,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.lastChange = now();
    const done = () => {
      this.inFlight = Math.max(0, this.inFlight - 1);
      this.lastChange = this.now();
    };
    page.on('request', () => {
      this.inFlight += 1;
      this.lastChange = this.now();
    });
    page.on('requestfinished', done);
    page.on('requestfailed', done);
  }

  /** True when nothing is in flight and nothing started or ended for `quietMs`. */
  isQuiet(quietMs: number): boolean {
    return this.inFlight === 0 && this.now() - this.lastChange >= quietMs;
  }
}
