# ADR 0016: The gate resumes from its own event log, one stage at a time

- **Status:** Accepted
- **Date:** 2026-11-13
- **Step:** F3.9

## Context

`RunJanusGate` chains every earlier piece: SynthLab on A, the UI Engineer's variant B, the A/B, the differential audit, the Red Team, the Blue Team, the signed report and the pull request. A full gate takes tens of minutes and costs real money. If it dies half-way, a relaunch must not pay again for what already finished. The roadmap's example is "if it fails in the Blue Team, it does not repeat SynthLab".

No single target can run all eight stages. ShopLab's scope forbids attacks (ADR 0006). Juice Shop has no UI Engineer policy, and the GitHub App is not installed on its repository.

## Decision

- **State lives in one place.** The gate has its own run in the append-only `events` table. Each stage writes one `gate.stage` event per step:
  - `started`, with its share of the budget;
  - `run`, naming each run the stage starts;
  - `completed`, with its output (run ids, branch, paths) and what its runs cost;
  - `skipped` or `failed`, with the reason.

  There is no other state: no job table and no checkpoint file. `gateProgress` reads these events back.

- **Resume = replay the log.** `pnpm run:gate <gate file> --resume <gateRunId>` skips every stage that is completed or skipped. It hands their recorded outputs to the later stages, as if nothing had happened.
- **The unit of resumption is the stage.** A stage caught half-way runs again from its start. Runs that its earlier attempt left open are handled as follows:
  - **SynthLab stages** (`resumesRuns`) wait for the run if it is still alive on the orchestrator, and reuse it if it completed. They start it again only if no event has arrived for 15 minutes.
  - **Every other stage:** the gate closes those runs with `run.completed` `error`, "interrupted", because nothing will finish them.
- **An unfinished gate has no `run.completed`.** A failed stage records `failed` and the process exits. The gate stays resumable, exactly as if it had been killed.
- **Stages are a port.** `GateStage` (domain) has one adapter per stage in `interface/gate/`. Each adapter wires the use cases of earlier steps, the same way their CLIs do. A stage the target cannot do returns `skipped` with its reason, read from the target's own configuration (scope, sandbox definition, gate file). It is never dropped silently.
- **Budget:** the gate file declares a total and a share per stage. A stage may spend its share plus whatever the earlier stages left, never more than what remains of the total (`GateBudget`). What the gate has spent is the cost recorded on the runs its stages started, from every attempt, so a killed attempt's spend still counts.

## Alternatives considered

| Option                                    | Why not                                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| A job queue (BullMQ) with per-stage jobs  | A second source of truth beside the event log; retries and resume would live in Redis, outside the replayable history.        |
| Checkpoints inside each stage             | Every use case would need its own resume logic. The stage is the smallest unit with a clean input and output.                 |
| Mark the gate failed with `run.completed` | It would end the run, and resuming would append events after it. Leaving it open says what is true: the gate is not finished. |

## Consequences

- **Positive:**
  - A killed or failed gate continues with one command, and its whole history (including the abandoned attempts and their cost) stays in the log.
  - The console shows each stage's progress with no extra wiring.
- **Negative:**
  - A stage that dies half-way pays again for its own work. Its first attempt's runs are closed as interrupted.
  - A gate stopped for good stays without `run.completed` until someone resumes it.
  - If a Blue Team stage is killed during V3, the orchestrator may keep playing that SynthLab run after the gate closed it.
- **Follow-ups:**
  - F3.10 draws the attack graph from the same runs.
  - Opening pull requests for Blue Team fixes needs the App installed on a repository Janus may write to.
