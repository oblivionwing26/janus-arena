// `pnpm run:replay <runId|file> [--json]`: replays a recorded run as text, from the event
// store or from an exported janus-run file. Reads recorded events only; never calls an LLM.
// --json prints the run as a janus-run export instead (the same file the console writes).

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRunExport } from '@janus/shared-kernel';

import { PostgresEventStore } from '../../infrastructure/event-store/postgres-event-store.js';
import { formatReplay } from './format-replay.js';
import { loadReplayRun, ReplayInputError } from './replay-input.js';

const envFile = fileURLToPath(new URL('../../../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const args = process.argv.slice(2);
const json = args.includes('--json');
const target = args.find((arg) => !arg.startsWith('--'));
if (target === undefined) {
  console.error('Usage: pnpm run:replay <runId|file> [--json]');
  process.exit(2);
}

// pnpm runs root scripts from the repository root; resolve files against where it was invoked.
const cwd = process.env.INIT_CWD ?? process.cwd();
let store: PostgresEventStore | undefined;

try {
  const run = await loadReplayRun(target, {
    readTextFile: async (path) => {
      const full = resolve(cwd, path);
      return existsSync(full) ? readFile(full, 'utf8') : null;
    },
    readRun: async (runId) => {
      const url = process.env.DATABASE_URL;
      if (url === undefined || url === '') {
        throw new ReplayInputError('DATABASE_URL is not set (see .env.example).');
      }
      store = await PostgresEventStore.connect(url);
      return store.readRun(runId);
    },
  });
  console.log(
    json ? JSON.stringify(buildRunExport(run.runId, run.events), null, 2) : formatReplay(run),
  );
} catch (error) {
  if (!(error instanceof ReplayInputError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await store?.close();
}
