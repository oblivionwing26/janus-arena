import { describe, expect, it } from 'vitest';

import { instrumentationScript, isOwnBlock, parseInstrumentation } from './page-instrumentation.js';

describe('page instrumentation', () => {
  it('embeds web-vitals and the mutation counter in one script', () => {
    const script = instrumentationScript();

    expect(script).toContain('var webVitals=');
    expect(script).toContain('new MutationObserver');
    expect(script).toContain('webVitals.onINP');
  });

  it('parses what the page reports, and nothing when the script did not run', () => {
    expect(
      parseInstrumentation(JSON.stringify({ doc: 'a1', mutations: 4, vitals: { lcpMs: 900 } })),
    ).toEqual({ doc: 'a1', mutations: 4, vitals: { lcpMs: 900 } });
    expect(parseInstrumentation(null)).toBeNull();
    expect(
      parseInstrumentation(JSON.stringify({ doc: 'a1', mutations: -1, vitals: {} })),
    ).toBeNull();
  });

  it('recognises errors caused by our own origin filter', () => {
    expect(isOwnBlock('Failed to load resource: net::ERR_BLOCKED_BY_CLIENT')).toBe(true);
    expect(isOwnBlock('Failed to load resource: the server responded with a status of 500')).toBe(
      false,
    );
  });
});
