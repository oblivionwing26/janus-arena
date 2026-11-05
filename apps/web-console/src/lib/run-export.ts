import { InvalidEventError, parseEvent } from '@janus/shared-kernel';
import { z } from 'zod';

import type { ConsoleEvent } from './console-event';

export interface RunExport {
  readonly format: 'janus-run';
  readonly version: 1;
  readonly runId: string;
  readonly exportedAt: string;
  readonly events: readonly ConsoleEvent[];
}

const exportSchema = z.object({
  format: z.literal('janus-run'),
  version: z.literal(1),
  runId: z.ulid(),
  exportedAt: z.string(),
  events: z.array(z.unknown()),
});

export class RunExportError extends Error {
  override readonly name = 'RunExportError';
}

export function buildRunExport(
  runId: string,
  events: readonly ConsoleEvent[],
  now: Date = new Date(),
): RunExport {
  return { format: 'janus-run', version: 1, runId, exportedAt: now.toISOString(), events };
}

/** Parses an exported run. Every event is validated; unknown event types are kept as is. */
export function parseRunExport(text: string): { runId: string; events: ConsoleEvent[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new RunExportError('El fichero no es JSON válido.');
  }
  const header = exportSchema.safeParse(raw);
  if (!header.success) {
    throw new RunExportError('El fichero no es un run exportado de Janus (format janus-run v1).');
  }
  const events = header.data.events.map((candidate, index) => {
    try {
      return parseEvent(candidate);
    } catch (error) {
      const detail = error instanceof InvalidEventError ? error.message : String(error);
      throw new RunExportError(`El evento ${String(index)} no es válido: ${detail}`);
    }
  });
  const foreign = events.find((event) => event.runId !== header.data.runId);
  if (foreign !== undefined) {
    throw new RunExportError(`El evento seq ${String(foreign.seq)} pertenece a otro run.`);
  }
  return { runId: header.data.runId, events };
}
