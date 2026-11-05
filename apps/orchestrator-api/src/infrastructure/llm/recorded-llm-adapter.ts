import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import type Anthropic from '@anthropic-ai/sdk';
import { modelRoleSchema } from '@janus/shared-kernel';
import { z } from 'zod';

import { RecordingNotFoundError } from '../../domain/llm/recording-not-found-error.js';
import type { AnthropicTransport, TransportMeta } from './anthropic-transport.js';

// What a recording file holds. Never headers or credentials: only the request body
// and the response body.
const recordingSchema = z.object({
  version: z.literal(1),
  role: modelRoleSchema,
  requestHash: z.string().min(1),
  model: z.string().min(1),
  recordedAt: z.iso.datetime(),
  request: z.unknown(),
  response: z.looseObject({
    model: z.string(),
    content: z.array(z.unknown()),
    stop_reason: z.string().nullable(),
    usage: z.looseObject({ input_tokens: z.int().min(0), output_tokens: z.int().min(0) }),
  }),
});

export type Recording = z.infer<typeof recordingSchema>;

export type RecordedLLMAdapterOptions =
  | { readonly mode: 'record'; readonly dir: string; readonly inner: AnthropicTransport }
  | { readonly mode: 'replay'; readonly dir: string };

export function recordingPath(dir: string, meta: TransportMeta): string {
  return join(dir, meta.role, `${meta.requestHash.replace(/^sha256:/, '')}.json`);
}

/**
 * Records real responses (`record`) or serves them back without network (`replay`).
 * The key is the role plus the hash of the normalised request (see request-hash.ts);
 * a replay with no matching recording fails instead of calling the API.
 */
export class RecordedLLMAdapter implements AnthropicTransport {
  constructor(private readonly options: RecordedLLMAdapterOptions) {}

  async create(
    params: Anthropic.MessageCreateParamsNonStreaming,
    meta: TransportMeta,
  ): Promise<Anthropic.Message> {
    const path = recordingPath(this.options.dir, meta);

    if (this.options.mode === 'replay') {
      let source: string;
      try {
        source = await readFile(path, 'utf8');
      } catch {
        throw new RecordingNotFoundError(meta.role, meta.requestHash);
      }
      const recording = recordingSchema.parse(JSON.parse(source));
      return recording.response as unknown as Anthropic.Message;
    }

    const message = await this.options.inner.create(params, meta);
    const recording: Recording = {
      version: 1,
      role: meta.role,
      requestHash: meta.requestHash,
      model: message.model,
      recordedAt: new Date().toISOString(),
      request: params,
      response: message as unknown as Recording['response'],
    };
    await mkdir(join(this.options.dir, meta.role), { recursive: true });
    await writeFile(path, `${JSON.stringify(recording, null, 2)}\n`, 'utf8');
    return message;
  }
}
