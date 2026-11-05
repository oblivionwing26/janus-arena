import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Budget } from '../../domain/llm/budget.js';
import type { LlmRequest } from '../../domain/llm/llm-gateway-port.js';
import { RecordingNotFoundError } from '../../domain/llm/recording-not-found-error.js';
import {
  CollectingObserver,
  FakeTransport,
  fakeMessage,
  testModelsConfig,
} from '../../test-support/fake-anthropic.js';
import { AnthropicGateway } from './anthropic-gateway.js';
import { RecordedLLMAdapter, recordingPath } from './recorded-llm-adapter.js';
import { canonicalJson, hashRequest } from './request-hash.js';

function request(text = 'hello'): LlmRequest {
  return {
    role: 'navigator',
    system: { stable: 'You are a test.' },
    messages: [{ role: 'user', content: text }],
    budget: new Budget({ maxTokens: 100_000, maxEur: 1 }),
    context: { runId: '01JBZ7Q8K5V4W3X2Y1Z0ABCDEF', agentId: 'test-agent' },
  };
}

describe('RecordedLLMAdapter', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'janus-recordings-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('replays exactly what it recorded, without calling the inner transport', async () => {
    const inner = new FakeTransport(() =>
      fakeMessage({ text: 'recorded answer', usage: { input: 120, output: 7, cacheRead: 30 } }),
    );
    const recordObserver = new CollectingObserver();
    const recorder = new AnthropicGateway(
      new RecordedLLMAdapter({ mode: 'record', dir, inner }),
      testModelsConfig,
      recordObserver,
    );
    const recorded = await recorder.complete(request());

    const replayObserver = new CollectingObserver();
    const replayer = new AnthropicGateway(
      new RecordedLLMAdapter({ mode: 'replay', dir }),
      testModelsConfig,
      replayObserver,
    );
    const replayed = await replayer.complete(request());

    expect(inner.calls).toHaveLength(1);
    expect(replayed).toEqual(recorded);
    expect(replayObserver.calls[0]?.requestHash).toBe(recordObserver.calls[0]?.requestHash);
    expect(replayObserver.calls[0]?.cost).toEqual(recordObserver.calls[0]?.cost);
  });

  it('fails in replay mode when the recording is missing', async () => {
    const replayer = new AnthropicGateway(
      new RecordedLLMAdapter({ mode: 'replay', dir }),
      testModelsConfig,
      new CollectingObserver(),
    );

    await expect(replayer.complete(request('never recorded'))).rejects.toBeInstanceOf(
      RecordingNotFoundError,
    );
  });

  it('stores the request and response bodies under role/<hash>.json', async () => {
    const inner = new FakeTransport();
    const gateway = new AnthropicGateway(
      new RecordedLLMAdapter({ mode: 'record', dir, inner }),
      testModelsConfig,
      new CollectingObserver(),
    );
    await gateway.complete(request());
    const meta = inner.calls[0]?.meta;
    if (meta === undefined) throw new Error('no call recorded');

    const file = JSON.parse(await readFile(recordingPath(dir, meta), 'utf8')) as Record<
      string,
      unknown
    >;

    expect(Object.keys(file).sort()).toEqual(
      ['model', 'recordedAt', 'request', 'requestHash', 'response', 'role', 'version'].sort(),
    );
    expect(file.role).toBe('navigator');
    expect(file.requestHash).toBe(meta.requestHash);
  });
});

describe('request hashing', () => {
  const params = {
    model: 'm-small',
    max_tokens: 100,
    system: [{ type: 'text' as const, text: 'a' }],
    messages: [{ role: 'user' as const, content: 'hi' }],
  };

  it('serialises objects with sorted keys at every level', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { f: 1, e: 2 }], c: 2 } })).toBe(
      '{"a":{"c":2,"d":[3,{"e":2,"f":1}]},"b":1}',
    );
  });

  it('gives the same hash whatever the key order', () => {
    const reordered = {
      messages: [{ content: 'hi', role: 'user' as const }],
      system: [{ text: 'a', type: 'text' as const }],
      max_tokens: 100,
      model: 'm-small',
    };

    expect(hashRequest('navigator', reordered)).toBe(hashRequest('navigator', params));
  });

  it('keys by role and ignores the model id (ADR 0004)', () => {
    expect(hashRequest('navigator', { ...params, model: 'other' })).toBe(
      hashRequest('navigator', params),
    );
    expect(hashRequest('architect', params)).not.toBe(hashRequest('navigator', params));
  });

  it('changes when the request content changes', () => {
    expect(
      hashRequest('navigator', { ...params, messages: [{ role: 'user', content: 'bye' }] }),
    ).not.toBe(hashRequest('navigator', params));
  });
});
