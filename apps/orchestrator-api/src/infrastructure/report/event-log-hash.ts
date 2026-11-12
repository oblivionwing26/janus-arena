import { createHash } from 'node:crypto';

import type { StoredEvent } from '../../domain/event-store/stored-event.js';

/** JSON with object keys sorted at every level: one text per value, whatever its key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, inner]) => inner !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, inner]) => `${JSON.stringify(key)}:${canonicalJson(inner)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * The SHA-256 of a run's event log (F3.7): its events in seq order, one canonical JSON line each.
 * The log is append-only, so the hash a signed report holds can be recomputed at any time.
 */
export function eventLogHash(events: readonly StoredEvent[]): string {
  const lines = [...events].sort((a, b) => a.seq - b.seq).map((event) => canonicalJson(event));
  return createHash('sha256').update(lines.join('\n')).digest('hex');
}
