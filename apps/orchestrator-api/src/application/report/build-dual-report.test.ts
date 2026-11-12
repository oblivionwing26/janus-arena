import { newUlid, parseEvent, type ProofOfConcept } from '@janus/shared-kernel';
import { reportConfigSchema } from '@janus/synthlab-report';
import { describe, expect, it } from 'vitest';

import type { StoredEvent } from '../../domain/event-store/stored-event.js';
import { buildDualReport } from './build-dual-report.js';

const RED = '01JC0F2JB7E0000000000000RT';
const BLUE = '01JC0F2JB7E0000000000000BT';
const UX = '01JC0F2JB7E0000000000000XA';
const FINDING = '01JC0F2JB7E0000000000000FF';
const PATCH = '01JC0F2JB7E0000000000000PA';

function log(runId: string) {
  let seq = 0;
  const events: StoredEvent[] = [];
  const add = (agentId: string, type: string, payload: unknown, eur?: number) => {
    events.push(
      parseEvent({
        id: newUlid(),
        runId,
        seq: seq++,
        ts: '2026-11-12T10:00:00.000Z',
        schemaVersion: 1,
        actor: { agentId, role: agentId === 'orchestrator' ? 'orchestrator' : 'navigator' },
        type,
        payload,
        ...(eur === undefined
          ? {}
          : {
              cost: {
                inputTokens: 1,
                outputTokens: 1,
                cacheReadInputTokens: 0,
                cacheCreationInputTokens: 0,
                estimatedEur: eur,
              },
            }),
      }),
    );
  };
  return { events, add };
}

const POC: ProofOfConcept = {
  version: 1,
  target: 'juice-shop',
  class: 'idor',
  oracle: 'canary-leak',
  endpoint: 'GET /rest/basket/:id',
  steps: { kind: 'idor', method: 'GET', route: '/rest/basket/:id', bind: { victim: 'basketId' } },
};

function runs() {
  const red = log(RED);
  red.add('orchestrator', 'finding.created', {
    findingId: FINDING,
    kind: 'dynamic',
    severity: 'high',
    title: 'Another user’s data is reachable (IDOR)',
    status: 'suspected',
    tool: 'red-team',
  });
  red.add('orchestrator', 'finding.confirmed', {
    findingId: FINDING,
    pocRef: `poc/${FINDING}.json`,
    evidence: 'canary leaked',
  });
  const blue = log(BLUE);
  blue.add('orchestrator', 'patch.proposed', {
    patchId: PATCH,
    author: 'blue-team',
    findingId: FINDING,
    branch: `janus/fix-${FINDING}`,
    diff: '--- a/routes/basket.ts\n+++ b/routes/basket.ts\n',
  });
  for (const verifier of ['poc-replay', 'regression-tests', 'synthlab-rerun']) {
    blue.add('orchestrator', 'verification.result', {
      patchId: PATCH,
      verifier,
      passed: true,
      details: `${verifier} ok`,
    });
  }
  blue.add('orchestrator', 'finding.remediated', {
    findingId: FINDING,
    status: 'fixed',
    iterations: 1,
    patchId: PATCH,
    branch: `janus/fix-${FINDING}`,
  });
  blue.add(
    'blue-team-x',
    'llm.call',
    { role: 'blue-team', model: 'claude-sonnet-5-5', durationMs: 1, requestHash: 'sha256:abc' },
    0.03,
  );
  const ux = log(UX);
  for (const variant of ['a', 'b']) {
    ux.add(`carmen-${variant}`, 'session.started', {
      variant,
      kind: 'persona',
      persona: 'carmen-retired',
      seed: 1,
      attempt: 1,
    });
    ux.add(`carmen-${variant}`, 'session.ended', { outcome: 'success', steps: 9, durationMs: 1 });
  }
  return { red: red.events, blue: blue.events, ux: ux.events };
}

describe('buildDualReport (F3.7)', () => {
  const { red, blue, ux } = runs();
  const report = buildDualReport({
    target: 'juice-shop',
    janusCommit: 'a'.repeat(40),
    tools: { node: 'v24.12.0' },
    runs: [
      { runId: UX, role: 'ux', events: ux },
      { runId: RED, role: 'red-team', events: red },
      { runId: BLUE, role: 'blue-team', events: blue },
    ],
    pocs: [{ findingId: FINDING, poc: POC }],
    tradeoffs: [],
    eventLogs: { [UX]: '1'.repeat(64), [RED]: '2'.repeat(64), [BLUE]: '3'.repeat(64) },
    reportConfig: reportConfigSchema.parse({ funnel: [{ name: 'Inicio', route: '/' }] }),
  });

  it('carries the A/B of the UX run', () => {
    expect(report.ux).toMatchObject({
      runId: UX,
      variants: [
        { variant: 'a', personas: { successes: 1, n: 1 } },
        { variant: 'b', personas: { successes: 1, n: 1 } },
      ],
    });
  });

  it('lists each finding with its status after confirmation, and its PoC', () => {
    expect(report.findings).toEqual([
      {
        findingId: FINDING,
        runId: RED,
        kind: 'dynamic',
        severity: 'high',
        title: 'Another user’s data is reachable (IDOR)',
        status: 'confirmed',
        where: 'GET /rest/basket/:id',
        tool: 'red-team',
      },
    ]);
    expect(report.pocs).toEqual([{ findingId: FINDING, poc: POC }]);
  });

  it('gives each fix its status, patch and verifications', () => {
    expect(report.fixes).toEqual([
      {
        runId: BLUE,
        findingId: FINDING,
        status: 'fixed',
        iterations: 1,
        branch: `janus/fix-${FINDING}`,
        patchId: PATCH,
        diff: '--- a/routes/basket.ts\n+++ b/routes/basket.ts\n',
        verifications: [
          { verifier: 'poc-replay', passed: true, details: 'poc-replay ok' },
          { verifier: 'regression-tests', passed: true, details: 'regression-tests ok' },
          { verifier: 'synthlab-rerun', passed: true, details: 'synthlab-rerun ok' },
        ],
      },
    ]);
  });

  it('adds up the cost of every run and lists every event log hash', () => {
    expect(report.cost.totalEur).toBeCloseTo(0.03, 6);
    expect(report.cost.runs.map((run) => run.role)).toEqual(['ux', 'red-team', 'blue-team']);
    expect(report.eventLogs).toEqual([
      { runId: UX, sha256: '1'.repeat(64) },
      { runId: RED, sha256: '2'.repeat(64) },
      { runId: BLUE, sha256: '3'.repeat(64) },
    ]);
  });
});
