import { isKnownEvent } from '@janus/shared-kernel';

import type { EventStorePort } from '../../domain/event-store/event-store-port.js';
import type { StoredEvent } from '../../domain/event-store/stored-event.js';

export interface DemoStory {
  readonly id: string;
  readonly kind: 'ab' | 'gate' | 'launch-day';
  readonly title: string;
  readonly summary: string;
}

export interface DemoLink {
  readonly label: string;
  readonly href: string;
}

export interface DemoPlan {
  /** Every run the demo ships, each with its events in seq order. */
  readonly runs: ReadonlyMap<string, readonly StoredEvent[]>;
  readonly featured: readonly {
    readonly runId: string;
    readonly title: string;
    readonly summary: string;
    readonly links: readonly DemoLink[];
  }[];
}

const VARIANT_BRANCH = /^janus\/variant-([0-9A-HJKMNP-TV-Z]{26})$/;

/** The UI Engineer run behind a run's variant B, named by B's branch. */
function variantRun(events: readonly StoredEvent[]): string | null {
  for (const event of events) {
    if (!isKnownEvent(event) || event.type !== 'run.started') continue;
    for (const variant of event.payload.variants ?? []) {
      const id = VARIANT_BRANCH.exec(variant.ref)?.[1];
      if (id !== undefined) return id;
    }
  }
  return null;
}

/** What a run holds, which decides the console pages that show it. */
function holds(events: readonly StoredEvent[]) {
  const types = new Set(events.map((event) => event.type));
  return {
    sessions: types.has('session.started'),
    findings: types.has('finding.created') || types.has('surface.mapped'),
    patches: types.has('patch.proposed'),
  };
}

function linksFor(runId: string, events: readonly StoredEvent[], label: string): DemoLink[] {
  const has = holds(events);
  return [
    ...(has.sessions
      ? [{ label: `${label}: SynthLab report`, href: `/runs/${runId}/report` }]
      : []),
    ...(has.findings
      ? [{ label: `${label}: findings and surface`, href: `/runs/${runId}/security` }]
      : []),
    ...(has.patches
      ? [{ label: `${label}: the patches and their checks`, href: `/runs/${runId}/variant` }]
      : []),
  ];
}

/**
 * The runs the public demo ships and the stories it opens with (F3.12): each story's run, the
 * runs a gate's stages started, and the generated variant behind any A/B. Every run is read from
 * the event log, so the demo shows what really happened and nothing else.
 */
export async function planDemo(
  stories: readonly DemoStory[],
  store: EventStorePort,
): Promise<DemoPlan> {
  const runs = new Map<string, readonly StoredEvent[]>();
  const read = async (runId: string): Promise<readonly StoredEvent[]> => {
    const known = runs.get(runId);
    if (known !== undefined) return known;
    const events = await store.readRun(runId);
    if (events.length === 0)
      throw new Error(`Run ${runId} has no events: it cannot be in the demo`);
    runs.set(runId, events);
    return events;
  };

  const featured: DemoPlan['featured'][number][] = [];
  for (const story of stories) {
    const events = await read(story.id);
    const links: DemoLink[] = [];
    if (story.kind === 'gate') {
      links.push(
        { label: 'Replay the gate as an attack graph', href: `/runs/${story.id}/attack` },
        { label: 'The gate, stage by stage', href: `/runs/${story.id}` },
      );
      const seen = new Set<string>();
      for (const event of events) {
        if (!isKnownEvent(event) || event.type !== 'gate.stage') continue;
        const { stage, status, runId } = event.payload;
        if (status !== 'run' || runId === undefined || seen.has(runId)) continue;
        seen.add(runId);
        const child = await read(runId);
        links.push(...linksFor(runId, child, stage));
        const variant = variantRun(child);
        if (variant !== null) await read(variant);
      }
    } else if (story.kind === 'launch-day') {
      // Launch Day (F4.1): the three curves, the replay with saboteurs on the canvas, the report.
      links.push(
        {
          label: 'The three curves, A without the defense and B with it',
          href: `/runs/${story.id}/launch-day`,
        },
        { label: 'Replay the run: shoppers and saboteurs', href: `/runs/${story.id}` },
      );
    } else {
      links.push(
        { label: 'SynthLab report: heatmap, funnel and the A/B', href: `/runs/${story.id}/report` },
        { label: 'Replay the run', href: `/runs/${story.id}` },
      );
      const variant = variantRun(events);
      if (variant !== null) {
        await read(variant);
        links.push({ label: 'The UI Engineer’s patches', href: `/runs/${variant}/variant` });
      }
    }
    featured.push({ runId: story.id, title: story.title, summary: story.summary, links });
  }
  return { runs, featured };
}
