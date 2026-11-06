// A fake LLMGatewayPort for loop tests: answers with scripted tool calls (or text) and keeps
// every request for assertions. Charges a fixed cost so budgets move. Not part of the build.

import { BudgetExhaustedError } from '../domain/llm/budget-exhausted-error.js';
import type { LlmRequest, LlmResponse, LLMGatewayPort } from '../domain/llm/llm-gateway-port.js';

export type ScriptedReply =
  | { readonly tool: string; readonly input?: Record<string, unknown> }
  | { readonly text: string }
  | { readonly throws: Error };

const COST = {
  inputTokens: 1000,
  outputTokens: 20,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
  estimatedEur: 0.0001,
};

export class ScriptedGateway implements LLMGatewayPort {
  readonly requests: LlmRequest[] = [];
  private next = 0;

  /**
   * `replies` answer the navigator's tool requests in order (the last one repeats);
   * `summaries` answer the requests without tools (working-memory summaries).
   */
  constructor(
    private readonly replies: readonly ScriptedReply[],
    private readonly summaries: readonly string[] = ['Summary.'],
  ) {}

  complete(request: LlmRequest): Promise<LlmResponse> {
    this.requests.push(request);
    if (request.tools === undefined) {
      const index = this.requests.filter((r) => r.tools === undefined).length - 1;
      const text = this.summaries[Math.min(index, this.summaries.length - 1)] ?? '';
      return Promise.resolve(this.respond([{ type: 'text', text }], request));
    }
    const reply = this.replies[Math.min(this.next++, this.replies.length - 1)];
    if (reply === undefined) return Promise.reject(new Error('no scripted reply'));
    if ('throws' in reply) return Promise.reject(reply.throws);
    if ('text' in reply)
      return Promise.resolve(this.respond([{ type: 'text', text: reply.text }], request));
    return Promise.resolve(
      this.respond(
        [
          {
            type: 'tool_use',
            id: `toolu_${String(this.next)}`,
            name: reply.tool,
            input: reply.input ?? {},
          },
        ],
        request,
      ),
    );
  }

  /** Requests the navigator made for its actions (not summaries). */
  actionRequests(): LlmRequest[] {
    return this.requests.filter((request) => request.tools !== undefined);
  }

  private respond(content: LlmResponse['content'], request: LlmRequest): LlmResponse {
    const transition = request.budget.charge(COST);
    if (transition.current === 'exhausted')
      throw new BudgetExhaustedError(request.budget.snapshot());
    return { content, stopReason: 'tool_use', model: 'fake-model', cost: COST };
  }
}
