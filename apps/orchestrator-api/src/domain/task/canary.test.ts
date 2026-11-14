import { describe, expect, it } from 'vitest';

import { canaryFor, foreignCanaries } from './canary.js';

const RUN = '01JC0F28CNS0000000000000AA';

describe('canaryFor (F4.1)', () => {
  it('is a code of its own per session, stable for the same run and session', () => {
    const one = canaryFor(RUN, 'carmen-a-s1-a1');

    expect(one).toMatch(/^CNR-[A-Z0-9]{6}$/);
    expect(canaryFor(RUN, 'carmen-a-s1-a1')).toBe(one);
    expect(canaryFor(RUN, 'carmen-b-s1-a1')).not.toBe(one);
    expect(canaryFor('01JC0F28CNS0000000000000BB', 'carmen-a-s1-a1')).not.toBe(one);
  });
});

describe('foreignCanaries (F4.1)', () => {
  const mine = canaryFor(RUN, 'me');
  const theirs = canaryFor(RUN, 'someone-else');

  it('finds nothing when every order carries only its own canary, or none', () => {
    expect(
      foreignCanaries(
        [
          { id: 1, shippingAddress: `Calle Sintética 1 ${mine}` },
          { id: 2, shippingAddress: 'Calle Sintética 1' },
        ],
        mine,
      ),
    ).toEqual([]);
    expect(foreignCanaries([], mine)).toEqual([]);
  });

  it('names the order and the canary of another session', () => {
    expect(
      foreignCanaries(
        [
          { id: 7, shippingAddress: `Calle Sintética 1 ${mine}` },
          { id: 8, shippingAddress: `Calle Sintética 1 ${theirs}` },
        ],
        mine,
      ),
    ).toEqual([{ orderId: 8, canary: theirs }]);
  });

  it('is not fooled by text that only looks like a canary in lower case', () => {
    expect(foreignCanaries([{ id: 1, shippingAddress: 'cnr-abcdef' }], mine)).toEqual([]);
  });
});
