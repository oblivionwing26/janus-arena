import { llmCallEventSchema } from '@janus/shared-kernel';
import { describe, expect, it } from 'vitest';

import { Budget } from '../../domain/llm/budget.js';
import { BudgetExhaustedError } from '../../domain/llm/budget-exhausted-error.js';
import type { LlmRequest } from '../../domain/llm/llm-gateway-port.js';
import { LlmRefusalError } from '../../domain/llm/llm-refusal-error.js';
import {
  CollectingObserver,
  FakeTransport,
  fakeMessage,
  testModelsConfig,
} from '../../test-support/fake-anthropic.js';
import { AnthropicGateway } from './anthropic-gateway.js';

const RUN_ID = '01JBZ7Q8K5V4W3X2Y1Z0ABCDEF';

function request(overrides: Partial<LlmRequest> = {}): LlmRequest {
  return {
    role: 'navigator',
    system: { stable: 'You are Ana, a patient shopper.', variable: 'Step 3 of 20.' },
    messages: [{ role: 'user', content: '<observation>checkout page</observation>' }],
    tools: [
      {
        name: 'click',
        description: 'Click an element',
        inputSchema: { type: 'object', properties: { ref: { type: 'string' } } },
      },
    ],
    budget: new Budget({ maxTokens: 1000, maxEur: 1 }),
    context: { runId: RUN_ID, agentId: 'persona-ana-1' },
    ...overrides,
  };
}

function setup(reply?: () => ReturnType<typeof fakeMessage>) {
  const transport = new FakeTransport(reply);
  const observer = new CollectingObserver();
  const gateway = new AnthropicGateway(transport, testModelsConfig, observer);
  return { transport, observer, gateway };
}

describe('AnthropicGateway', () => {
  it('picks the model, max tokens and effort from the role', async () => {
    const { transport, gateway } = setup();

    await gateway.complete(request());

    const params = transport.calls[0]?.params;
    expect(params?.model).toBe('m-small');
    expect(params?.max_tokens).toBe(100);
    expect(params?.output_config).toEqual({ effort: 'low' });
  });

  it('lets the request override max tokens and omits effort when the role has none', async () => {
    const { transport, gateway } = setup();

    await gateway.complete(request({ role: 'architect', maxTokens: 42 }));

    const params = transport.calls[0]?.params;
    expect(params?.model).toBe('m-big');
    expect(params?.max_tokens).toBe(42);
    expect(params?.output_config).toBeUndefined();
  });

  it('marks cache_control only on the stable system block', async () => {
    const { transport, gateway } = setup();

    await gateway.complete(request());

    const params = transport.calls[0]?.params;
    expect(params?.system).toEqual([
      {
        type: 'text',
        text: 'You are Ana, a patient shopper.',
        cache_control: { type: 'ephemeral' },
      },
      { type: 'text', text: 'Step 3 of 20.' },
    ]);
    expect(JSON.stringify(params).match(/cache_control/g)).toHaveLength(1);
    expect(params?.tools).toEqual([
      {
        name: 'click',
        description: 'Click an element',
        input_schema: { type: 'object', properties: { ref: { type: 'string' } } },
      },
    ]);
  });

  it('omits the variable system block when there is none', async () => {
    const { transport, gateway } = setup();

    await gateway.complete(request({ system: { stable: 'Stable only.' } }));

    expect(transport.calls[0]?.params.system).toEqual([
      { type: 'text', text: 'Stable only.', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('returns content and cost, and reports an llm.call that matches the event schema', async () => {
    const { transport, observer, gateway } = setup(() =>
      fakeMessage({
        text: 'clicked',
        usage: { input: 100, output: 50, cacheRead: 1000, cacheWrite: 200 },
      }),
    );

    const response = await gateway.complete(
      request({ budget: new Budget({ maxTokens: 100_000, maxEur: 1 }) }),
    );

    // USD: 100*1 + 50*2 + 1000*0.1 + 200*1.25 = 550 per 1M -> 0.00055 USD -> 0.000275 EUR
    expect(response.cost.estimatedEur).toBeCloseTo(0.000275, 12);
    expect(response.content).toEqual([{ type: 'text', text: 'clicked' }]);
    expect(response.stopReason).toBe('end_turn');

    const call = observer.calls[0];
    expect(call?.requestHash).toBe(transport.calls[0]?.meta.requestHash);
    const event = {
      id: '01JBZ7Q8K5V4W3X2Y1Z0ABCDEG',
      runId: call?.runId,
      seq: 0,
      ts: '2026-11-05T10:00:00.000Z',
      schemaVersion: 1,
      actor: { agentId: call?.agentId, role: call?.role },
      type: 'llm.call',
      payload: {
        role: call?.role,
        model: call?.model,
        durationMs: call?.durationMs,
        requestHash: call?.requestHash,
      },
      cost: call?.cost,
    };
    expect(llmCallEventSchema.safeParse(event).error).toBeUndefined();
  });

  it('maps tool use and thinking blocks both ways', async () => {
    const { transport, gateway } = setup(() => {
      const message = fakeMessage({ stopReason: 'tool_use' });
      return {
        ...message,
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'tool_use', id: 'tu_1', name: 'click', input: { ref: 'e12' } },
        ],
      } as unknown as typeof message;
    });

    const response = await gateway.complete(
      request({
        messages: [
          { role: 'user', content: 'go' },
          {
            role: 'assistant',
            content: [
              { type: 'thinking', thinking: '', signature: 'prev' },
              { type: 'tool_use', id: 'tu_0', name: 'click', input: { ref: 'e1' } },
            ],
          },
          {
            role: 'user',
            content: [{ type: 'tool_result', toolUseId: 'tu_0', content: 'done', isError: false }],
          },
        ],
      }),
    );

    expect(response.stopReason).toBe('tool_use');
    expect(response.content).toEqual([
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'tool_use', id: 'tu_1', name: 'click', input: { ref: 'e12' } },
    ]);
    expect(transport.calls[0]?.params.messages).toEqual([
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: '', signature: 'prev' },
          { type: 'tool_use', id: 'tu_0', name: 'click', input: { ref: 'e1' } },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'tu_0', content: 'done', is_error: false }],
      },
    ]);
  });

  it('sends a screenshot as a base64 image block', async () => {
    const { transport, gateway } = setup();

    await gateway.complete(
      request({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: 'The cart where shoppers stumble:' },
              { type: 'image', mediaType: 'image/png', data: 'iVBORw0KGgo=' },
            ],
          },
        ],
      }),
    );

    expect(transport.calls[0]?.params.messages).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'The cart where shoppers stumble:' },
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: 'iVBORw0KGgo=' },
          },
        ],
      },
    ]);
  });

  it('warns once when the budget crosses 80 %', async () => {
    const { observer, gateway } = setup(() => fakeMessage({ usage: { input: 400, output: 0 } }));
    const budget = new Budget({ maxTokens: 1000, maxEur: 1 });

    await gateway.complete(request({ budget }));
    expect(observer.thresholds).toEqual([]);

    await gateway.complete(request({ budget }));

    expect(observer.thresholds).toHaveLength(1);
    expect(observer.thresholds[0]).toMatchObject({
      runId: RUN_ID,
      agentId: 'persona-ana-1',
      level: 'warning',
      snapshot: { state: 'warning', usedTokens: 800 },
    });
  });

  it('charges and reports the call that exhausts the budget, then throws', async () => {
    const { observer, gateway } = setup(() => fakeMessage({ usage: { input: 600, output: 0 } }));
    const budget = new Budget({ maxTokens: 1000, maxEur: 1 });
    await gateway.complete(request({ budget }));

    await expect(gateway.complete(request({ budget }))).rejects.toBeInstanceOf(
      BudgetExhaustedError,
    );

    expect(observer.calls).toHaveLength(2);
    expect(budget.usedTokens).toBe(1200);
    expect(observer.thresholds.map((t) => t.level)).toEqual(['exhausted']);
  });

  it('refuses to call at all once the budget is exhausted', async () => {
    const { transport, gateway } = setup(() => fakeMessage({ usage: { input: 2000 } }));
    const budget = new Budget({ maxTokens: 1000, maxEur: 1 });
    await expect(gateway.complete(request({ budget }))).rejects.toBeInstanceOf(
      BudgetExhaustedError,
    );

    await expect(gateway.complete(request({ budget }))).rejects.toBeInstanceOf(
      BudgetExhaustedError,
    );

    expect(transport.calls).toHaveLength(1);
  });

  it('charges a refusal and throws LlmRefusalError with its category', async () => {
    const { observer, gateway } = setup(() => {
      const message = fakeMessage({ stopReason: 'refusal' });
      return {
        ...message,
        stop_details: { type: 'refusal', category: 'cyber', explanation: null },
      } as unknown as typeof message;
    });

    const error: unknown = await gateway.complete(request()).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(LlmRefusalError);
    expect((error as LlmRefusalError).category).toBe('cyber');
    expect(observer.calls).toHaveLength(1);
  });
});
