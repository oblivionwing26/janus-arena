// Builds synthetic runs for report tests, in the order the orchestrator records them: a
// session.started per slot, steps (agent.action then agent.step), signals at the end.
// Not part of the build.

import { newUlid, parseEvent, type JanusEvent } from '@janus/shared-kernel';

export const RUN_ID = '01JC0F110RP0000000000000AA';
const BASE = 'http://janus-r-test-a-app:3100';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class ReportRun {
  private readonly all: JanusEvent[] = [];
  private seq = 0;
  private clock = Date.UTC(2026, 10, 6, 10, 0, 0);

  events(): JanusEvent[] {
    return [...this.all];
  }

  emit(
    agentId: string,
    role: string,
    type: string,
    payload: unknown,
    cost?: Record<string, number>,
  ): JanusEvent {
    this.clock += 1000;
    const event = parseEvent({
      id: newUlid(),
      runId: RUN_ID,
      seq: this.seq++,
      ts: new Date(this.clock).toISOString(),
      schemaVersion: 1,
      actor: { agentId, role },
      type,
      payload,
      ...(cost === undefined ? {} : { cost }),
    }) as JanusEvent;
    this.all.push(event);
    return event;
  }

  session(
    agentId: string,
    slot: { variant?: string; kind?: 'persona' | 'baseline'; persona?: string; seed?: number } = {},
  ): ReportSession {
    const kind = slot.kind ?? 'persona';
    this.emit(
      agentId,
      kind === 'baseline' ? 'competent-baseline' : 'navigator',
      'session.started',
      {
        variant: slot.variant ?? 'a',
        kind,
        ...(kind === 'persona' ? { persona: slot.persona ?? agentId.split('-')[0] } : {}),
        seed: slot.seed ?? 1,
        attempt: 1,
      },
    );
    return new ReportSession(
      this,
      agentId,
      kind === 'baseline' ? 'competent-baseline' : 'navigator',
    );
  }

  signal(
    agentId: string,
    detector: string,
    severity: 'low' | 'medium' | 'high',
    evidence: readonly JanusEvent[],
    at: { stepIndex?: number; path?: string } = {},
  ): JanusEvent {
    return this.emit('orchestrator', 'orchestrator', 'friction.signal', {
      detector,
      severity,
      evidenceEventIds: evidence.map((event) => event.id),
      agentId,
      ...(at.stepIndex === undefined ? {} : { stepIndex: at.stepIndex }),
      ...(at.path === undefined ? {} : { url: BASE + at.path }),
    });
  }
}

export class ReportSession {
  private stepIndex = 0;

  constructor(
    private readonly run: ReportRun,
    readonly agentId: string,
    private readonly role: string,
  ) {}

  /** One step on `path`; with `selector`, the action targets that element at `box`. */
  step(
    path: string,
    action: { action?: string; selector?: string; box?: Box } = {},
  ): { action: JanusEvent; step: JanusEvent; stepIndex: number } {
    const stepIndex = this.stepIndex++;
    const actionEvent = this.run.emit(this.agentId, this.role, 'agent.action', {
      stepIndex,
      action: action.action ?? 'click',
      ...(action.selector === undefined ? {} : { selector: action.selector }),
      ...(action.box === undefined ? {} : { boundingBox: action.box }),
      durationMs: 100,
      ok: true,
    });
    const step = this.run.emit(this.agentId, this.role, 'agent.step', {
      stepIndex,
      url: BASE + path,
      durationMs: 3000,
    });
    return { action: actionEvent, step, stepIndex };
  }

  screenshot(stepIndex: number, path: string, detector = 'dead-click'): JanusEvent {
    return this.run.emit(this.agentId, this.role, 'page.screenshot', {
      stepIndex,
      url: BASE + path,
      artifact: `${this.agentId}/step-${String(stepIndex)}.png`,
      detector,
    });
  }

  llmCall(eur: number, tokens: { input: number; output: number; read?: number; write?: number }) {
    return this.run.emit(
      this.agentId,
      this.role,
      'llm.call',
      { role: this.role, model: 'claude-test', durationMs: 900 },
      {
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        cacheReadInputTokens: tokens.read ?? 0,
        cacheCreationInputTokens: tokens.write ?? 0,
        estimatedEur: eur,
      },
    );
  }

  end(outcome: 'success' | 'abandon' | 'patience_exhausted' | 'budget_exhausted'): JanusEvent {
    return this.run.emit(this.agentId, this.role, 'session.ended', {
      outcome,
      steps: this.stepIndex,
      durationMs: 3000 * this.stepIndex,
    });
  }
}
