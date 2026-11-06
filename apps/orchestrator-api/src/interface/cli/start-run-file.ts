// `pnpm run:start <runs/file.yaml>`: validates a run file and starts it on the orchestrator
// (POST /runs). The orchestrator must be running (`pnpm dev`); ORCHESTRATOR_URL overrides
// where it is (http://127.0.0.1:3011 by default).

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parse } from 'yaml';
import { z } from 'zod';

import { runConfigBodySchema } from '../http/start-run-body.js';

const file = process.argv[2];
if (file === undefined) {
  console.error('Usage: pnpm run:start <runs/file.yaml>');
  process.exit(2);
}

// pnpm runs root scripts from the repository root; resolve the file where it was invoked.
const path = resolve(process.env.INIT_CWD ?? process.cwd(), file);
const parsed = runConfigBodySchema.safeParse(parse(await readFile(path, 'utf8')));
if (!parsed.success) {
  console.error(`${file} is not a valid run file:\n${z.prettifyError(parsed.error)}`);
  process.exit(1);
}

const orchestrator = (process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:3011').replace(/\/$/, '');
// The API may be restarting under `pnpm dev`: retry the connection for a few seconds.
async function post(body: unknown): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fetch(`${orchestrator}/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (error) {
      if (attempt >= 10) {
        console.error(`Cannot reach the orchestrator at ${orchestrator}: is pnpm dev running?`);
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
const response = await post(parsed.data);
const body = await response.text();
if (!response.ok) {
  console.error(`The orchestrator refused the run (${String(response.status)}): ${body}`);
  process.exit(1);
}
const { runId } = z.object({ runId: z.string() }).parse(JSON.parse(body));
const sessions =
  (parsed.data.personas.length + 1) * parsed.data.seeds.length * parsed.data.variants.length;
console.log(
  `Run ${runId} started: ${String(sessions)} sessions on ${String(parsed.data.variants.length)} variants.`,
);
console.log(`Console: http://127.0.0.1:3012/runs/${runId}`);
