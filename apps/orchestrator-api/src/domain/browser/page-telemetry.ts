import type { BlockedRequest } from '../scope/network-guard.js';

/** Mutations counted in the current document; `documentId` changes when the page navigates. */
export interface PageActivity {
  readonly documentId: string;
  readonly mutations: number;
}

/** What went wrong technically on the page since the last drain (F1.6). */
export interface PageErrorRecord {
  readonly kind: 'console' | 'http' | 'timeout';
  readonly url: string;
  readonly status?: number;
  readonly message: string;
}

/** The latest Core Web Vitals of the current document, as far as the browser measured them. */
export interface PageVitalsRecord {
  readonly url: string;
  readonly lcpMs?: number | undefined;
  readonly cls?: number | undefined;
  readonly inpMs?: number | undefined;
}

/** A dialog the page opened (alert, confirm, prompt...); dismissed at once (F3.2). */
export interface PageDialogRecord {
  readonly kind: string;
  /** At most 200 characters. */
  readonly message: string;
  readonly url: string;
}

export interface PageTelemetry {
  readonly errors: readonly PageErrorRecord[];
  readonly vitals: PageVitalsRecord | null;
  /** Requests the network guard refused since the last drain (F3.1); absent on old tapes. */
  readonly blocked?: readonly BlockedRequest[];
  /** Dialogs since the last drain, for the XSS oracle (F3.2); absent on old tapes. */
  readonly dialogs?: readonly PageDialogRecord[];
}
