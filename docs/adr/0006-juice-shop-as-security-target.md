# ADR 0006: OWASP Juice Shop as the security target instead of seeded flaws in ShopLab

- **Status:** Accepted
- **Date:** 2026-11-05
- **Step:** F0.7

## Context

The roadmap planned ShopLab (our own demo shop, repo `janus-shoplab`) to carry two kinds of
seeded ground truth: UX friction (sub-delivery B) and security flaws (sub-delivery C). The UX part
is built and documented in `UX_FLAWS.md`. Building and maintaining our own deliberately insecure
code is a poor use of a solo project's time, and it is not needed: well-known, deliberately
vulnerable training apps already exist, with public, documented challenges. The roadmap already
uses one of them, OWASP Juice Shop, as the public benchmark in F3.11.

## Decision

ShopLab stays the **UX target**: a correct shop with seeded UX friction only, plus its own tests
of legitimate behaviour. The **security target** for WarRoom (Red Team, Blue Team, oracles, PoCs)
is OWASP Juice Shop, run unmodified inside the sandbox with its own `ScopePolicy`.

- ShopLab's canary values stay: they let leak oracles and SynthLab re-checks tell users apart.
- No deliberately insecure code is added to ShopLab; there is no `SEEDED_VULNS.md`.
- `UX_FLAWS.md` is ground truth and must never reach an agent: workspace cloning (F0.8) and
  code-context builders (F2.2, F2.5) exclude it.

## Alternatives considered

| Option                                              | Why not                                                                                       |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Seed security flaws in ShopLab as planned           | Extra code to write and keep realistic; duplicates what public training apps already provide. |
| Use another deliberately vulnerable app (e.g. DVWA) | Juice Shop is already in the roadmap, is maintained by OWASP and documents its challenges.    |
| Drop a security target until F3                     | F3 planning needs to know the target early; deciding now avoids rework in F0.8 and F2.        |

## Consequences

- **Positive:** less custom code; findings are checked against a public, recognised benchmark;
  ShopLab stays a clean UX baseline whose own tests describe correct behaviour.
- **Negative:** the "UX cost of a security fix" demo (F3.6) needs a target where a patch affects
  both security and UX; with two separate apps that must be designed again. Juice Shop's code and
  stack differ from ShopLab, so static-analysis and Blue Team adapters must handle both.
- **Follow-ups:** rewrite F3.1, F3.3, F3.4, F3.6 and F4.2 against Juice Shop when phases are
  re-estimated after F2; F0.8 and F2.2 exclude `UX_FLAWS.md` from anything agents read.
