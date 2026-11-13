# ADR 0019: The public demo is the console, built against recorded runs

- **Status:** Accepted
- **Date:** 2026-11-13
- **Step:** F3.12

## Context

Gate G2 needs a demo anyone can open: no backend, no keys, no model calls. The console already
replays an exported run in the browser (`/replay`, F0.11), but a visitor would have to find a file
first, and the best pages (the attack graph of a whole gate, the SynthLab report, the patches) read
the orchestrator's API. A recorded run is also the demo's evidence: it has to be what really
happened, and it must carry nothing that should not be public.

## Decision

- **One console, two data sources.** `NEXT_PUBLIC_DEMO=1` at build time makes the console read its
  data from `/demo` (files served with the page) instead of the orchestrator. Every read goes
  through one layer (`lib/backend.ts`, plus `fetchRunEvents`): the run list, a run's events, its
  report and a finding's PoC. The pages are the same ones; nothing is duplicated or mocked.
- **The report is computed in the browser** with `buildSynthlabReport`, the same pure function the
  orchestrator runs, from the recorded events and the report settings in the index. A test checks
  that both give the same report.
- **The demo's runs come from the event log, through `pnpm demo:export`.** `config/demo.yaml` names
  the stories (a run each, with a hand-written summary taken from the signed reports); a gate
  brings every run its stages started, and an A/B brings its generated variant. Each run is written
  in the exported-run format and validated on the way back in, as any exported run is.
- **Nothing is written until every file is clean.** The export scans each file for credentials
  (Anthropic and GitHub tokens, JWTs, private keys, credential fields) and for addresses outside the
  project's synthetic domains, and refuses to write anything if it finds one. A finding names the
  pattern and the file, never the value.
- **No screenshots.** The recorded runs keep their events but not their images: the artifacts
  folder of a development machine weighs about 200 MB. The heatmap says so instead of showing an empty frame.
- **Hosting is any Next.js host.** `apps/web-console/vercel.json` sets the install and build
  commands; `build:demo` builds the workspace packages the console imports and then the app.
  There are no server routes to run: the build rewrites nothing to an orchestrator.

## Alternatives considered

| Option                             | Why not                                                                                                                |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Host the orchestrator for the demo | It needs Postgres, Docker and a key somewhere, and a public API in front of an offensive tool is a liability.          |
| A static export of every page      | The run pages take their id from the URL; a static export needs every id listed at build time, and gains nothing here. |
| Mock data written for the demo     | The demo would show what we wrote, not what the system did. The point is that it replays real runs.                    |
| Ship the whole event log           | It holds runs that are not stories, and the export's scan would have to cover all of them.                             |

## Consequences

- **Positive:** the demo is the product's own console on real recordings, so it cannot drift from
  it; a visitor needs nothing; and the same layer serves the live console and the demo.
- **Negative:**
  - The demo is frozen at its export: new runs need `pnpm demo:export` and a commit of the data
    (about 5 MB).
  - The scan is a safety net with patterns, not a proof: the events were designed to carry no
    credentials (ADR 0003 and the event schemas), and the scan checks that they still do.
  - The console's interface is in Spanish, and the demo adds only an English banner and stories.
- **Follow-ups:** translating the console's labels, if the demo gets an audience that needs it.
