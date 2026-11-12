import type { LlmToolDefinition } from '../../domain/llm/llm-message.js';

/**
 * The tools of the agents that change code (F2.3, F3.5): read a file, edit it by exact
 * replacement, finish. Code enforces every rule behind them (EditingAgent).
 */
export const EDITING_TOOLS: readonly LlmToolDefinition[] = [
  {
    name: 'read_file',
    description: 'Read a source file of the project.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path from the project root.' } },
      required: ['path'],
    },
  },
  {
    name: 'edit_file',
    description:
      'Replace old_text with new_text in a file you may edit. old_text must appear exactly once. To create a new file, use an empty old_text.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        old_text: { type: 'string' },
        new_text: { type: 'string' },
      },
      required: ['path', 'old_text', 'new_text'],
    },
  },
  {
    name: 'done',
    description: 'Finish: summarise what you changed and why (or why you changed nothing).',
    inputSchema: {
      type: 'object',
      properties: { summary: { type: 'string' } },
      required: ['summary'],
    },
  },
];
