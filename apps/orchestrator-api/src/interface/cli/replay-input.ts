import { InvalidRunExportError, parseRunExport } from '@janus/shared-kernel';
import { z } from 'zod';

import type { StoredEvent } from '../../domain/event-store/stored-event.js';

export interface ReplayRun {
  readonly runId: string;
  readonly source: 'file' | 'database';
  readonly events: readonly StoredEvent[];
}

export interface ReplayInputDeps {
  /** File contents, or null when no file exists at that path. */
  readTextFile(path: string): Promise<string | null>;
  readRun(runId: string): Promise<StoredEvent[]>;
}

export class ReplayInputError extends Error {
  override readonly name = 'ReplayInputError';
}

const runIdSchema = z.ulid();

/**
 * Resolves the `pnpm run:replay` argument: an exported janus-run file if one exists at that
 * path, otherwise a run id read from the event store. Never calls an LLM.
 */
export async function loadReplayRun(arg: string, deps: ReplayInputDeps): Promise<ReplayRun> {
  const text = await deps.readTextFile(arg);
  if (text !== null) {
    try {
      const run = parseRunExport(text);
      return { runId: run.runId, source: 'file', events: run.events };
    } catch (error) {
      if (error instanceof InvalidRunExportError) {
        throw new ReplayInputError(`${arg}: ${error.message}`);
      }
      throw error;
    }
  }
  if (!runIdSchema.safeParse(arg).success) {
    throw new ReplayInputError(`${arg} is neither a file nor a run id (ULID).`);
  }
  const events = await deps.readRun(arg);
  if (events.length === 0) throw new ReplayInputError(`Run ${arg} has no events.`);
  return { runId: arg, source: 'database', events };
}
