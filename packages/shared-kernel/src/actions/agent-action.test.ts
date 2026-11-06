import { describe, expect, it } from 'vitest';

import { parseAgentAction } from './agent-action.js';
import { InvalidAgentActionError } from './invalid-agent-action-error.js';

describe('agent actions (F1.2 action space)', () => {
  it.each([
    [{ type: 'click', ref: 'e12' }],
    [{ type: 'type', ref: 'e6', text: 'Ana' }],
    [{ type: 'type', ref: 'e6', text: '' }],
    [{ type: 'select', ref: 'e7', value: '2' }],
    [{ type: 'scroll', direction: 'down' }],
    [{ type: 'back' }],
    [{ type: 'wait', ms: 0 }],
    [{ type: 'wait', ms: 10_000 }],
    [{ type: 'done', outcome: 'success', reason: 'Pedido confirmado' }],
    [{ type: 'done', outcome: 'abandon', reason: 'No encuentro el botón' }],
  ])('accepts %j', (action) => {
    expect(parseAgentAction(action)).toEqual(action);
  });

  it.each([
    ['an unknown type', { type: 'hover', ref: 'e1' }],
    ['a ref that is not short', { type: 'click', ref: 'button.primary' }],
    ['a missing ref', { type: 'click' }],
    ['text over 500 characters', { type: 'type', ref: 'e1', text: 'x'.repeat(501) }],
    ['a sideways scroll', { type: 'scroll', direction: 'left' }],
    ['a wait over 10 s', { type: 'wait', ms: 10_001 }],
    ['a fractional wait', { type: 'wait', ms: 1.5 }],
    ['an unknown outcome', { type: 'done', outcome: 'error', reason: 'x' }],
    ['an empty reason', { type: 'done', outcome: 'success', reason: '' }],
    ['a non-object', 'click e1'],
  ])('rejects %s', (_label, action) => {
    expect(() => parseAgentAction(action)).toThrow(InvalidAgentActionError);
  });

  it('drops unknown fields instead of passing them on', () => {
    expect(parseAgentAction({ type: 'back', selector: '#x' })).toEqual({ type: 'back' });
  });
});
