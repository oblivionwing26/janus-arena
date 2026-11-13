// `pnpm demo:export` (F3.12): writes the runs of the public demo (config/demo.yaml) from the event
// log to apps/web-console/public/demo: one file per run, the PoCs of its confirmed findings, and
// an index with the stories and the report settings. The console built with NEXT_PUBLIC_DEMO=1
// reads only these files. Nothing is written if any file carries a credential or a real address.

import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildRunExport, isKnownEvent, proofOfConceptSchema } from '@janus/shared-kernel';

import { planDemo } from '../../application/demo/plan-demo.js';
import { pocKey } from '../../application/red-team/run-red-team.js';
import { summarizeRun } from '../../domain/event-store/run-summary.js';
import { FileArtifactStore } from '../../infrastructure/artifacts/file-artifact-store.js';
import { loadDemoStories, repoDemoConfigPath } from '../../infrastructure/demo/demo-config.js';
import { scanForSecrets } from '../../infrastructure/demo/scan-secrets.js';
import { PostgresEventStore } from '../../infrastructure/event-store/postgres-event-store.js';
import {
  loadFunnelsConfig,
  repoFunnelsConfigPath,
} from '../../infrastructure/report/funnels-config.js';

const root = fileURLToPath(new URL('../../../../../', import.meta.url));
if (existsSync(`${root}.env`)) process.loadEnvFile(`${root}.env`);
const out = `${root}apps/web-console/public/demo`;
/** The synthetic domains of the project's own targets, and Juice Shop's published demo admin. */
const SYNTHETIC_DOMAINS = ['janus.test', 'shoplab.test', 'shop.test', 'juice-sh.op'];

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl === '') {
  throw new Error('DATABASE_URL is not set (see .env.example)');
}
const store = await PostgresEventStore.connect(databaseUrl);
try {
  const plan = await planDemo(await loadDemoStories(repoDemoConfigPath()), store);
  const artifacts = new FileArtifactStore();

  const files = new Map<string, string>();
  for (const [runId, events] of plan.runs) {
    files.set(`runs/${runId}.json`, JSON.stringify(buildRunExport(runId, events)));
    for (const event of events.filter(isKnownEvent)) {
      if (event.type !== 'finding.confirmed') continue;
      const bytes = await artifacts.get(runId, pocKey(event.payload.findingId)).catch(() => null);
      if (bytes === null) continue;
      const poc = proofOfConceptSchema.parse(JSON.parse(new TextDecoder().decode(bytes)));
      files.set(`pocs/${runId}/${event.payload.findingId}.json`, JSON.stringify(poc));
    }
  }
  const summaries = [...plan.runs.values()].flatMap((events) => summarizeRun(events) ?? []);
  files.set(
    'index.json',
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      featured: plan.featured,
      runs: summaries.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
      reports: await loadFunnelsConfig(repoFunnelsConfigPath()),
    }),
  );

  // Nothing is written until every file is clean.
  let dirty = false;
  for (const [path, text] of files) {
    for (const finding of scanForSecrets(text, SYNTHETIC_DOMAINS)) {
      dirty = true;
      console.error(`${path}: ${finding.pattern} ×${String(finding.count)}`);
    }
  }
  if (dirty) {
    console.error('Not exported: the files above carry what a public demo must not.');
    process.exitCode = 1;
  } else {
    await rm(out, { recursive: true, force: true });
    let bytes = 0;
    for (const [path, text] of files) {
      await mkdir(dirname(join(out, path)), { recursive: true });
      await writeFile(join(out, path), text);
      bytes += text.length;
    }
    console.log(
      `Demo exported to apps/web-console/public/demo: ${String(plan.runs.size)} runs, ${String(files.size)} files, ${(bytes / 1_000_000).toFixed(1)} MB`,
    );
    for (const story of plan.featured) console.log(`  ${story.runId}  ${story.title}`);
  }
} finally {
  await store.close();
}
