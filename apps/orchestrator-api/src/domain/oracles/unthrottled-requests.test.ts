import { describe, expect, it } from 'vitest';

import { MIN_REQUESTS, unthrottledRequests } from './unthrottled-requests.js';

const replies = (count: number, status: number | null) =>
  Array.from({ length: count }, () => ({ status }));

describe('unthrottledRequests (F4.1)', () => {
  it('is exploitable when a steady rate was answered every time and nothing pushed back', () => {
    expect(unthrottledRequests({ replies: replies(40, 200), requestsPerSecond: 5 })).toEqual({
      exploitable: true,
      evidence: '40 requests at 5 per second were all answered, none refused or slowed by the shop',
    });
  });

  it('is not exploitable once the shop refuses a request (429)', () => {
    const verdict = unthrottledRequests({
      replies: [...replies(12, 200), ...replies(28, 429)],
      requestsPerSecond: 5,
    });

    expect(verdict.exploitable).toBe(false);
    expect(verdict.evidence).toContain('refused at request 13 (429)');
  });

  it('counts an unavailable shop (503) as the shop pushing back', () => {
    expect(
      unthrottledRequests({
        replies: [...replies(20, 200), { status: 503 }, ...replies(19, 200)],
        requestsPerSecond: 5,
      }),
    ).toMatchObject({ exploitable: false });
  });

  it('proves nothing from too few requests or an unanswered one', () => {
    expect(
      unthrottledRequests({ replies: replies(MIN_REQUESTS - 1, 200), requestsPerSecond: 5 }),
    ).toMatchObject({ exploitable: false });
    const unanswered = unthrottledRequests({
      replies: [...replies(20, 200), { status: null }, ...replies(19, 200)],
      requestsPerSecond: 5,
    });
    expect(unanswered.exploitable).toBe(false);
    expect(unanswered.evidence).toContain('request 21 got no answer');
  });

  it('is not exploitable when no request was made', () => {
    expect(unthrottledRequests({ replies: [], requestsPerSecond: 5 })).toEqual({
      exploitable: false,
      evidence: 'no request was made',
    });
  });
});
