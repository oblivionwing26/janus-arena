import { EventEmitter } from 'node:events';

import type { Page } from 'playwright-core';
import { describe, expect, it } from 'vitest';

import { NetworkQuiet } from './network-quiet.js';

function fakePage() {
  const page = new EventEmitter();
  return { page, asPage: page as unknown as Page };
}

describe('NetworkQuiet', () => {
  it('is quiet only after every request ended and nothing moved for the quiet window', () => {
    let clock = 0;
    const { page, asPage } = fakePage();
    const quiet = new NetworkQuiet(asPage, () => clock);

    clock = 600;
    expect(quiet.isQuiet(500)).toBe(true);

    page.emit('request');
    page.emit('request');
    clock = 2000;
    expect(quiet.isQuiet(500)).toBe(false);

    page.emit('requestfinished');
    page.emit('requestfailed');
    clock = 2200;
    expect(quiet.isQuiet(500)).toBe(false);
    clock = 2500;
    expect(quiet.isQuiet(500)).toBe(true);
  });
});
