// `pnpm run:report <runId|file> [--json] [--target=<the run's own>]`: the SynthLab report of a run
// (F1.10), from the event store or from an exported janus-run file. Computed from recorded
// events only; never calls an LLM. --json prints the full report (janus-synthlab-report v1).

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSynthlabReport } from '@janus/synthlab-report';

import { PostgresEventStore } from '../../infrastructure/event-store/postgres-event-store.js';
import {
  loadFunnelsConfig,
  repoFunnelsConfigPath,
} from '../../infrastructure/report/funnels-config.js';
import { formatReport } from './format-report.js';
import { loadReplayRun, ReplayInputError } from './replay-input.js';
import { runTarget } from '../../domain/run/run-target.js';

const envFile = fileURLToPath(new URL('../../../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const args = process.argv.slice(2);
const json = args.includes('--json');
const asked = args.find((arg) => arg.startsWith('--target='))?.slice('--target='.length);
const source = args.find((arg) => !arg.startsWith('--'));
if (source === undefined) {
  console.error('Usage: pnpm run:report <runId|file> [--json] [--target=shoplab]');
  process.exit(2);
}

// pnpm runs root scripts from the repository root; resolve files against where it was invoked.
const cwd = process.env.INIT_CWD ?? process.cwd();
let store: PostgresEventStore | undefined;

try {
  const run = await loadReplayRun(source, {
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
  // The run's own target (F3.5); ShopLab for runs recorded before targets were.
  const target = asked ?? runTarget(run.events) ?? 'shoplab';
  const config = (await loadFunnelsConfig(repoFunnelsConfigPath()))[target];
  if (config === undefined)
    throw new ReplayInputError(`config/funnels.yaml has no target ${target}.`);
  const report = buildSynthlabReport(run.runId, run.events, config);
  console.log(json ? JSON.stringify(report, null, 2) : formatReport(report));
} catch (error) {
  if (!(error instanceof ReplayInputError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await store?.close();
}
