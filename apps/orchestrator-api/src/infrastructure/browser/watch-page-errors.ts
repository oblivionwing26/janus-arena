import type { Page } from 'playwright-core';

import type { PageErrorRecord } from '../../domain/browser/page-telemetry.js';
import { isOwnBlock } from './page-instrumentation.js';

const MAX_MESSAGE = 500;

/**
 * Collects a page's technical errors (F1.6): console errors, uncaught exceptions, 4xx/5xx
 * responses and failed requests. What our own origin filter blocked is left out, and so are
 * requests aborted by a navigation.
 */
export function watchPageErrors(page: Page): PageErrorRecord[] {
  const errors: PageErrorRecord[] = [];
  const push = (record: PageErrorRecord) => {
    errors.push({ ...record, message: record.message.slice(0, MAX_MESSAGE) || record.kind });
  };
  page.on('console', (message) => {
    if (message.type() !== 'error' || isOwnBlock(message.text())) return;
    // The browser's echo of a failed response, already recorded by the response listener.
    if (message.text().startsWith('Failed to load resource:')) return;
    push({ kind: 'console', url: page.url(), message: message.text() });
  });
  page.on('pageerror', (error) => {
    push({ kind: 'console', url: page.url(), message: error.message });
  });
  page.on('response', (response) => {
    if (response.status() < 400) return;
    push({
      kind: 'http',
      url: response.url(),
      status: response.status(),
      message: response.statusText() || `HTTP ${String(response.status())}`,
    });
  });
  page.on('requestfailed', (request) => {
    const failure = request.failure()?.errorText ?? '';
    if (isOwnBlock(failure) || failure.includes('ERR_ABORTED')) return;
    push({
      kind: failure.includes('TIMED_OUT') ? 'timeout' : 'http',
      url: request.url(),
      message: failure,
    });
  });
  return errors;
}
