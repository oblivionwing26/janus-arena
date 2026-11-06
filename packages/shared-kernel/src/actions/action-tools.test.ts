import { describe, expect, it } from 'vitest';

import { parseAgentAction } from './agent-action.js';
import { actionToolDefinitions } from './action-tools.js';

describe('actionToolDefinitions', () => {
  const tools = actionToolDefinitions();

  it('has one tool per action, in a fixed order', () => {
    expect(tools.map((tool) => tool.name)).toEqual([
      'click',
      'type',
      'select',
      'scroll',
      'back',
      'wait',
      'done',
    ]);
  });

  it('describes every tool and gives it a closed object schema', () => {
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(10);
      expect(tool.inputSchema).toMatchObject({ type: 'object', additionalProperties: false });
      expect(tool.inputSchema).not.toHaveProperty('$schema');
    }
  });

  it('carries the same limits as the validated actions', () => {
    const wait = tools.find((tool) => tool.name === 'wait');
    expect(wait?.inputSchema).toMatchObject({
      properties: { ms: { type: 'integer', minimum: 0, maximum: 10_000 } },
      required: ['ms'],
    });
  });

  it('is byte-identical every time it is built', () => {
    expect(JSON.stringify(actionToolDefinitions())).toBe(JSON.stringify(tools));
  });

  it('turns a tool call into a valid action', () => {
    expect(parseAgentAction({ type: 'click', ...{ ref: 'e4' } })).toEqual({
      type: 'click',
      ref: 'e4',
    });
  });
});
