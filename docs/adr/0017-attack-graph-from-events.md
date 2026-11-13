# ADR 0017: The attack graph is a pure function of events, drawn with React Flow

- **Status:** Accepted
- **Date:** 2026-11-13
- **Step:** F3.10

## Context

F3.10 draws a gate as a graph: the endpoints of the target are nodes, the attack attempts are edges, and each endpoint is coloured by where it stands (untested, probed, exploited, patched, verified). It must work live and in replay, and the replay of a whole gate has to be understandable without someone explaining it.

A gate spans many runs: its own, SynthLab's, the Red Team's, the Blue Team's and V3's. Their `seq` numbers collide, and the events did not carry what a graph needs: an attempt knew only its concrete path, and a dynamic finding named its endpoint only inside its title.

## Decision

- **A pure function of events.** `buildAttackGraph(events)` in the console maps the events seen so far to nodes, edges and states. It keeps no state of its own, so the live view, the replay and any seek position draw the same graph from the same prefix of events. This follows the project rule that live view and replay use the same rendering code.
- **Optional event fields, no new event types and no version bump.** `attack.attempt` gains `endpoint`, `finding.created` gains `endpoint` and `attemptId`, and the Red Team records the surface it attacks as `surface.mapped` (side `variant`, no parameter names). Old runs stay valid: the graph falls back to matching a path against the surface map and to the endpoint written in a finding's title.
- **A gate is one stream.** `GateEventSource` merges the gate's run and the runs its stages started, in time order, and renumbers `seq` in emission order. It polls until the gate completes, so a running gate is live and a finished one is a replay of the same stream.
- **The Blue Team's PoC replays are not attacks.** Attempts recorded in a run that holds a Blue Team patch belong to that fix's verifiers (V1), so they are shown in the panel's verifiers and never as edges.
- **A new endpoint serves PoCs**, `GET /runs/:id/pocs/:findingId`, validated against the PoC schema. The artifact route stays PNG-only. A PoC holds a route, fields and a payload, never a password, token or response body.
- **React Flow** (`@xyflow/react`, MIT, pinned to 12.12.0) draws it. It gives pan, zoom and selection, and the nodes are our own components, coloured with the console's tokens and always labelled with their state in words.

## Alternatives considered

| Option                                        | Why not                                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Hand-drawn SVG                                | No dependency, but pan, zoom, hit-testing and edge routing would be ours to write and keep.                          |
| A graph event written by the orchestrator     | A second source of truth beside the events that already say everything, and replays of old runs would have no graph. |
| Replaying each run on its own page            | The story of a gate crosses runs: the IDOR is found in one run and fixed in another.                                 |
| Serving every `.json` artifact from the route | The artifact store has other files; a route per kind keeps each one validated and none of them a way to read a file. |

## Consequences

- **Positive:** the graph needs no backend state, any past gate replays, and a bug in how it is drawn is fixed without touching the event log.
- **Negative:**
  - A run recorded before F3.10 shows one node per concrete path, not per route.
  - A node that was exploited and whose fix ended `open` stays `exploited`: the console cannot tell it from one nobody tried to fix, except by its panel.
  - With about 100 endpoints, the untested ones fill most of the canvas. The view frames what was attacked.
- **Follow-ups:** none in F3.10. The benchmark (F3.11) could colour nodes by the Juice Shop challenges they solve, but that is ground truth the console must not read from the target.
