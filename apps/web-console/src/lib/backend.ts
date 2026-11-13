import {
  isKnownEvent,
  proofOfConceptSchema,
  synthlabReportSchema,
  type ProofOfConcept,
  type SynthlabReport,
} from '@janus/shared-kernel';
import { buildSynthlabReport, reportConfigSchema, type ReportConfig } from '@janus/synthlab-report';
import { z } from 'zod';

import type { ConsoleEvent } from './console-event';
import { DEMO } from './demo';
import { fetchRunEvents } from './run-events';

/**
 * Where the console gets its data (F3.12). Normally it is the orchestrator, through the console's
 * own origin. Built with `NEXT_PUBLIC_DEMO=1` it is a folder of recorded runs under `/demo`
 * served with the page itself: no backend, no keys, nothing to start. The report is then
 * computed in the browser with the same pure function the orchestrator uses.
 */
export { DEMO };

export interface BackendOptions {
  readonly demo?: boolean;
  readonly fetchImpl?: typeof fetch;
}

const fetcherOf = (options: BackendOptions): typeof fetch =>
  options.fetchImpl ?? ((input, init) => fetch(input, init));

export interface RunRow {
  readonly runId: string;
  readonly startedAt: string;
  readonly eventCount: number;
  readonly status: 'running' | 'completed';
  readonly outcome: string | null;
  readonly reason: string | null;
}

const runRowSchema = z.object({
  runId: z.string(),
  startedAt: z.string(),
  eventCount: z.number(),
  status: z.enum(['running', 'completed']),
  outcome: z.string().nullable(),
  reason: z.string().nullable(),
});

/** One of the stories the demo opens with: a run and the pages that show it best. */
export const featuredRunSchema = z.object({
  runId: z.string(),
  title: z.string(),
  summary: z.string(),
  links: z.array(z.object({ label: z.string(), href: z.string() })),
});
export type FeaturedRun = z.infer<typeof featuredRunSchema>;

/** `public/demo/index.json`, written by `pnpm demo:export`. */
const demoIndexSchema = z.object({
  generatedAt: z.string(),
  featured: z.array(featuredRunSchema),
  runs: z.array(runRowSchema),
  /** Report settings per target (config/funnels.yaml), for the report computed in the browser. */
  reports: z.record(z.string(), reportConfigSchema),
});
export type DemoIndex = z.infer<typeof demoIndexSchema>;

async function demoJson(path: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(`/demo/${path}`);
  if (!response.ok)
    throw new Error(`No hay datos de demo para ${path} (${String(response.status)})`);
  return response.json();
}

export async function fetchDemoIndex(options: BackendOptions = {}): Promise<DemoIndex> {
  return demoIndexSchema.parse(await demoJson('index.json', fetcherOf(options)));
}

/** The runs the backend lists. */
export async function listRuns(options: BackendOptions = {}): Promise<RunRow[]> {
  if (options.demo ?? DEMO) return (await fetchDemoIndex(options)).runs;
  const response = await fetcherOf(options)('/api/orchestrator/runs', { cache: 'no-store' });
  if (!response.ok) throw new Error(`El orquestador respondió ${String(response.status)}`);
  return ((await response.json()) as { runs: RunRow[] }).runs;
}

/** The target a run played: the one it recorded, ShopLab for runs recorded before targets were. */
export function targetOf(events: readonly ConsoleEvent[]): string {
  for (const event of events) {
    if (isKnownEvent(event) && event.type === 'run.started') {
      return event.payload.target ?? 'shoplab';
    }
  }
  return 'shoplab';
}

/** The SynthLab report of a run: from the orchestrator, or computed here in the demo. */
export async function fetchReport(
  runId: string,
  options: BackendOptions = {},
): Promise<SynthlabReport> {
  const fetchImpl = fetcherOf(options);
  if (options.demo ?? DEMO) {
    const [events, index] = await Promise.all([
      fetchRunEvents(runId, options.fetchImpl, { demo: true }),
      fetchDemoIndex(options),
    ]);
    const target = targetOf(events);
    const config: ReportConfig | undefined = index.reports[target];
    if (config === undefined) throw new Error(`La demo no tiene ajustes de informe para ${target}`);
    return synthlabReportSchema.parse(buildSynthlabReport(runId, events, config));
  }
  const response = await fetchImpl(`/api/orchestrator/runs/${runId}/report`);
  if (!response.ok) throw new Error(`El orquestador respondió ${String(response.status)}`);
  return synthlabReportSchema.parse(await response.json());
}

/** The PoC of a confirmed finding, for the attack graph's side panel. */
export async function fetchPoc(
  runId: string,
  findingId: string,
  options: BackendOptions = {},
): Promise<ProofOfConcept> {
  const path =
    (options.demo ?? DEMO)
      ? `/demo/pocs/${runId}/${findingId}.json`
      : `/api/orchestrator/runs/${runId}/pocs/${findingId}`;
  const response = await fetcherOf(options)(path);
  if (!response.ok) throw new Error(`El orquestador respondió ${String(response.status)}`);
  return proofOfConceptSchema.parse(await response.json());
}
