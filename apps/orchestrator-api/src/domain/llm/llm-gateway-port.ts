import type { EventCost, ModelRole } from '@janus/shared-kernel';

import type { Budget } from './budget.js';
import type { LlmContentBlock, LlmMessage, LlmToolDefinition } from './llm-message.js';

export interface LlmSystemPrompt {
  /** System prompt + persona. Byte-identical between steps; the only cached part with tools. */
  readonly stable: string;
  /** Per-request system text, placed after the cache breakpoint. */
  readonly variable?: string;
}

export interface LlmRequest {
  readonly role: ModelRole;
  readonly system: LlmSystemPrompt;
  readonly messages: readonly LlmMessage[];
  readonly tools?: readonly LlmToolDefinition[];
  /** Overrides the role's maxTokens from config/models.yaml. */
  readonly maxTokens?: number;
  readonly budget: Budget;
  readonly context: { readonly runId: string; readonly agentId: string };
}

export type LlmStopReason =
  | 'end_turn'
  | 'max_tokens'
  | 'stop_sequence'
  | 'tool_use'
  | 'pause_turn'
  | 'model_context_window_exceeded';

export interface LlmResponse {
  readonly content: readonly LlmContentBlock[];
  readonly stopReason: LlmStopReason;
  readonly model: string;
  readonly cost: EventCost;
}

/**
 * The only way to call an LLM (CLAUDE.md, LLM usage). Models are chosen by role.
 * Throws BudgetExhaustedError before calling when the budget is already exhausted,
 * and after a call that exhausts it; LlmRefusalError when the model declines.
 */
export interface LLMGatewayPort {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export const LLM_GATEWAY_PORT = Symbol('LLMGatewayPort');
