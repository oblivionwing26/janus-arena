# Janus Arena — Vision

## One-sentence product

Janus Arena is a pre-release gate that detects UX-friction regressions and security regressions in the same pull request, and tells you how much UX each security fix costs.

## The problem

Teams test usability and security separately, with different tools, at different times. In real traffic they happen at once, and they interact: a stricter check (rate limit, CAPTCHA, extra verification step) closes a hole and silently hurts legitimate users. Today nobody measures that trade-off before release.

## What Janus does

Two halves share one event log and one report.

**SynthLab** runs synthetic user personas through a web app with a real browser (Playwright). An LLM decides each next action; everything else is computed by code: rage clicks, dead clicks, backtracking, form errors, extra steps against a competent baseline, abandonment, technical errors, web vitals. The result is a friction heatmap and a paired A/B comparison between two variants of the app.

**WarRoom** audits a variant before it ships:

1. Static audit (Semgrep, gitleaks, osv-scanner, dependency-cruiser, attack-surface map read with the TypeScript compiler).
2. Red Team attacks the variant inside an isolated sandbox. An attack counts only if a deterministic oracle confirms it, and every finding carries a reproducible proof of concept.
3. Blue Team proposes patches. A patch is accepted only if three independent verifiers pass: the original exploit fails, the tests pass (plus a new regression test), and SynthLab re-run shows no unacceptable drop in task success or latency.

**Output:** a signed dual report (UX A/B + security, including the trade-off table for each fix) attached to a pull request that a human reviews and merges. Janus never merges.

## What makes it different

Synthetic-user testing and AI pentesting are both crowded categories. Janus does not compete on either alone. Its defensible part is the loop between them: every security patch is measured for UX cost, and every UX change is measured for attack-surface cost.

## What Janus does not claim

- Synthetic users do not predict real revenue or conversion. Published studies show LLM personas diverge from real users, so reports speak of **synthetic task success** with confidence intervals, never "conversion lift". A result whose interval crosses zero is reported as "no detectable difference".
- AI pentesting is not fully autonomous. Findings need a reproducible proof of concept, and patches need human review.
- Janus is not a replacement for real user research or for a professional penetration test.

## Principles

1. **Deterministic first, LLM second.** Code measures; the LLM decides, proposes and writes prose. An LLM opinion is never evidence.
2. **Reproducible by construction.** An append-only event log is the source of truth. Any run replays without calling a model or needing an API key.
3. **Safe by design.** Offensive modules refuse to run without a verified scope. Sandboxes have no internet access. Target content is untrusted input.
4. **Cost is a feature.** Every run has a budget; every call reports its cost.
5. **Honest numbers.** Publish recall, intervals and failures, including the unflattering ones.

## Who it is for

- **Primary goal:** a portfolio-grade open project demonstrating architecture, security and LLM-systems judgement.
- **Possible commercial path:** small SaaS teams and agencies that ship often. This is validated with manual audits before any multi-tenant product is built (see F4.4 in the roadmap).

## Scope boundaries

Out of scope until the full demo (gate G2): episodic memory with pgvector, personas built from scraped reviews, swarms above 20 agents, multi-tenant accounts and billing, frameworks other than Next.js, prompt injection against target chatbots, vision-based navigation as the main mode. The full list lives in `docs/ROADMAP.md`.

## Related documents

- `docs/ROADMAP.md` — step-by-step development plan with "Done when" criteria.
- `docs/adr/` — architecture decision records.
- `CLAUDE.md` — engineering rules and the current step.
