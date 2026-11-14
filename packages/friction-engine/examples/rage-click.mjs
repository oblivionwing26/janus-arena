// A shopper clicks "Pay" three times in a row and nothing changes. Run it with `node rage-click.mjs`
// after `npm install @oblivionwing26/friction-engine`.

import { detectFriction } from '@oblivionwing26/friction-engine';

const RUN = '01JC0F15FRC0000000000000AA';
const at = (seconds) => new Date(Date.UTC(2026, 10, 6, 10, 0, seconds)).toISOString();
let seq = 0;

// An event is { id, runId, seq, ts, schemaVersion, actor, type, payload }. A step is an
// `agent.action` (what the agent did) followed by an `agent.step` (the page it happened on).
function step(stepIndex, seconds) {
  const event = (type, payload) => ({
    id: `01JC0F15FRC00000000000${String(seq).padStart(4, '0')}`,
    runId: RUN,
    seq: seq++,
    ts: at(seconds),
    schemaVersion: 1,
    actor: { agentId: 'carmen-0', role: 'navigator' },
    type,
    payload,
  });
  return [
    event('agent.action', {
      stepIndex,
      action: 'click',
      ref: 'e9',
      selector: 'role=button[name="Pay"]',
      domMutations: 0,
      durationMs: 50,
      ok: true,
    }),
    event('agent.step', { stepIndex, url: 'http://shop.test/checkout', durationMs: 3000 }),
  ];
}

const events = [step(0, 0), step(1, 4), step(2, 8)].flat();

for (const signal of detectFriction(events)) {
  console.log(`${signal.detector} (${signal.severity}) at ${signal.url}, step ${signal.stepIndex}`);
}
