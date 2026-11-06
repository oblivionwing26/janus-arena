import { fromToolCall } from '@janus/shared-kernel';

import type { Budget } from '../domain/llm/budget.js';
import type { LLMGatewayPort } from '../domain/llm/llm-gateway-port.js';
import type { Persona } from '../domain/persona/persona.js';
import type { Decider, Decision, DecisionInput } from './decider.js';
import { NavigatorPrompt, type NavigatorTask } from './navigator-prompt.js';
import { formatEntry, type WorkingMemory } from './working-memory.js';

const SUMMARY_RULES = `You keep the notes of a shopper in a usability study. Given the notes so far and the latest actions, write the updated notes: at most two short sentences, in the first person, about what was done, what worked and what did not. Do not give advice and do not mention refs.`;
const SUMMARY_MAX_CHARS = 400;

export interface LlmDeciderOptions {
  readonly gateway: LLMGatewayPort;
  readonly persona: Persona;
  readonly task: NavigatorTask;
  /** The run's shared budget; every call is charged to it. */
  readonly budget: Budget;
  readonly context: { readonly runId: string; readonly agentId: string };
}

/**
 * The navigator LLM playing a persona (F1.4): one tool call per step over the cached prefix,
 * and a working-memory summary every few steps.
 */
export class LlmDecider implements Decider {
  readonly role;
  private readonly prompt: NavigatorPrompt;

  constructor(private readonly options: LlmDeciderOptions) {
    this.role = options.persona.modelRole;
    this.prompt = NavigatorPrompt.forSession(options.persona, options.task);
  }

  async decide(input: DecisionInput): Promise<Decision> {
    const { gateway, budget, context } = this.options;
    if (input.memory.summaryDue()) input.memory.setSummary(await this.summarize(input.memory));
    const response = await gateway.complete({
      ...this.prompt.request({
        stepIndex: input.stepIndex,
        observation: input.observation.full,
        lastResult: input.lastResult,
        memory: input.memory.render(),
      }),
      budget,
      context,
    });
    const call = response.content.find((block) => block.type === 'tool_use');
    return call === undefined
      ? { action: { type: 'no-tool-call' } }
      : fromToolCall(call.name, call.input);
  }

  private async summarize(memory: WorkingMemory): Promise<string> {
    const { gateway, persona, budget, context } = this.options;
    const { previous, entries } = memory.toSummarize();
    const response = await gateway.complete({
      role: persona.modelRole,
      system: { stable: SUMMARY_RULES },
      messages: [
        {
          role: 'user',
          content: [
            `Goal: ${persona.goal}`,
            `Notes so far: ${previous ?? '(none)'}`,
            'Latest actions:',
            ...entries.map(formatEntry),
          ].join('\n'),
        },
      ],
      maxTokens: 300,
      budget,
      context,
    });
    const text = response.content
      .flatMap((block) => (block.type === 'text' ? [block.text] : []))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    return text === '' ? (previous ?? '') : text.slice(0, SUMMARY_MAX_CHARS);
  }
}
