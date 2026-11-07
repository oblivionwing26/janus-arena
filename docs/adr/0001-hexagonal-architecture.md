# ADR 0001: Hexagonal architecture (ports and adapters)

- **Status:** Accepted
- **Date:** 2026-11-05
- **Step:** F0.2 (enforced from F0.4)

## Context

Janus depends on many external systems that change quickly or are expensive to call: LLM providers, Playwright, Docker, Postgres, Redis, git hosts, static analysis tools. Most of its value is in the logic between them: friction detection, scope policies, budgets, verification rules. That logic must be testable without network access, API keys or containers, and replayable from recorded data.

## Decision

The orchestrator follows ports and adapters:

- `domain/` holds entities, value objects and port interfaces. It imports nothing except `shared-kernel`.
- `application/` holds use cases and imports only `domain/` and `shared-kernel`.
- `infrastructure/` implements ports (Anthropic, Playwright, Docker, Postgres, BullMQ, git, GitHub, static analysis tools). It never imports `interface/`.
- `interface/` is the composition root: Nest modules, HTTP controllers, SSE and queue workers. It is the only place that wires adapters to ports.

Every port has a contract test suite that both the real adapter and an in-memory fake must pass. The boundaries are enforced by dependency-cruiser in CI (`pnpm check:arch`), not only by convention.

## Alternatives considered

| Option                                                 | Why not                                                                                                  |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Layered NestJS modules without ports                   | Domain logic would import SDKs directly; tests would need mocks of vendor APIs and replay would be hard. |
| Functional core with plain functions and no interfaces | Reasonable, but ports with contract suites give a clearer checklist for fakes and recorded adapters.     |
| Microservices per capability                           | Far too much operational weight for a solo project.                                                      |

## Consequences

- **Positive:** domain and use cases run in milliseconds with no network; LLM, browser and sandbox can be replaced by recorded or fake adapters; the architecture is visible and checkable.
- **Negative:** more files and indirection than a simple layered app; each new capability needs a port, a fake and a contract suite.
- **Follow-ups:** F0.4 adds the dependency-cruiser boundary rules and proves they fail on a deliberate violation. Contract suites start in F0.5.

## Amendment (F1.4): pure workspace packages in application/

`application/` may also import `@janus/observation-builder`. Like `shared-kernel`, it is pure (no I/O, no SDKs; its own `observation-builder-pure` rule enforces it), so using it from a use case keeps use cases testable without network or containers. The navigator loop needs it to turn each page capture into what the model reads. Any other package joins this list only if it has the same kind of purity rule. Since F1.6 the list also has `@janus/friction-engine` (its `friction-engine-pure` rule allows only `zod` and `shared-kernel`): the navigator loop runs it after each step to decide when to take a screenshot, and `FinishRun` runs it to record the run's signals. Since F2.2 it also has `@janus/synthlab-report` (its `synthlab-report-pure` rule allows only `shared-kernel`, `stats` and `zod`): locating the code behind a friction zone reuses its `routeOf` and zone types.
