import type { HttpRedTeamClass } from '@janus/shared-kernel';

/**
 * One request an attack makes (F3.3): a path on the target, never a full URL, sent as the
 * attacker B or with no session. The deterministic engine generates these from the surface map;
 * the (disabled) LLM agent produces the same shape. The scope guard decides every one.
 */
export interface AttackRequest {
  readonly class: HttpRedTeamClass;
  readonly as: 'b' | 'anonymous';
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path and query, starting with `/`. */
  readonly path: string;
  /** A JSON body, as text. */
  readonly body?: string | undefined;
}
