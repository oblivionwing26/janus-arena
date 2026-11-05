import { z } from 'zod';

import { InvalidEventError } from '../events/invalid-event-error.js';
import type { JanusEvent } from '../events/janus-event.js';
import { parseEvent } from '../events/parse-event.js';
import type { UnknownEvent } from '../events/unknown-event.js';
import { InvalidRunExportError } from './invalid-run-export-error.js';

/**
 * A run exported to a file (format janus-run v1): written by the console, read back by the
 * console's offline replay and by `pnpm run:replay`.
 */
export interface RunExport {
  readonly format: 'janus-run';
  readonly version: 1;
  readonly runId: string;
  readonly exportedAt: string;
  readonly events: readonly (JanusEvent | UnknownEvent)[];
}

const runExportSchema = z.object({
  format: z.literal('janus-run'),
  version: z.literal(1),
  runId: z.ulid(),
  exportedAt: z.string(),
  events: z.array(z.unknown()),
});

export function buildRunExport(
  runId: string,
  events: readonly (JanusEvent | UnknownEvent)[],
  now: Date = new Date(),
): RunExport {
  return { format: 'janus-run', version: 1, runId, exportedAt: now.toISOString(), events };
}

/**
 * Parses an exported run. Every event is validated; unknown event types are kept as is.
 * Throws InvalidRunExportError when the text is not a janus-run v1 file of a single run.
 */
export function parseRunExport(text: string): {
  runId: string;
  events: (JanusEvent | UnknownEvent)[];
} {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new InvalidRunExportError('Not valid JSON.');
  }
  const header = runExportSchema.safeParse(raw);
  if (!header.success) {
    throw new InvalidRunExportError('Not an exported Janus run (format janus-run v1).');
  }
  const events = header.data.events.map((candidate, index) => {
    try {
      return parseEvent(candidate);
    } catch (error) {
      const detail = error instanceof InvalidEventError ? error.message : String(error);
      throw new InvalidRunExportError(`Event ${String(index)} is not valid: ${detail}`);
    }
  });
  const foreign = events.find((event) => event.runId !== header.data.runId);
  if (foreign !== undefined) {
    throw new InvalidRunExportError(`Event seq ${String(foreign.seq)} belongs to another run.`);
  }
  return { runId: header.data.runId, events };
}
