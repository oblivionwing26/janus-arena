import { describe, expect, it } from 'vitest';

import { sampleRun } from '@/test-support/sample-run';

import type { ConsoleEvent } from './console-event';
import { buildTimeline } from './timeline';

describe('buildTimeline', () => {
  const events = sampleRun();

  it('groups events into one lane per agent, orchestrator first', () => {
    const timeline = buildTimeline(events);

    expect(timeline.lanes.map((lane) => lane.agentId)).toEqual([
      'orchestrator',
      'scripted-buyer-0',
      'scripted-buyer-1',
      'persona-ana-1',
    ]);
    expect(timeline.lanes[0]?.items.map((item) => item.seq)).toEqual([0, 5, 6, 7]);
  });

  it('labels known events and keeps unknown ones visible', () => {
    const items = buildTimeline(events).lanes.flatMap((lane) => lane.items);
    const label = (seq: number) => items.find((item) => item.seq === seq);

    expect(label(0)?.label).toBe('Inicio · presupuesto 100000 tokens / 1.00 €');
    expect(label(2)).toMatchObject({
      label: 'click role=button[name="Crear cuenta"] ✗',
      tone: 'error',
    });
    expect(label(3)?.label).toBe('Paso 0 → /cart');
    expect(label(6)).toMatchObject({ known: false, label: 'replay.bookmarked (tipo desconocido)' });
    expect(label(7)).toMatchObject({
      label: 'Fin · error (1/2 sessions completed; failed: 1)',
      tone: 'error',
    });
  });

  it('labels persona thoughts and how a session ended (F1.4)', () => {
    const base = events[1];
    if (base === undefined) throw new Error('sample run is empty');
    const persona = { agentId: 'carmen-retired-0', role: 'navigator' };
    const extra = [
      {
        ...base,
        seq: 20,
        actor: persona,
        type: 'agent.thought',
        payload: { stepIndex: 0, text: 'No veo el botón.' },
      },
      {
        ...base,
        seq: 21,
        actor: persona,
        type: 'session.ended',
        payload: { outcome: 'patience_exhausted', steps: 40, durationMs: 9000 },
      },
    ] as ConsoleEvent[];

    const items = buildTimeline(extra).lanes.flatMap((lane) => lane.items);

    expect(items.map(({ label, tone }) => [label, tone])).toEqual([
      ['Pensamiento: «No veo el botón.»', 'neutral'],
      ['Sesión: se le acaba la paciencia', 'warning'],
    ]);
  });

  it('labels technical errors and web vitals (F1.5 inputs)', () => {
    const base = events[1];
    if (base === undefined) throw new Error('sample run is empty');
    const extra = [
      {
        ...base,
        seq: 30,
        type: 'page.error',
        payload: {
          stepIndex: 1,
          kind: 'http',
          url: 'http://x.test/api',
          status: 500,
          message: 'Fallo',
        },
      },
      {
        ...base,
        seq: 31,
        type: 'page.vitals',
        payload: { stepIndex: 1, url: 'http://x.test/', lcpMs: 2600.4, cls: 0.031 },
      },
      {
        ...base,
        seq: 32,
        type: 'page.screenshot',
        payload: {
          stepIndex: 1,
          url: 'http://x.test/',
          artifact: 'ana-0/step-1.png',
          detector: 'dead-click',
        },
      },
    ] as ConsoleEvent[];

    const labels = buildTimeline(extra)
      .lanes.flatMap((lane) => lane.items)
      .map((item) => item.label);

    expect(labels).toEqual([
      'Error técnico (HTTP 500): Fallo',
      'Vitals: LCP 2600 ms · CLS 0.03',
      'Captura por dead-click: ana-0/step-1.png',
    ]);
  });

  it('labels session slots and the session counter of a finished run (F1.7)', () => {
    const base = events[1];
    if (base === undefined) throw new Error('sample run is empty');
    const extra = [
      {
        ...base,
        seq: 40,
        type: 'session.started',
        payload: { variant: 'b', kind: 'persona', persona: 'carmen-retired', seed: 1, attempt: 2 },
      },
      {
        ...base,
        seq: 41,
        type: 'run.completed',
        payload: {
          outcome: 'error',
          sessions: {
            total: 10,
            completed: 9,
            failed: 0,
            budgetExhausted: 0,
            cancelled: 0,
            excluded: 1,
          },
        },
      },
    ] as ConsoleEvent[];

    const labels = buildTimeline(extra)
      .lanes.flatMap((lane) => lane.items)
      .map((item) => item.label);

    expect(labels).toEqual([
      'Sesión carmen-retired · variante B · semilla 1 · intento 2',
      'Fin · error · sesiones 9/10 completas · 1 excluida (infraestructura)',
    ]);
  });

  it('lists every type present and filters by type', () => {
    const all = buildTimeline(events);
    expect(all.types).toEqual([
      'agent.action',
      'agent.step',
      'budget.threshold',
      'llm.call',
      'replay.bookmarked',
      'run.completed',
      'run.started',
    ]);

    const filtered = buildTimeline(events, new Set(['agent.step']));
    expect(filtered.lanes.flatMap((lane) => lane.items).map((item) => item.seq)).toEqual([3]);
    expect(filtered.types).toEqual(all.types);
  });
});
