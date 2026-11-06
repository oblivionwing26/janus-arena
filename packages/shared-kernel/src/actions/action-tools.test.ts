import { describe, expect, it } from 'vitest';

import { parseAgentAction } from './agent-action.js';
import { actionToolDefinitions, fromToolCall } from './action-tools.js';

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

  it('offers an optional thought on every tool', () => {
    for (const tool of tools) {
      expect(tool.inputSchema).toMatchObject({ properties: { thought: { maxLength: 200 } } });
      expect(tool.inputSchema.required ?? []).not.toContain('thought');
    }
  });

  it('turns a tool call into a valid action and a separate thought', () => {
    const call = fromToolCall('click', { ref: 'e4', thought: 'Este parece el botón.' });

    expect(call.thought).toBe('Este parece el botón.');
    expect(parseAgentAction(call.action)).toEqual({ type: 'click', ref: 'e4' });
  });

  it('drops a malformed thought and keeps the action', () => {
    expect(fromToolCall('back', { thought: 42 })).toEqual({ action: { type: 'back' } });
    expect(fromToolCall('wait', 'garbage')).toEqual({ action: { type: 'wait' } });
  });
});
