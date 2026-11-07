# ADR 0010: Static analysis tools in throwaway containers, with Janus's own Semgrep rules

- **Status:** Accepted
- **Date:** 2026-11-07
- **Step:** F2.5

## Context

WarRoom starts by reading the target's code (F2.5): Semgrep for code patterns, gitleaks for secrets, osv-scanner for vulnerable dependencies and dependency-cruiser for architecture. These tools read untrusted repositories. Janus only talks to Docker through the socket proxy, which refuses bind mounts (ADR 0005), and no sandbox may reach the internet. Two tools want the network by default: Semgrep's registry rule packs and osv-scanner's advisory database. The security target is OWASP Juice Shop (ADR 0006), whose repository holds its own ground truth: `vuln-code-snippet` comments on the vulnerable lines and the challenge fixes in `data/static/codefixes/`.

## Decision

- Each tool runs from a **pinned image** in a **throwaway container**: `docker create`, `docker cp` of the workspace into it (DockerCli only lets `cp` copy into a `janus-tool-*` container, never out), `docker start --attach`, then removal. Tools read the code; nothing of the target runs.
- **No network** for Semgrep and gitleaks. **osv-scanner is the one exception**: it gets a bridge network to query osv.dev with package names and versions. dependency-cruiser runs in-process (it only parses imports).
- Semgrep uses **Janus's own rules** in `rules/semgrep/`, each with `semgrep --test` cases, not the registry packs, which would need the network and whose licence restricts redistribution.
- Every tool's output is normalised to one `StaticFinding` (tool, rule, severity, file, line, snippet of at most 5 lines read from the workspace) and recorded as `finding.created` with status `suspected`.
- gitleaks findings never carry the secret: its `Secret` and `Match` fields are dropped and the value is replaced by `[REDACTED]` in the snippet.

## Alternatives considered

| Option                                     | Why not                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Bind-mount the workspace                   | The proxy and DockerCli refuse bind mounts by design (ADR 0005).                              |
| Run the tools on the host                  | More binaries to install and keep in step; no isolation from the code they read.              |
| Semgrep registry packs (`p/owasp-top-ten`) | Need network at scan time and cannot be vendored freely; own rules are small and tested.      |
| osv-scanner offline database               | Must be downloaded with network anyway and kept fresh; sending package coordinates is enough. |

## Consequences

- **Positive:** the "Done when" holds on Juice Shop v20.3.0: the own rules find its DOM XSS (`search-result.component.ts:146`) and the negative-quantity price manipulation (`routes/basketItems.ts:94-95`), with 13 findings in total, all known Juice Shop flaws. No secret value is ever recorded.
- **Negative:** own rules cover less than a registry pack and must be written and tested by hand; the quantity rule misses functions whose parameters have inline object types. osv-scanner needs the network.
- **Follow-ups:** before any agent reads Juice Shop's code (F2.6 and later), strip its `vuln-code-snippet` comments and exclude `data/static/codefixes/` and its challenge descriptions, as `UX_FLAWS.md` is excluded for ShopLab.
