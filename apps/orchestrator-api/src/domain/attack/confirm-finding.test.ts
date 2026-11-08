import { describe, expect, it } from 'vitest';

import { verdict } from '../oracles/oracle-verdict.js';
import { confirmFinding, FindingNotConfirmableError } from './confirm-finding.js';

const ID = '01JC0F28CNS0000000000000AA';

describe('confirmFinding', () => {
  it('confirms a finding whose PoC reproduced', () => {
    expect(
      confirmFinding(ID, { pocRef: `poc/${ID}.json`, replay: verdict(true, 'leaked again') }),
    ).toEqual({ findingId: ID, pocRef: `poc/${ID}.json`, evidence: 'leaked again' });
  });

  it.each([
    ['no PoC', { pocRef: null, replay: verdict(true, 'x') }, 'no reproducible PoC'],
    ['an empty PoC reference', { pocRef: ' ', replay: verdict(true, 'x') }, 'no reproducible PoC'],
    ['a PoC never replayed', { pocRef: 'poc/x.json', replay: null }, 'was not replayed'],
    [
      'a PoC that no longer works',
      { pocRef: 'poc/x.json', replay: verdict(false, 'status 403') },
      'did not reproduce: status 403',
    ],
  ])('refuses %s', (_case, poc, message) => {
    expect(() => confirmFinding(ID, poc)).toThrow(FindingNotConfirmableError);
    expect(() => confirmFinding(ID, poc)).toThrow(message);
  });
});
