import Anthropic from '@anthropic-ai/sdk';
import type { ModelRole } from '@janus/shared-kernel';

export interface TransportMeta {
  readonly role: ModelRole;
  readonly requestHash: string;
}

/** The one SDK call the gateway needs. Real, recording and replaying implementations share it. */
export interface AnthropicTransport {
  create(
    params: Anthropic.MessageCreateParamsNonStreaming,
    meta: TransportMeta,
  ): Promise<Anthropic.Message>;
}

/** Calls the real API. Credentials come from the environment (ANTHROPIC_API_KEY). */
export class SdkAnthropicTransport implements AnthropicTransport {
  constructor(private readonly client: Anthropic = new Anthropic()) {}

  create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> {
    return this.client.messages.create(params);
  }
}
