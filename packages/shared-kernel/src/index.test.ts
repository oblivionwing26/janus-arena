import { describe, expect, it } from 'vitest';

import { SHARED_KERNEL_PACKAGE } from './index.js';

describe('shared-kernel entry point', () => {
  it('exposes its package name', () => {
    expect(SHARED_KERNEL_PACKAGE).toBe('@janus/shared-kernel');
  });
});
