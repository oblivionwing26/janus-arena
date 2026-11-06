import { describe, expect, it } from 'vitest';

import { actionFailureOf } from './action-failure.js';

// Excerpts of real Playwright call logs after an action timed out.
describe('actionFailureOf', () => {
  it('recognises an element covered by another one', () => {
    const log = `locator.click: Timeout 5000ms exceeded.
  - element is visible, enabled and stable
  - scrolling into view if needed
  - <div class="cookie-banner">…</div> intercepts pointer events
  - retrying click action`;
    expect(actionFailureOf(log)).toBe('obscured');
  });

  it('recognises a disabled element', () => {
    expect(actionFailureOf('locator.click: Timeout\n  - element is not enabled')).toBe('disabled');
    expect(actionFailureOf('locator.fill: Timeout\n  - element is not editable')).toBe('disabled');
  });

  it('treats anything else as an element that could not be found', () => {
    expect(actionFailureOf('locator.click: Timeout\n  - waiting for getByRole(…)')).toBe(
      'not-found',
    );
  });
});
