# ADR 0003: Append-only event log as the source of truth

- **Status:** Accepted
- **Date:** 2026-11-05
- **Step:** F0.2 (implemented in F0.3 and F0.5)

## Context

Janus runs agents that act in browsers, call LLMs, launch attacks and propose patches. We need to see runs live, replay them later without calling a model, audit what happened, and sign reports that point to exact evidence. A mutable state model would make replay unreliable and signatures meaningless.

## Decision

Every observable fact is an event in an append-only log. The `events` table is the source of truth, and the live view and the replay view consume the same stream.

- Envelope: `id` (ULID), `runId`, `seq`, `ts`, `schemaVersion`, `actor { agentId, role }`, `type`, `payload`, optional `cost`.
- `actor.agentId` is a readable slug (`^[a-z0-9][a-z0-9-]{0,63}$`, e.g. `orchestrator`, `persona-ana-1`), not a ULID. This is the one exception to "IDs are ULIDs".
- Schemas are zod definitions in `shared-kernel`. Unknown event types are preserved as `UnknownEvent` so old replays never break on newer data.
- A database trigger rejects `UPDATE`, `DELETE` and `TRUNCATE` on `events`. Integration tests reset their own `*_test` database with `DROP SCHEMA`, never by mutating rows.
- An `AFTER INSERT` trigger sends `pg_notify('janus_events', run_id)` so live subscribers re-read from their last `seq`; the stored `body` is the event exactly as appended.
- `(runId, seq)` is unique. Reports store a hash of the run's event log.
- Replay reads recorded events and recorded LLM responses and never calls a model.

## Alternatives considered

| Option                                               | Why not                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| Mutable run state in tables, with logs on the side   | Replay and signed evidence would depend on logs that are not guaranteed complete. |
| Full event sourcing with CQRS projections everywhere | More machinery than needed; we only need a log plus a few derived views.          |
| Store events in files only                           | Harder to query, subscribe to and enforce immutability.                           |

## Consequences

- **Positive:** deterministic replay, a no-cost demo mode, auditable runs, a stable base for hashing and signing reports.
- **Negative:** schema evolution needs discipline (`schemaVersion`, tolerant parsing); the table grows and will need retention rules later.
- **Follow-ups:** F0.3 defines the envelope; F0.5 adds the trigger and contract tests; F3.7 hashes the log into the signed report.

## Implementation notes (F0.5–F0.12)

- A run's status is derived from its own events (`run.started`, `run.completed`); there is no mutable runs table.
- Live view and replay share one renderer in the console (`RunViewer`), fed by either the SSE stream or recorded events. The console reads SSE with `fetch` and its own parser, because `EventSource` only listens to event names it knows in advance and unknown types must survive.
- The interchange format for a recorded run is `janus-run` v1 (`buildRunExport` / `parseRunExport` in `shared-kernel`): a header plus the events exactly as stored, unknown types included. The console's offline replay and `pnpm run:replay` read the same format; the CLI can also read a run straight from Postgres.
