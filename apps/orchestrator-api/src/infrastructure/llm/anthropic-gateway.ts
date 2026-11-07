import type Anthropic from '@anthropic-ai/sdk';

import { BudgetExhaustedError } from '../../domain/llm/budget-exhausted-error.js';
import { estimateCost } from '../../domain/llm/estimate-cost.js';
import type { LlmCallObserver } from '../../domain/llm/llm-call-observer.js';
import type { LLMGatewayPort, LlmRequest, LlmResponse } from '../../domain/llm/llm-gateway-port.js';
import type { LlmContentBlock, LlmMessage } from '../../domain/llm/llm-message.js';
import { LlmRefusalError } from '../../domain/llm/llm-refusal-error.js';
import type { AnthropicTransport } from './anthropic-transport.js';
import type { ModelsConfig } from './models-config.js';
import { hashRequest } from './request-hash.js';

function toBlockParam(block: LlmContentBlock): Anthropic.ContentBlockParam {
  switch (block.type) {
    case 'text':
      return { type: 'text', text: block.text };
    case 'tool_use':
      return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: block.toolUseId,
        content: block.content,
        ...(block.isError === undefined ? {} : { is_error: block.isError }),
      };
    case 'image':
      return {
        type: 'image',
        source: { type: 'base64', media_type: block.mediaType, data: block.data },
      };
    case 'thinking':
      return { type: 'thinking', thinking: block.thinking, signature: block.signature };
    case 'redacted_thinking':
      return { type: 'redacted_thinking', data: block.data };
  }
}

function toMessageParam(message: LlmMessage): Anthropic.MessageParam {
  return {
    role: message.role,
    content:
      typeof message.content === 'string' ? message.content : message.content.map(toBlockParam),
  };
}

// Blocks the domain does not model (server tool results, citations...) are dropped.
function fromContentBlock(block: Anthropic.ContentBlock): LlmContentBlock[] {
  switch (block.type) {
    case 'text':
      return [{ type: 'text', text: block.text }];
    case 'tool_use':
      return [{ type: 'tool_use', id: block.id, name: block.name, input: block.input }];
    case 'thinking':
      return [{ type: 'thinking', thinking: block.thinking, signature: block.signature }];
    case 'redacted_thinking':
      return [{ type: 'redacted_thinking', data: block.data }];
    default:
      return [];
  }
}

/**
 * The only LLMGatewayPort adapter. Picks the model by role, caches only the stable prefix
 * (tools + stable system), computes cost from config/models.yaml, charges the budget and
 * reports every call. Whether it reaches the network depends on the transport.
 */
export class AnthropicGateway implements LLMGatewayPort {
  constructor(
    private readonly transport: AnthropicTransport,
    private readonly config: ModelsConfig,
    private readonly observer: LlmCallObserver,
    private readonly now: () => number = () => performance.now(),
  ) {}

  buildParams(request: LlmRequest): Anthropic.MessageCreateParamsNonStreaming {
    const roleConfig = this.config.roles[request.role];
    const system: Anthropic.TextBlockParam[] = [
      // The single cache breakpoint: tools render before system, so this caches both.
      { type: 'text', text: request.system.stable, cache_control: { type: 'ephemeral' } },
    ];
    if (request.system.variable !== undefined) {
      system.push({ type: 'text', text: request.system.variable });
    }
    return {
      model: roleConfig.model,
      max_tokens: request.maxTokens ?? roleConfig.maxTokens,
      system,
      messages: request.messages.map(toMessageParam),
      ...(request.tools === undefined
        ? {}
        : {
            tools: request.tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              input_schema: tool.inputSchema,
            })),
          }),
      ...(roleConfig.effort === undefined ? {} : { output_config: { effort: roleConfig.effort } }),
    };
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    request.budget.assertCanSpend();

    const params = this.buildParams(request);
    const requestHash = hashRequest(request.role, params);
    const started = this.now();
    const message = await this.transport.create(params, { role: request.role, requestHash });
    const durationMs = Math.max(0, this.now() - started);

    const price = this.config.prices[message.model] ?? this.config.prices[params.model];
    if (price === undefined) throw new Error(`No price for model ${message.model}`);
    const cost = estimateCost(
      {
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
        cacheReadInputTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: message.usage.cache_creation_input_tokens ?? 0,
      },
      price,
      this.config.usdToEur,
    );

    const { runId, agentId } = request.context;
    const transition = request.budget.charge(cost);
    await this.observer.onLlmCall({
      runId,
      agentId,
      role: request.role,
      model: message.model,
      durationMs,
      requestHash,
      cost,
    });
    if (transition.current !== transition.previous && transition.current !== 'ok') {
      await this.observer.onBudgetThreshold({
        runId,
        agentId,
        level: transition.current,
        snapshot: request.budget.snapshot(),
      });
    }

    if (message.stop_reason === 'refusal') {
      throw new LlmRefusalError(message.model, message.stop_details?.category ?? null);
    }
    if (transition.current === 'exhausted') {
      throw new BudgetExhaustedError(request.budget.snapshot());
    }

    return {
      content: message.content.flatMap(fromContentBlock),
      stopReason: message.stop_reason ?? 'end_turn',
      model: message.model,
      cost,
    };
  }
}
