import type { ReportConfig } from '@janus/synthlab-report';

import { RunEventRecorder } from '../../application/run-event-recorder.js';
import { ORCHESTRATOR_ACTOR } from '../../application/start-run.js';
import { isRunCompleted } from '../../domain/event-store/run-summary.js';
import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { GateStageContext } from '../../domain/gate/gate-stage-port.js';
import type { LLMGatewayPort } from '../../domain/llm/llm-gateway-port.js';
import type { RunConfig } from '../../domain/run/run-config.js';
import type { CompletedRun, SynthLabPort } from '../../domain/run/synthlab-port.js';
import type { PlaywrightBrowserAttack } from '../../infrastructure/attack/playwright-browser-attack.js';
import type { DockerCli } from '../../infrastructure/sandbox/docker-cli.js';
import type { DockerSandbox } from '../../infrastructure/sandbox/docker-sandbox.js';
import type { PlaywrightScopedHttp } from '../../infrastructure/scope/playwright-scoped-http.js';
import type { GateFile } from './gate-file.js';

/** What the gate's stages are wired with (F3.9): one of each, built by `pnpm run:gate`. */
export interface GateDeps {
  readonly root: string;
  readonly gate: GateFile;
  /** The gate file's run file: its first variant is A. */
  readonly config: RunConfig;
  readonly report: ReportConfig;
  readonly store: EventStorePort;
  readonly synthlab: SynthLabPort;
  readonly gateway: LLMGatewayPort;
  readonly docker: DockerCli;
  readonly sandbox: DockerSandbox;
  readonly http: PlaywrightScopedHttp;
  readonly browser: PlaywrightBrowserAttack;
}

/** A SynthLab run with no event for this long is taken as dead (the API was restarted). */
const STALE_MS = 15 * 60_000;

/** A stage's budget as limits, refusing to start when nothing is left. */
export function limitsFor(
  stage: string,
  context: GateStageContext,
  maxTokens = 5_000_000,
): { maxTokens: number; maxEur: number } {
  if (context.allowanceEur < 0.01) {
    throw new Error(
      `No budget left for ${stage} (${context.allowanceEur.toFixed(2)} €): raise budget.maxEur in the gate file and resume`,
    );
  }
  return { maxTokens, maxEur: context.allowanceEur };
}

/**
 * A SynthLab run for a stage (F3.9): one an interrupted attempt started is awaited if it is
 * still alive on the orchestrator, or reused if it completed; otherwise a new one starts with
 * the stage's budget, never more than the run file's.
 */
export async function playOrResume(
  deps: Pick<GateDeps, 'store' | 'synthlab'>,
  context: GateStageContext,
  config: RunConfig,
  stage: string,
): Promise<CompletedRun> {
  for (const runId of context.interrupted) {
    const events = await deps.store.readRun(runId);
    const last = events.at(-1);
    if (last === undefined) continue;
    if (events.some(isRunCompleted)) return { runId, events };
    if (Date.now() - Date.parse(last.ts) < STALE_MS) return deps.synthlab.waitFor(runId);
    await new RunEventRecorder(deps.store, runId, ORCHESTRATOR_ACTOR, {
      startSeq: last.seq + 1,
    }).record('run.completed', {
      outcome: 'error',
      reason: `interrupted: no event for ${String(STALE_MS / 60_000)} minutes, gate ${context.gateRunId} started it again`,
    });
  }
  const limits = limitsFor(stage, context, config.budget.maxTokens);
  return deps.synthlab.runAndWait(
    { ...config, budget: { ...limits, maxEur: Math.min(limits.maxEur, config.budget.maxEur) } },
    { onStarted: context.onRun },
  );
}

/** A string output, or an error naming the stage that should have handed it on. */
export function outputOf(
  context: GateStageContext,
  stage: Parameters<GateStageContext['outputs']['get']>[0],
  key: string,
): string | undefined {
  const value = context.outputs.get(stage)?.[key];
  return typeof value === 'string' ? value : undefined;
}
