import type { Page, Request } from 'playwright-core';

import type { PageRequestRecord } from '../../domain/browser/page-telemetry.js';

const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
/** Kept until the next drain; a page that loops on requests cannot grow it without bound. */
const MAX_KEPT = 500;
const MAX_PATH = 300;

/**
 * Collects a page's API requests (fetch and XHR) with how long each took, from the browser's own
 * timing (F3.5, V3): path, method, status and milliseconds, never the query, headers or body.
 */
export function watchApiRequests(page: Page): PageRequestRecord[] {
  const requests: PageRequestRecord[] = [];
  const record = async (request: Request, failed: boolean) => {
    const type = request.resourceType();
    const method = request.method().toUpperCase();
    if ((type !== 'fetch' && type !== 'xhr') || !METHODS.has(method)) return;
    if (requests.length >= MAX_KEPT) return;
    const { responseEnd } = request.timing();
    if (responseEnd < 0) return;
    const status = failed ? 0 : ((await request.response().catch(() => null))?.status() ?? 0);
    requests.push({
      method: method as PageRequestRecord['method'],
      path: new URL(request.url()).pathname.slice(0, MAX_PATH),
      status,
      ms: Math.round(responseEnd * 10) / 10,
    });
  };
  page.on('requestfinished', (request) => void record(request, false));
  page.on('requestfailed', (request) => void record(request, true));
  return requests;
}
