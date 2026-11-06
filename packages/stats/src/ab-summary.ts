import {
  isKnownEvent,
  type JanusEvent,
  type SessionEndedEvent,
  type SessionStartedEvent,
  type TaskVerifiedEvent,
  type UnknownEvent,
} from '@janus/shared-kernel';

import { pairedBootstrap, type BootstrapInterval, type BootstrapOptions } from './bootstrap.js';
import { decide, type AbVerdict } from './decide.js';
import { wilsonInterval, type RateInterval } from './wilson.js';

export interface VariantSummary {
  readonly variant: string;
  /** Synthetic task success of the personas (baseline excluded); null without personas. */
  readonly personas: RateInterval | null;
  /** The competent baseline on this variant: a reference, not part of the comparison. */
  readonly baseline: { readonly successes: number; readonly n: number };
}

export interface AbComparison {
  readonly a: string;
  readonly b: string;
  /** Persona and seed pairs that ended validly on both variants. */
  readonly pairs: number;
  /** Bootstrap of B − A over the pairs; null when there is no complete pair. */
  readonly difference: BootstrapInterval | null;
  readonly verdict: AbVerdict | null;
}

export interface AbSummary {
  readonly variants: readonly VariantSummary[];
  /** First two variants in alphabetical order; null for single-variant runs. */
  readonly comparison: AbComparison | null;
  readonly excluded: readonly { readonly agentId: string; readonly reason: string }[];
}

interface Slot {
  readonly agentId: string;
  readonly started: SessionStartedEvent['payload'];
  readonly ended: SessionEndedEvent['payload'] | undefined;
  /** The oracle's verdict (F1.9), when the slot played a task. */
  readonly verified: TaskVerifiedEvent['payload'] | undefined;
}

function slotsOf(events: readonly (JanusEvent | UnknownEvent)[]): Slot[] {
  const started = new Map<string, SessionStartedEvent['payload']>();
  const ended = new Map<string, SessionEndedEvent['payload']>();
  const verified = new Map<string, TaskVerifiedEvent['payload']>();
  for (const event of events.filter(isKnownEvent).sort((a, b) => a.seq - b.seq)) {
    if (event.type === 'session.started') started.set(event.actor.agentId, event.payload);
    if (event.type === 'session.ended') ended.set(event.actor.agentId, event.payload);
    if (event.type === 'task.verified') verified.set(event.actor.agentId, event.payload);
  }
  return [...started].map(([agentId, payload]) => ({
    agentId,
    started: payload,
    ended: ended.get(agentId),
    verified: verified.get(agentId),
  }));
}

/**
 * The statistics of a run (F1.8), from its events only: per variant, the personas' synthetic
 * task success with a Wilson interval (the oracle's task.verified when present, F1.9); for the first two variants, the paired difference
 * B − A (same persona and seed) with a seeded percentile bootstrap and the exit rule. Sessions
 * that never ended (infrastructure) or ran out of budget are excluded, and so are their pairs.
 */
export function abSummary(
  events: readonly (JanusEvent | UnknownEvent)[],
  options: BootstrapOptions = {},
): AbSummary {
  const excluded: { agentId: string; reason: string }[] = [];
  const valid: Slot[] = [];
  for (const slot of slotsOf(events)) {
    if (slot.ended === undefined) {
      excluded.push({ agentId: slot.agentId, reason: 'never ended (infrastructure)' });
    } else if (slot.ended.outcome === 'budget_exhausted') {
      excluded.push({ agentId: slot.agentId, reason: 'run budget exhausted' });
    } else if (slot.verified?.status === 'unverifiable') {
      excluded.push({ agentId: slot.agentId, reason: 'task could not be verified' });
    } else {
      valid.push(slot);
    }
  }
  // The oracle decides when there is one (F1.9); otherwise the agent's own outcome.
  const succeeded = (slot: Slot) =>
    slot.verified === undefined
      ? slot.ended?.outcome === 'success'
      : slot.verified.status === 'passed';

  const names = [...new Set(slotsOf(events).map((slot) => slot.started.variant))].sort();
  const variants = names.map((variant): VariantSummary => {
    const here = valid.filter((slot) => slot.started.variant === variant);
    const personas = here.filter((slot) => slot.started.kind === 'persona');
    const baseline = here.filter((slot) => slot.started.kind === 'baseline');
    return {
      variant,
      personas:
        personas.length === 0
          ? null
          : wilsonInterval(personas.filter(succeeded).length, personas.length),
      baseline: { successes: baseline.filter(succeeded).length, n: baseline.length },
    };
  });

  const [a, b] = names;
  if (a === undefined || b === undefined) return { variants, comparison: null, excluded };

  // The last valid attempt of each persona and seed on each side.
  const side = (variant: string) =>
    new Map(
      valid
        .filter((slot) => slot.started.kind === 'persona' && slot.started.variant === variant)
        .map((slot) => [
          `${slot.started.persona ?? ''}#${slot.started.task ?? ''}#${String(slot.started.seed)}`,
          slot,
        ]),
    );
  const onA = side(a);
  const onB = side(b);
  const differences = [...onA].flatMap(([key, slotA]) => {
    const slotB = onB.get(key);
    return slotB === undefined ? [] : [Number(succeeded(slotB)) - Number(succeeded(slotA))];
  });
  const difference = differences.length === 0 ? null : pairedBootstrap(differences, options);
  return {
    variants,
    comparison: {
      a,
      b,
      pairs: differences.length,
      difference,
      verdict: difference === null ? null : decide(difference),
    },
    excluded,
  };
}
