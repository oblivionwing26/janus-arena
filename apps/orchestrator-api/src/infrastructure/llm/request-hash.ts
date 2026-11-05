import { createHash } from 'node:crypto';

import type Anthropic from '@anthropic-ai/sdk';
import type { ModelRole } from '@janus/shared-kernel';

// JSON with object keys sorted at every level, so equal requests always serialise the same.
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, current: unknown) => {
    if (current === null || typeof current !== 'object' || Array.isArray(current)) return current;
    return Object.fromEntries(
      Object.entries(current as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
    );
  });
}

/**
 * Recording key (ADR 0004): role + normalised request, without the model id, so
 * recordings survive a model swap in config/models.yaml.
 */
export function hashRequest(
  role: ModelRole,
  params: Anthropic.MessageCreateParamsNonStreaming,
): string {
  const { model: _model, ...rest } = params;
  const digest = createHash('sha256')
    .update(canonicalJson({ role, request: rest }))
    .digest('hex');
  return `sha256:${digest}`;
}
