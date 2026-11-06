// The F1.4 recorded session: one persona buying in ShopLab with the real navigator model.
// The recording (sandbox) and the replay (unit) tests share these inputs, so the replayed
// requests hash exactly like the recorded ones. Not part of the build.

import { isKnownEvent } from '@janus/shared-kernel';
import { fileURLToPath } from 'node:url';

import type { NavigatorTask } from '../application/navigator-prompt.js';
import type { StoredEvent } from '../domain/event-store/stored-event.js';

export const RECORDED_PERSONA = 'carmen-retired';
export const RECORDED_RUN_ID = '01JC0F14REC0000000000000AA';
export const RECORDED_AGENT_ID = `${RECORDED_PERSONA}-0`;
export const RECORDED_BUDGET = { maxTokens: 400_000, maxEur: 0.5 };

// Fixed synthetic details: nothing that changes between the recording and the replay.
export const RECORDED_TASK: NavigatorTask = {
  hasAccount: false,
  details: {
    name: 'Carmen Sintética',
    email: 'carmen-f14@shoplab.test',
    password: 'carmen-f14-synthetic',
    address: 'Calle Sintética 1, 28001 Madrid',
  },
};

export const recordedSessionDir = fileURLToPath(
  new URL(`../../../../recordings/fixtures/sessions/${RECORDED_PERSONA}/`, import.meta.url),
);

/** What a replay must reproduce: every action (with its ref and result) and how it ended. */
export function expectedOf(events: readonly StoredEvent[]) {
  const known = events
    .filter(isKnownEvent)
    .filter((event) => event.actor.agentId === RECORDED_AGENT_ID);
  return {
    actions: known.flatMap((event) =>
      event.type === 'agent.action'
        ? [
            {
              action: event.payload.action,
              ...(event.payload.ref === undefined ? {} : { ref: event.payload.ref }),
              ok: event.payload.ok,
              ...(event.payload.errorCode === undefined
                ? {}
                : { errorCode: event.payload.errorCode }),
            },
          ]
        : [],
    ),
    thoughts: known.flatMap((event) =>
      event.type === 'agent.thought' ? [event.payload.text] : [],
    ),
    ended: known.flatMap((event) =>
      event.type === 'session.ended'
        ? [
            {
              outcome: event.payload.outcome,
              steps: event.payload.steps,
              reason: event.payload.reason ?? null,
            },
          ]
        : [],
    ),
  };
}
