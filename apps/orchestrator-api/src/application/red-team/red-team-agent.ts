import {
  redTeamToolInputs,
  type RedTeamClaim,
  type RedTeamHttpRequest,
} from '@janus/shared-kernel';

import type { Budget } from '../../domain/llm/budget.js';
import type { LLMGatewayPort } from '../../domain/llm/llm-gateway-port.js';
import type { LlmContentBlock, LlmMessage } from '../../domain/llm/llm-message.js';
import { RED_TEAM_TOOLS } from './red-team-prompt.js';

export const MAX_TURNS = 25;

export type HttpRequestInput = RedTeamHttpRequest;
export type ClaimInput = RedTeamClaim;

/** What a tool call gives back to the model. */
export interface ToolReply {
  readonly content: string;
  readonly isError?: boolean;
}

/** The code behind the Red Team's tools; every rule is enforced there, not by the model. */
export interface RedTeamHandlers {
  request(input: HttpRequestInput): Promise<ToolReply>;
  claim(input: ClaimInput): Promise<ToolReply>;
}

export interface RedTeamTask {
  readonly runId: string;
  readonly agentId: string;
  /** Rules, playbooks, surface and leads: the cached prefix. */
  readonly system: string;
  readonly brief: string;
  readonly handlers: RedTeamHandlers;
  readonly budget: Budget;
}

export interface RedTeamResult {
  readonly outcome: 'done' | 'turn_limit' | 'no_tool_use';
  readonly summary: string;
}

/**
 * The Red Team's loop (F3.3): the model only sends requests, claims attempts and finishes,
 * through three allowlisted tools whose inputs are validated before code acts on them. Stops at
 * `done`, after MAX_TURNS, when the model stops using tools, or when the budget runs out.
 */
export class RedTeamAgent {
  constructor(private readonly deps: { readonly gateway: LLMGatewayPort }) {}

  async run(task: RedTeamTask): Promise<RedTeamResult> {
    const messages: LlmMessage[] = [
      { role: 'user', content: [{ type: 'text', text: task.brief }] },
    ];

    const tool = async (name: string, input: unknown): Promise<ToolReply & { done?: string }> => {
      if (name === 'http_request') {
        const parsed = redTeamToolInputs.http_request.safeParse(input);
        if (!parsed.success) {
          return {
            content: `http_request needs as, method, a path starting with / and class: ${parsed.error.issues[0]?.message ?? 'invalid input'}`,
            isError: true,
          };
        }
        return task.handlers.request(parsed.data);
      }
      if (name === 'claim') {
        const parsed = redTeamToolInputs.claim.safeParse(input);
        if (!parsed.success) return { content: 'claim needs class and attempt.', isError: true };
        return task.handlers.claim(parsed.data);
      }
      if (name === 'done') {
        const parsed = redTeamToolInputs.done.safeParse(input);
        return { content: 'Done.', done: parsed.success ? parsed.data.summary : 'Done.' };
      }
      return { content: `Unknown tool ${name}.`, isError: true };
    };

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const response = await this.deps.gateway.complete({
        role: 'red-team',
        system: { stable: task.system },
        messages,
        tools: RED_TEAM_TOOLS,
        budget: task.budget,
        context: { runId: task.runId, agentId: task.agentId },
      });
      messages.push({ role: 'assistant', content: response.content });
      const calls = response.content.filter(
        (block): block is Extract<LlmContentBlock, { type: 'tool_use' }> =>
          block.type === 'tool_use',
      );
      if (calls.length === 0) {
        return { outcome: 'no_tool_use', summary: 'The model stopped without calling done.' };
      }

      const results: LlmContentBlock[] = [];
      let finished: string | undefined;
      for (const call of calls) {
        const outcome = await tool(call.name, call.input);
        finished ??= outcome.done;
        results.push({
          type: 'tool_result',
          toolUseId: call.id,
          content: outcome.content,
          ...(outcome.isError === true ? { isError: true } : {}),
        });
      }
      if (finished !== undefined) return { outcome: 'done', summary: finished };
      messages.push({ role: 'user', content: results });
    }
    return { outcome: 'turn_limit', summary: `Stopped after ${String(MAX_TURNS)} turns.` };
  }
}
