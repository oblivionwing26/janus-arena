// Records every BrowserPort call of a real session (method, result or domain error) and replays
// them in order, so a recorded navigator session can run again with no browser, no sandbox
// and no network. Used by the F1.4 recording and replay tests. Not part of the build.

import { DomainError } from '../domain/errors/domain-error.js';
import type {
  BrowserPort,
  BrowserSessionOptions,
  ElementBox,
  ElementTarget,
  PageSnapshot,
} from '../domain/browser/browser-port.js';
import type { PageActivity, PageTelemetry } from '../domain/browser/page-telemetry.js';

const EMPTY_PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface TapeEntry {
  readonly method: keyof BrowserPort;
  readonly result?: unknown;
  readonly error?: { readonly code: string; readonly message: string };
}

/** A domain error coming back from a tape: same code and message as the recorded one. */
export class ReplayedBrowserError extends DomainError {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class RecordingBrowser implements BrowserPort {
  readonly tape: TapeEntry[] = [];

  constructor(private readonly inner: BrowserPort) {}

  newSession(options: BrowserSessionOptions): Promise<string> {
    return this.call('newSession', () => this.inner.newSession(options));
  }
  goto(sessionId: string, url: string): Promise<void> {
    return this.call('goto', () => this.inner.goto(sessionId, url));
  }
  click(sessionId: string, target: ElementTarget): Promise<void> {
    return this.call('click', () => this.inner.click(sessionId, target));
  }
  type(sessionId: string, target: ElementTarget, text: string): Promise<void> {
    return this.call('type', () => this.inner.type(sessionId, target, text));
  }
  select(sessionId: string, target: ElementTarget, option: string): Promise<void> {
    return this.call('select', () => this.inner.select(sessionId, target, option));
  }
  locate(sessionId: string, target: ElementTarget): Promise<ElementBox> {
    return this.call('locate', () => this.inner.locate(sessionId, target));
  }
  scroll(sessionId: string, direction: 'up' | 'down'): Promise<void> {
    return this.call('scroll', () => this.inner.scroll(sessionId, direction));
  }
  back(sessionId: string): Promise<void> {
    return this.call('back', () => this.inner.back(sessionId));
  }
  settle(sessionId: string): Promise<void> {
    return this.call('settle', () => this.inner.settle(sessionId));
  }
  fetchText(sessionId: string, path: string): Promise<{ status: number; body: string }> {
    return this.call('fetchText', () => this.inner.fetchText(sessionId, path));
  }
  pageActivity(sessionId: string): Promise<PageActivity> {
    return this.call('pageActivity', () => this.inner.pageActivity(sessionId));
  }
  drainTelemetry(sessionId: string): Promise<PageTelemetry> {
    return this.call('drainTelemetry', () => this.inner.drainTelemetry(sessionId));
  }
  screenshot(sessionId: string): Promise<Uint8Array> {
    // The image itself is not kept on the tape; a replay gets an empty PNG.
    return this.call('screenshot', async () => {
      await this.inner.screenshot(sessionId);
      return undefined;
    }).then(() => EMPTY_PNG);
  }
  waitForUrl(sessionId: string, pattern: RegExp): Promise<void> {
    return this.call('waitForUrl', () => this.inner.waitForUrl(sessionId, pattern));
  }
  snapshot(sessionId: string): Promise<PageSnapshot> {
    return this.call('snapshot', () => this.inner.snapshot(sessionId));
  }
  close(sessionId: string): Promise<void> {
    return this.call('close', () => this.inner.close(sessionId));
  }

  private async call<T>(method: keyof BrowserPort, run: () => Promise<T>): Promise<T> {
    try {
      const result = await run();
      this.tape.push(result === undefined ? { method } : { method, result });
      return result;
    } catch (error) {
      if (error instanceof DomainError) {
        this.tape.push({ method, error: { code: error.code, message: error.message } });
      }
      throw error;
    }
  }
}

export class ReplayingBrowser implements BrowserPort {
  private next = 0;

  constructor(private readonly tape: readonly TapeEntry[]) {}

  /** True once every recorded call has been replayed. */
  finished(): boolean {
    return this.next === this.tape.length;
  }

  newSession(): Promise<string> {
    return this.replay('newSession');
  }
  goto(): Promise<void> {
    return this.replay('goto');
  }
  click(): Promise<void> {
    return this.replay('click');
  }
  type(): Promise<void> {
    return this.replay('type');
  }
  select(): Promise<void> {
    return this.replay('select');
  }
  locate(): Promise<ElementBox> {
    return this.replay('locate');
  }
  scroll(): Promise<void> {
    return this.replay('scroll');
  }
  back(): Promise<void> {
    return this.replay('back');
  }
  settle(): Promise<void> {
    // Settling returns nothing and changes no decision; newer code settles more often.
    return this.optional('settle', undefined);
  }
  fetchText(): Promise<{ status: number; body: string }> {
    return this.replay('fetchText');
  }
  pageActivity(): Promise<PageActivity> {
    return this.optional('pageActivity', { documentId: 'replay', mutations: 0 });
  }
  drainTelemetry(): Promise<PageTelemetry> {
    return this.optional('drainTelemetry', { errors: [], vitals: null });
  }
  screenshot(): Promise<Uint8Array> {
    return this.optional('screenshot', undefined).then(() => EMPTY_PNG);
  }
  waitForUrl(): Promise<void> {
    return this.replay('waitForUrl');
  }
  snapshot(): Promise<PageSnapshot> {
    return this.replay('snapshot');
  }
  close(): Promise<void> {
    return this.replay('close');
  }

  /**
   * Telemetry (and settling) never changes what the agent decides, and tapes recorded before
   * F1.6 lack some of those calls:
   * replay it when it is on the tape, otherwise answer with a neutral value.
   */
  private optional<T>(method: keyof BrowserPort, fallback: T): Promise<T> {
    return this.tape[this.next]?.method === method
      ? this.replay<T>(method)
      : Promise.resolve(fallback);
  }

  private replay<T>(method: keyof BrowserPort): Promise<T> {
    const entry = this.tape[this.next];
    if (entry?.method !== method) {
      return Promise.reject(
        new Error(
          `Tape mismatch at call ${String(this.next)}: expected ${entry?.method ?? 'end'}, got ${method}`,
        ),
      );
    }
    this.next += 1;
    if (entry.error !== undefined) {
      return Promise.reject(new ReplayedBrowserError(entry.error.code, entry.error.message));
    }
    return Promise.resolve(entry.result as T);
  }
}
