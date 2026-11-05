# ADR 0002: NestJS with the Fastify adapter

- **Status:** Accepted
- **Date:** 2026-11-05
- **Step:** F0.2 (implemented in F0.4)

## Context

The orchestrator exposes an HTTP API, streams events over SSE, runs queue workers and wires many adapters to ports (see ADR 0001). It needs dependency injection, modular structure and good support for streaming. The author already works with Node and Next.js.

## Decision

Use NestJS with the Fastify platform adapter (`@nestjs/platform-fastify`) for `apps/orchestrator-api`. Nest providers and DI tokens are used only in `interface/` as the composition root; `domain/` and `application/` stay free of Nest decorators.

## Alternatives considered

| Option                                  | Why not                                                                         |
| --------------------------------------- | ------------------------------------------------------------------------------- |
| NestJS with Express                     | Slower and less suited to streaming; Fastify costs nothing extra to choose now. |
| Plain Fastify with manual wiring        | Lighter, but DI for many adapters and fakes would be reinvented by hand.        |
| Hono or Express with a custom container | Same trade-off, and less familiar structure for readers of the portfolio.       |

## Consequences

- **Positive:** built-in DI maps naturally onto ports and adapters; modules, guards and pipes are available; Fastify gives good throughput and SSE support.
- **Negative:** decorators and metadata add framework weight; some Nest ecosystem packages assume Express.
- **Follow-ups:** the "no Nest in domain" rule is enforced by the architecture checks added in F0.4.
