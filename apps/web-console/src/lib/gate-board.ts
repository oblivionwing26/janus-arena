// The pipeline's gate board: each stage of a real gate as its own event log recorded it, with
// when it ran, what it spent of its allowance, the runs it started or why it was skipped.

import {
  GATE_STAGES,
  isKnownEvent,
  type GateStageName,
  type JanusEvent,
  type UnknownEvent,
} from '@janus/shared-kernel';

export type StageStatus = 'completed' | 'skipped' | 'failed' | 'open';

export interface GateStageRow {
  stage: GateStageName;
  status: StageStatus;
  /** Seconds from the gate's start to the stage's start, and how long it took. */
  at: number;
  seconds: number;
  allowanceEur: number | null;
  spentEur: number | null;
  runIds: string[];
  reason: string | null;
  /** The pull request the `pr` stage opened, when it opened one. */
  pr: { url: string; number: number } | null;
}

export interface GateTrack {
  gateRunId: string;
  target: string;
  budgetEur: number;
  seconds: number;
  spentEur: number;
  stages: GateStageRow[];
}

const seconds = (from: string, to: string) =>
  Math.round((Date.parse(to) - Date.parse(from)) / 1000);

/** Reads a gate run's events into one row per stage, in the gate's order. */
export function readGate(
  gateRunId: string,
  events: readonly (JanusEvent | UnknownEvent)[],
): GateTrack {
  const known = events.filter(isKnownEvent);
  const started = known.find((e) => e.type === 'run.started');
  const last = events.at(-1);
  if (!started || started.type !== 'run.started' || !last) {
    throw new Error(`run ${gateRunId} has no run.started event`);
  }
  const t0 = started.ts;
  const rows = new Map<GateStageName, GateStageRow>();
  const opened = new Map<GateStageName, string>();

  for (const e of known) {
    if (e.type !== 'gate.stage') continue;
    const p = e.payload;
    let row = rows.get(p.stage);
    if (!row) {
      row = {
        stage: p.stage,
        status: 'open',
        at: seconds(t0, e.ts),
        seconds: 0,
        allowanceEur: null,
        spentEur: null,
        runIds: [],
        reason: null,
        pr: null,
      };
      rows.set(p.stage, row);
    }
    if (p.status === 'started') {
      opened.set(p.stage, e.ts);
      row.allowanceEur = p.allowanceEur ?? null;
    } else if (p.status === 'run' && p.runId) {
      row.runIds.push(p.runId);
    } else if (p.status === 'run') {
      continue;
    } else {
      row.status = p.status;
      row.seconds = seconds(opened.get(p.stage) ?? e.ts, e.ts);
      row.spentEur = p.spentEur ?? (p.status === 'completed' ? 0 : null);
      row.reason = p.reason ?? null;
      const url = p.output?.['url'];
      const number = p.output?.['number'];
      if (p.stage === 'pr' && typeof url === 'string' && typeof number === 'number') {
        row.pr = { url, number };
      }
    }
  }

  const stages = GATE_STAGES.flatMap((s) => {
    const r = rows.get(s);
    return r ? [r] : [];
  });
  return {
    gateRunId,
    target: started.payload.target ?? 'unknown',
    budgetEur: started.payload.budget.maxEur,
    seconds: seconds(t0, last.ts),
    spentEur: stages.reduce((sum, r) => sum + (r.spentEur ?? 0), 0),
    stages,
  };
}

/** "6 min 55 s", "13 s", "0 s". */
export function formatDuration(s: number): string {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m === 0 ? `${r} s` : `${m} min ${String(r).padStart(2, '0')} s`;
}

/** "0.21 €"; amounts under a cent read "< 0.01 €" and nothing reads "0 €" when it was spent. */
export function formatEur(eur: number): string {
  if (eur === 0) return '0 €';
  if (eur < 0.01) return '< 0.01 €';
  return `${eur.toFixed(2)} €`;
}
