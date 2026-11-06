import {
  isKnownEvent,
  synthlabReportSchema,
  type JanusEvent,
  type SynthlabReport,
  type UnknownEvent,
} from '@janus/shared-kernel';
import { abSummary } from '@janus/stats';

import { costOf } from './cost.js';
import { funnelOf } from './funnel.js';
import type { ReportConfig } from './report-config.js';
import { frictionZones } from './zones.js';

/**
 * The SynthLab report of a run (F1.10), from its events only: the same events give the same
 * report, so replaying a run reproduces it. Rates are synthetic task success with intervals.
 */
export function buildSynthlabReport(
  runId: string,
  events: readonly (JanusEvent | UnknownEvent)[],
  config: ReportConfig,
): SynthlabReport {
  const known = events.filter(isKnownEvent);
  const summary = abSummary(events);
  const excluded = new Set(summary.excluded.map((entry) => entry.agentId));

  const kinds = new Map<string, string>();
  const detectors = new Map<string, { signals: number; sessions: Set<string> }>();
  for (const event of known) {
    if (event.type === 'session.started') kinds.set(event.actor.agentId, event.payload.kind);
    if (event.type === 'friction.signal') {
      const entry = detectors.get(event.payload.detector) ?? { signals: 0, sessions: new Set() };
      entry.signals += 1;
      if (event.payload.agentId !== undefined) entry.sessions.add(event.payload.agentId);
      detectors.set(event.payload.detector, entry);
    }
  }
  const count = (kind: string) => [...kinds.values()].filter((value) => value === kind).length;

  return synthlabReportSchema.parse({
    format: 'janus-synthlab-report',
    version: 1,
    runId,
    source: {
      events: events.length,
      lastSeq: events.reduce((last, event) => Math.max(last, event.seq), 0),
    },
    sessions: {
      persona: count('persona'),
      baseline: count('baseline'),
      excluded: summary.excluded,
    },
    funnel: funnelOf(events, config, excluded),
    zones: frictionZones(events, { routes: config.routes, top: config.topZones }),
    zonesByVariant: summary.variants.map(({ variant }) => ({
      variant,
      zones: frictionZones(events, { routes: config.routes, top: config.topZones, variant }),
    })),
    detectors: [...detectors]
      .map(([detector, entry]) => ({
        detector,
        signals: entry.signals,
        sessions: entry.sessions.size,
      }))
      .sort((a, b) => b.signals - a.signals || a.detector.localeCompare(b.detector)),
    success: {
      variants: summary.variants,
      comparison:
        summary.comparison === null
          ? null
          : {
              ...summary.comparison,
              difference:
                summary.comparison.difference === null
                  ? null
                  : {
                      mean: summary.comparison.difference.mean,
                      low: summary.comparison.difference.low,
                      high: summary.comparison.difference.high,
                      level: summary.comparison.difference.level,
                      resamples: summary.comparison.difference.resamples,
                      seed: summary.comparison.difference.seed,
                    },
            },
    },
    cost: costOf(events),
  });
}
