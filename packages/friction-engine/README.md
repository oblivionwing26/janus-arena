# @oblivionwing26/friction-engine

Friction signals from a recorded run of users, by code. Give it the events of a session (what an
agent clicked, which page it was on, which errors the page raised) and it returns where the
experience went wrong: rage clicks, dead clicks, backtracks, repeated form errors, technical
errors, slow pages, steps beyond what a competent user needs, and abandonment.

It is part of [Janus Arena](https://github.com/oblivionwing26/janus-arena), where the events come
from synthetic users (language-model agents driving a real browser). The engine does not care who
produced them. It is **pure**: no browser, no LLM, no network, no clock. The same events and the
same thresholds always give the same signals, in event order.

```bash
npm install @oblivionwing26/friction-engine
```

Node 20 or later, ESM only.

## Use

```js
import { detectFriction } from '@oblivionwing26/friction-engine';

for (const signal of detectFriction(events)) {
  console.log(signal.detector, signal.severity, signal.url, signal.stepIndex);
}
```

[`examples/rage-click.mjs`](examples/rage-click.mjs) is a complete, runnable case: three clicks
on the same button that change nothing (it also reports the dead click).

`events` is an array of Janus events: `{ id, runId, seq, ts, schemaVersion, actor, type, payload }`.
The engine reads these types and ignores the rest:

| Event                              | What it says                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `agent.action`                     | what the agent did: `click`, `type`, `wait`…, on which element, DOM mutations it caused |
| `agent.step`                       | the page the action happened on, how long the step took, and the alerts the page showed |
| `page.error`                       | a console error, an HTTP error or a timeout while the agent used it                     |
| `page.vitals`                      | LCP, CLS and INP measured on a page                                                     |
| `session.started`, `session.ended` | which slot the session fills, and how it ended                                          |

The full schemas (zod) are in `@oblivionwing26/shared-kernel`, which this package depends on.

## The signals

Each signal is `{ detector, severity, agentId, evidenceEventIds, stepIndex?, url? }`:
`evidenceEventIds` always names the events that justify it, so a signal can be traced back.

| Detector          | Fires when                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `rage-click`      | 3 or more clicks on the same element within 4 actions and 30 s                                                                |
| `dead-click`      | a click that changes nothing in the page, on an element that should (inputs excluded)                                         |
| `backtrack`       | A → B → A, going back after a single step on B                                                                                |
| `form-error`      | a new alert appears on the page after an action; high when the same one shows again                                           |
| `technical-error` | a console error (low), a failed request or timeout (medium), a 5xx (high); validation responses and static assets are ignored |
| `performance`     | LCP, CLS or INP above the web.dev "needs improvement" or "poor" thresholds                                                    |
| `extra-steps`     | a session takes 1.5×, 2× or 3× the steps of the competent baseline on the same task                                           |
| `abandonment`     | the session ends by giving up or running out of patience (running out of budget is the platform's limit and never counts)     |

Thresholds are data, not code:

```js
import { defaultFrictionConfig, detectFriction } from '@oblivionwing26/friction-engine';

const strict = {
  ...defaultFrictionConfig,
  rageClick: { minClicks: 2, windowActions: 4, windowMs: 30_000 },
};
detectFriction(events, strict);
```

`parseFrictionConfig(input)` validates a config you load from YAML or JSON and throws
`InvalidFrictionConfigError` with a readable message. The defaults are the ones Janus Arena uses.

## What it does not tell you

- **The defaults were tuned for language-model agents.** An agent needs seconds per decision, so
  the rage-click window is 30 s. For recordings of human sessions you would use about 1 s.
- **A signal is a place to look, not a verdict.** The engine says where a session got stuck, not
  why. In Janus Arena the explanation comes from reading the evidence events, never from a model's
  opinion.
- **Synthetic users do not predict what real people will do.** Rates of task success from
  synthetic sessions say where a flow is hard for an agent; they are not conversion figures.

## Development

The engine lives in a monorepo and is covered by positive and negative cases per detector,
including a typical false positive each (`pnpm --filter @janus/friction-engine test`). The package
is published from the monorepo as `@oblivionwing26/friction-engine`; inside it, it is still called
`@janus/friction-engine`.

MIT licensed.
