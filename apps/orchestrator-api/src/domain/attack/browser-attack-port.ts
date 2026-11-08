import type { BlockReason } from '@janus/shared-kernel';

import type { PageDialogRecord } from '../browser/page-telemetry.js';

/** Where the page reflects a value a visitor types: a URL with a `{payload}` slot (F3.3). */
export interface InjectionPoint {
  /** An absolute URL on the target with `{payload}` where the typed value appeared. */
  readonly template: string;
  /** The field the value was typed into, as the browser named it (for the record). */
  readonly field: string;
}

/** What a visit to a URL showed: the dialogs the page opened, or that the guard blocked it. */
export interface BrowserVisit {
  /** Why the guard refused the navigation; null when the page loaded. */
  readonly blocked: BlockReason | null;
  /** Status of the page's document; null when it did not load. */
  readonly status: number | null;
  readonly dialogs: readonly PageDialogRecord[];
}

/**
 * The browser side of the Red Team (F3.3, ADR 0011), kept apart from SynthLab's BrowserPort.
 * It finds where the target reflects typed input, by typing a harmless probe into each text
 * field and seeing whether it comes back in the URL, and visits URLs while recording the
 * dialogs that open. Every request goes through a guard for the target's origin. Every adapter
 * must pass src/test-support/browser-attack-contract.ts.
 */
export interface BrowserAttackPort {
  discover(origin: string, probe: string): Promise<readonly InjectionPoint[]>;
  /** Visits `url`; anything outside the target's `origin` is blocked. */
  visit(origin: string, url: string): Promise<BrowserVisit>;
}
