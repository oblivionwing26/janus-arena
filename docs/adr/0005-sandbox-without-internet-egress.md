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

## Implementation notes (F3.1)

- `NetworkGuard` (domain) decides every request of the HTTP clients and the agent browser: origin, excluded path (compared case-insensitively after decoding and resolving `..`), test type, verification and rate. Offensive tests need a `VerifiedScope`, which only `VerifiedScope.verify()` creates from the run's token served by every origin.
- The orchestrator has no route into `janus-sbx`, so HTTP to sandboxed targets is sent by the Playwright server already on that network (its request API, no page). Targets outside the sandbox use a plain `fetch` client. Neither follows redirects.
- The only `docker cp` into a target is the token file to `<dir>/.well-known/janus-verify.txt` of a `janus-<variant>-app` container.

## Implementation notes (F0.8)

- The socket proxy (`tecnativa/docker-socket-proxy`, pinned by digest) filters by API section, not by request body: with `CONTAINERS` and `POST` open, anything that can reach it could create a privileged container. So it listens on `127.0.0.1:23750` only, never joins `janus-sbx`, and only the orchestrator's `DockerCli` uses it. `EXEC`, `VOLUMES`, `SWARM`, `SECRETS`, `PLUGINS` and the rest stay closed.
- `DockerCli` refuses any `DOCKER_HOST` other than the local proxy, and refuses bind mounts, host namespaces, extra capabilities, devices, the socket path and the `buildx`, `builder`, `exec`, `volume`, `plugin` and `swarm` commands.
- Images are built with the engine's classic builder (`DOCKER_BUILDKIT=0`, plain `POST /build`). The first attempt used buildx, whose default builder silently created its own **privileged** BuildKit container through the proxy; it was removed and buildx is now refused.
- Variant containers share `janus-sbx` and are told apart by name (`janus-<variant>-app`, `janus-<variant>-db`); isolation between variants of the same run is not a goal until F3.
- `docker-compose.yml` owns `janus-sbx` (`internal: true`); `DockerSandbox` refuses to run if it is missing or not internal.
- Agent browsers (F0.9) are a Playwright server on `janus-sbx` only. The orchestrator reaches it through `browser-relay`, a `socat` container on both networks that forwards a single port to `127.0.0.1:53000` and runs no agent code. Each browser context also aborts requests outside the variant's origin.
