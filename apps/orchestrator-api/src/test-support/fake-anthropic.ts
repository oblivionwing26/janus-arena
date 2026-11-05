// Test doubles for the Anthropic transport. Not part of the build.

import type Anthropic from '@anthropic-ai/sdk';

import type {
  BudgetThresholdRecord,
  LlmCallObserver,
  LlmCallRecord,
} from '../domain/llm/llm-call-observer.js';
import type {
  AnthropicTransport,
  TransportMeta,
} from '../infrastructure/llm/anthropic-transport.js';
import { parseModelsConfig } from '../infrastructure/llm/models-config.js';

export const testModelsConfig = parseModelsConfig(`
usdToEur: 0.5
roles:
  navigator: { model: m-small, maxTokens: 100, effort: low }
  competent-baseline: { model: m-big, maxTokens: 200 }
  ui-engineer: { model: m-big, maxTokens: 200 }
  red-team: { model: m-big, maxTokens: 200 }
  blue-team: { model: m-big, maxTokens: 200 }
  architect: { model: m-big, maxTokens: 200 }
prices:
  m-small: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 1.25 }
  m-big: { input: 3, output: 4, cacheRead: 0.3, cacheWrite: 3.75 }
`);

export interface FakeUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export function fakeMessage(
  options: {
    model?: string;
    text?: string;
    usage?: FakeUsage;
    stopReason?: Anthropic.StopReason;
  } = {},
): Anthropic.Message {
  const usage = options.usage ?? {};
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: options.model ?? 'm-small',
    content: [{ type: 'text', text: options.text ?? 'ok', citations: null }],
    stop_reason: options.stopReason ?? 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: usage.input ?? 10,
      output_tokens: usage.output ?? 5,
      cache_read_input_tokens: usage.cacheRead ?? 0,
      cache_creation_input_tokens: usage.cacheWrite ?? 0,
    },
  } as unknown as Anthropic.Message;
}

export class FakeTransport implements AnthropicTransport {
  readonly calls: { params: Anthropic.MessageCreateParamsNonStreaming; meta: TransportMeta }[] = [];

  constructor(private readonly reply: () => Anthropic.Message = () => fakeMessage()) {}

  create(
    params: Anthropic.MessageCreateParamsNonStreaming,
    meta: TransportMeta,
  ): Promise<Anthropic.Message> {
    this.calls.push({ params, meta });
    return Promise.resolve(this.reply());
  }
}

export class CollectingObserver implements LlmCallObserver {
  readonly calls: LlmCallRecord[] = [];
  readonly thresholds: BudgetThresholdRecord[] = [];

  onLlmCall(record: LlmCallRecord): Promise<void> {
    this.calls.push(record);
    return Promise.resolve();
  }

  onBudgetThreshold(record: BudgetThresholdRecord): Promise<void> {
    this.thresholds.push(record);
    return Promise.resolve();
  }
}
