import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

import { z } from 'zod';

// The web-vitals IIFE build defines a global `webVitals`. The sandbox browser has no internet,
// so the library is read from node_modules and injected as text (F1.6).
function webVitalsSource(): string {
  const entry = createRequire(import.meta.url).resolve('web-vitals');
  return readFileSync(join(dirname(entry), 'web-vitals.iife.js'), 'utf8');
}

/**
 * Runs in every document before the page's own scripts: counts DOM mutations (for dead
 * clicks) and keeps the latest LCP, CLS and INP. State lives on `window.__janus`, with an id
 * per document so a navigation is never mistaken for "no change".
 */
export function instrumentationScript(): string {
  return `(() => {
  if (window.__janus) return;
  const state = { doc: Math.random().toString(36).slice(2), mutations: 0, vitals: {} };
  window.__janus = state;
  new MutationObserver((records) => { state.mutations += records.length; }).observe(document, {
    subtree: true, childList: true, attributes: true, characterData: true,
  });
  ${webVitalsSource()}
  const all = { reportAllChanges: true };
  webVitals.onLCP((metric) => { state.vitals.lcpMs = metric.value; }, all);
  webVitals.onCLS((metric) => { state.vitals.cls = metric.value; }, all);
  webVitals.onINP((metric) => { state.vitals.inpMs = metric.value; }, all);
})();`;
}

/** Evaluated in the page (as a string: the orchestrator has no DOM types). */
export const READ_INSTRUMENTATION = 'window.__janus ? JSON.stringify(window.__janus) : null';

const stateSchema = z.object({
  doc: z.string(),
  mutations: z.int().min(0),
  vitals: z.object({
    lcpMs: z.number().min(0).optional(),
    cls: z.number().min(0).optional(),
    inpMs: z.number().min(0).optional(),
  }),
});

export type InstrumentationState = z.infer<typeof stateSchema>;

/** Parses what READ_INSTRUMENTATION returned; null when the script has not run in this page. */
export function parseInstrumentation(raw: unknown): InstrumentationState | null {
  if (typeof raw !== 'string') return null;
  const parsed = stateSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

/** Errors caused by our own origin filter (ADR 0005) are not the target's fault. */
export function isOwnBlock(text: string): boolean {
  return text.includes('ERR_BLOCKED_BY_CLIENT');
}
