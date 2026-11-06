// Builds synthetic runs for detector tests, in the order the navigator loop emits events:
// for each step, agent.action then agent.step (with the page the action happened on).
// Not part of the build.

import { newUlid, parseEvent, type JanusEvent } from '@janus/shared-kernel';

const RUN_ID = '01JC0F15FRC0000000000000AA';
const BASE = 'http://shop.test';

interface ActionOptions {
  readonly ref?: string;
  readonly selector?: string;
  readonly ok?: boolean;
  readonly domMutations?: number;
  readonly alerts?: readonly string[];
  /** Milliseconds since the previous event; 3 s by default (an LLM decision). */
  readonly after?: number;
}

export class RunBuilder {
  private readonly all: JanusEvent[] = [];
  private seq = 0;
  private clock = Date.UTC(2026, 10, 6, 10, 0, 0);

  session(agentId: string, role = 'navigator'): SessionBuilder {
    return new SessionBuilder(this, agentId, role);
  }

  events(): JanusEvent[] {
    return [...this.all];
  }

  /** @internal */
  emit(agentId: string, role: string, type: string, payload: unknown, after = 3000): JanusEvent {
    this.clock += after;
    const event = parseEvent({
      id: newUlid(),
      runId: RUN_ID,
      seq: this.seq++,
      ts: new Date(this.clock).toISOString(),
      schemaVersion: 1,
      actor: { agentId, role },
      type,
      payload,
    }) as JanusEvent;
    this.all.push(event);
    return event;
  }
}

export class SessionBuilder {
  private stepIndex = 0;

  constructor(
    private readonly run: RunBuilder,
    readonly agentId: string,
    private readonly role: string,
  ) {}

  /** One step on `path`: the action, then the step event. Returns both ids. */
  act(path: string, action: string, options: ActionOptions = {}): { action: string; step: string } {
    const index = this.stepIndex++;
    const actionEvent = this.run.emit(
      this.agentId,
      this.role,
      'agent.action',
      {
        stepIndex: index,
        action,
        ...(options.ref === undefined ? {} : { ref: options.ref }),
        ...(options.selector === undefined ? {} : { selector: options.selector }),
        ...(options.domMutations === undefined ? {} : { domMutations: options.domMutations }),
        durationMs: 50,
        ok: options.ok ?? true,
      },
      options.after,
    );
    const stepEvent = this.run.emit(
      this.agentId,
      this.role,
      'agent.step',
      {
        stepIndex: index,
        url: `${BASE}${path}`,
        durationMs: 3000,
        ...(options.alerts === undefined ? {} : { alerts: options.alerts }),
      },
      10,
    );
    return { action: actionEvent.id, step: stepEvent.id };
  }

  /** A click on a button by ref, as the navigator records it. */
  click(path: string, ref: string, name: string, options: ActionOptions = {}) {
    return this.act(path, 'click', { ref, selector: `role=button[name="${name}"]`, ...options });
  }

  error(
    kind: 'console' | 'http' | 'timeout',
    url: string,
    message: string,
    status?: number,
  ): string {
    return this.run.emit(this.agentId, this.role, 'page.error', {
      stepIndex: Math.max(0, this.stepIndex - 1),
      kind,
      url: url.startsWith('http') ? url : `${BASE}${url}`,
      message,
      ...(status === undefined ? {} : { status }),
    }).id;
  }

  vitals(path: string, values: { lcpMs?: number; cls?: number; inpMs?: number }): string {
    return this.run.emit(this.agentId, this.role, 'page.vitals', {
      stepIndex: Math.max(0, this.stepIndex - 1),
      url: `${BASE}${path}`,
      ...values,
    }).id;
  }

  end(
    outcome: 'success' | 'abandon' | 'patience_exhausted' | 'budget_exhausted',
    reason?: string,
  ): string {
    return this.run.emit(this.agentId, this.role, 'session.ended', {
      outcome,
      steps: this.stepIndex,
      durationMs: this.stepIndex * 3000,
      ...(reason === undefined ? {} : { reason }),
    }).id;
  }
}
