# ADR 0005: Sandboxes without internet egress

- **Status:** Accepted
- **Date:** 2026-11-05
- **Step:** F0.2 (implemented in F0.8, scope enforcement in F3.1)

## Context

Janus runs target apps, headless browsers and offensive tooling. A misconfigured agent, a prompt-injected page or a buggy exploit must not be able to reach third-party systems or leak data. Attacking systems without authorization is illegal, so the platform itself must make that impossible by design, not by trust.

## Decision

- All variants and agent browsers run on a dedicated Docker network (`janus-sbx`) created with `internal: true`, so containers have no route to the internet.
- The only host reachable from agents is the variant under test. A `ScopePolicy` (allowed hosts, excluded paths, allowed test types, rate limit) and a `NetworkGuard` block everything else and emit an event.
- Offensive modules require verified ownership of the target (token at `/.well-known/janus-verify.txt`). The sandbox goes through the same flow.
- The Docker socket is never mounted into an agent or target container. Only the orchestrator talks to Docker, through a proxy that allowlists operations.
- Page content and tool output are untrusted data, never instructions. Agents obey the orchestrator only.

## Alternatives considered

| Option                                     | Why not                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Egress allowlist instead of no egress      | More flexible, but any allowlist entry is a possible exfiltration path; unnecessary for the demo targets. |
| Run agents on the host with firewall rules | Weaker isolation and easy to misconfigure.                                                                |
| Full VM per run                            | Strong isolation but heavy and slow for a solo project.                                                   |

## Consequences

- **Positive:** safe by default; legal and reputational risk is much lower; the isolation test (a request to a public host must fail) is simple and automatic.
- **Negative:** targets that need external services must be stubbed; pulling images or packages happens outside the sandbox at build time.
- **Follow-ups:** F0.8 adds the isolation test; F3.1 adds scope policy, ownership verification and the network guard; later steps never relax these rules without a new ADR.
