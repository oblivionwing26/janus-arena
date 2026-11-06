import { describe, expect, it } from 'vitest';

import { RunControl } from './run-control.js';

const RUN = '01JC0F17CTR0000000000000AA';
const limits = { maxTokens: 1000, maxEur: 1 };

describe('RunControl', () => {
  it('lets at most `concurrency` sessions of a run play at once', async () => {
    const control = new RunControl();
    control.register(RUN, limits, { concurrency: 2 });
    const order: string[] = [];

    const first = await control.acquire(RUN);
    const second = await control.acquire(RUN);
    const third = control.acquire(RUN).then((release) => {
      order.push('third plays');
      return release;
    });
    await Promise.resolve();
    expect(order).toEqual([]);

    order.push('first ends');
    first();
    (await third)();
    second();
    expect(order).toEqual(['first ends', 'third plays']);
  });

  it('does not limit runs without a concurrency, or unknown runs', async () => {
    const control = new RunControl();
    control.register(RUN, limits);

    const slots = await Promise.all([1, 2, 3].map(() => control.acquire(RUN)));
    expect(slots).toHaveLength(3);
    await expect(control.acquire('01JC0F17CTR0000000000000AB')).resolves.toBeTypeOf('function');
  });

  it('remembers the variants of a run, defaulting to a', () => {
    const control = new RunControl();
    control.register(RUN, limits, { variantKeys: ['a', 'b'] });

    expect(control.variantKeys(RUN)).toEqual(['a', 'b']);
    expect(control.variantKeys('01JC0F17CTR0000000000000AB')).toEqual(['a']);
  });
});
