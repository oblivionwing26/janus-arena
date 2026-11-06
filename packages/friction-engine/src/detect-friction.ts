import type { JanusEvent, UnknownEvent } from '@janus/shared-kernel';

import { defaultFrictionConfig, type FrictionConfig } from './config.js';
import { detectAbandonment } from './detectors/abandonment.js';
import { detectBacktracks } from './detectors/backtrack.js';
import { detectDeadClicks } from './detectors/dead-click.js';
import { detectExtraSteps } from './detectors/extra-steps.js';
import { detectFormErrors } from './detectors/form-error.js';
import { detectPerformance } from './detectors/performance.js';
import { detectRageClicks } from './detectors/rage-click.js';
import { detectTechnicalErrors } from './detectors/technical-error.js';
import { sessionsOf } from './session.js';
import type { FrictionSignalDraft } from './signal.js';

/**
 * Every friction signal in a run's events, computed by code only (CLAUDE.md: deterministic
 * first). Pure: the same events and config always give the same signals, in event order.
 * `agent.thought` and LLM output are never read.
 */
export function detectFriction(
  events: readonly (JanusEvent | UnknownEvent)[],
  config: FrictionConfig = defaultFrictionConfig,
): FrictionSignalDraft[] {
  const sessions = sessionsOf(events);
  const drafts = [
    ...sessions.flatMap((session) => [
      ...detectRageClicks(session, config),
      ...detectDeadClicks(session, config),
      ...detectBacktracks(session, config),
      ...detectFormErrors(session, config),
      ...detectAbandonment(session),
      ...detectTechnicalErrors(session, config),
      ...detectPerformance(session, config),
    ]),
    ...detectExtraSteps(sessions, config),
  ];
  const seqOf = new Map(events.map((event) => [event.id, event.seq]));
  const firstSeq = (draft: FrictionSignalDraft) =>
    Math.min(...draft.evidenceEventIds.map((id) => seqOf.get(id) ?? Number.MAX_SAFE_INTEGER));
  return drafts.sort((a, b) => firstSeq(a) - firstSeq(b));
}
