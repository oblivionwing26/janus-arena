// `pnpm run:launch-day <runId|file>... [--out <dir>]`: the Launch Day report (F4.1c) of one or
// more runs, from the event store or from exported janus-run files. Computed from recorded events
// only; never calls an LLM. Prints the Markdown; with --out it writes launch-day-shoplab.md and
// .json there.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PostgresEventStore } from '../../infrastructure/event-store/postgres-event-store.js';
import {
  formatLaunchDay,
  launchDayRunOf,
  type LaunchDayReport,
  type LaunchDayRun,
} from './format-launch-day.js';
import { loadReplayRun, ReplayInputError } from './replay-input.js';

const envFile = fileURLToPath(new URL('../../../../../.env', import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt === -1 ? undefined : args[outAt + 1];
const sources = args.filter(
  (arg, index) => !arg.startsWith('--') && (outAt === -1 || index !== outAt + 1),
);
if (sources.length === 0 || (outAt !== -1 && out === undefined)) {
  console.error('Usage: pnpm run:launch-day <runId|file>... [--out <dir>]');
  process.exit(2);
}

const cwd = process.env.INIT_CWD ?? process.cwd();
let store: PostgresEventStore | undefined;

try {
  const runs: LaunchDayRun[] = [];
  for (const source of sources) {
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
        store ??= await PostgresEventStore.connect(url);
        return store.readRun(runId);
      },
    });
    runs.push(launchDayRunOf(run.runId, run.events));
  }
  const report: LaunchDayReport = { format: 'janus-launch-day-report', version: 1, runs };
  const markdown = formatLaunchDay(report);
  if (out === undefined) {
    console.log(markdown);
  } else {
    const dir = resolve(cwd, out);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'launch-day-shoplab.md'), `${markdown}\n`);
    await writeFile(join(dir, 'launch-day-shoplab.json'), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Wrote ${join(dir, 'launch-day-shoplab.md')} and .json`);
  }
} catch (error) {
  if (!(error instanceof ReplayInputError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await store?.close();
}
