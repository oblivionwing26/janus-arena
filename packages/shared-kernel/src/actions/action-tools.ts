import { z } from 'zod';

import { agentActionInputs, type AgentActionType } from './agent-action.js';

/** An LLM tool for one action. A tool call `{ name, input }` is the action `{ type: name, ...input }`. */
export interface ActionToolDefinition {
  readonly name: AgentActionType;
  readonly description: string;
  readonly inputSchema: { readonly type: 'object' } & Readonly<Record<string, unknown>>;
}

const DESCRIPTIONS: Record<AgentActionType, string> = {
  click: 'Click the element with this ref, as a person would with the mouse or a tap.',
  type: 'Type text into the field with this ref. The field is cleared first.',
  select: 'Choose an option, by its visible label, in the select with this ref.',
  scroll: 'Scroll the page by most of one screen to see more of it.',
  back: 'Go back to the previous page, like the browser back button.',
  wait: 'Wait for the page to change, for example after a slow load.',
  done: 'Finish the task: success when the goal is reached, abandon when you give up.',
};

// Fixed order: tools are part of the cached prompt prefix and must not move between steps.
const ORDER: readonly AgentActionType[] = [
  'click',
  'type',
  'select',
  'scroll',
  'back',
  'wait',
  'done',
];

/** The navigator's action space as LLM tools, derived from the same zod schemas it is validated with. */
export function actionToolDefinitions(): ActionToolDefinition[] {
  return ORDER.map((name) => {
    const { $schema: _dialect, ...schema } = z.toJSONSchema(agentActionInputs[name]);
    return {
      name,
      description: DESCRIPTIONS[name],
      inputSchema: { ...schema, type: 'object' },
    };
  });
}
