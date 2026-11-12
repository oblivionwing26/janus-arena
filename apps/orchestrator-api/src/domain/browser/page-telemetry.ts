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

/** An API request the page made (fetch or XHR) and how long it took (F3.5, V3). */
export interface PageRequestRecord {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path only: never the query string. */
  readonly path: string;
  /** 0 when no response came. */
  readonly status: number;
  readonly ms: number;
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
  /** API requests since the last drain (F3.5); absent on old tapes. */
  readonly requests?: readonly PageRequestRecord[];
}
