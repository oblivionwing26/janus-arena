# ADR 0009: Paired A/B design with seeded intervals and an explicit exit rule

- **Status:** Accepted
- **Date:** 2026-11-06
- **Step:** F1.7 (pairing), F1.8 (statistics), F1.11 (first A/B); recorded at gate G1, F1.13

## Context

Synthetic sessions are expensive (each one is an LLM loop) and noisy (the same persona can succeed once and fail the next time). Runs will have tens of sessions per variant, not thousands. We must compare variants without overstating results: CLAUDE.md forbids conversion claims and asks for "synthetic task success" with confidence intervals. Reports must also be reproducible: the same events must give the same numbers.

## Decision

- **Pairing:** each persona and seed plays every variant (`sessionMatrix`); the seed fixes the session's synthetic data, so a pair differs only by the variant and the LLM's own variation. Infrastructure retries are new sessions with their own `agentId`.
- **Per-variant rate:** synthetic task success of the personas with a Wilson 95 % interval (z = 1.959964). The task oracle's `task.verified` decides success when the run has tasks; otherwise the agent's outcome.
- **Difference:** B − A over complete pairs, with a percentile bootstrap of the pair differences (10,000 resamples, own seeded generator mulberry32, seed 20261106, linear interpolation), so the same events always give the same interval.
- **Exit rule:** if the interval of B − A contains 0, the verdict is "no detectable difference"; otherwise "B higher" or "B lower". The report says it in those words, never "lift".
- **Exclusions:** sessions without `session.ended` (infrastructure), out of budget, or whose task could not be verified are left out, and so are their pairs.

Everything lives in the pure package `packages/stats` and is checked against hand-computed values and an independent Python reference.

## Alternatives considered

| Option                                | Why not                                                                                              |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Independent samples per variant       | Needs more sessions for the same power; persona mix differences would masquerade as variant effects. |
| Normal-approximation (Wald) intervals | Wrong near 0 % and 100 % and with small n, which is our normal case.                                 |
| Unseeded bootstrap or `Math.random`   | The same run would report different intervals on every replay.                                       |
| p-values and significance thresholds  | Invite "significant uplift" claims; an interval and a plain exit rule say more and promise less.     |

## Consequences

- **Positive:** the A/A run of F1.7 reports no difference, as it must; F1.11's first real A/B reports b − a = −0.13 [−0.31, 0.00] over 16 pairs, "no detectable difference", with every number reproducible from the exported run.
- **Negative:** with 16 pairs intervals are wide and only large effects show; without tasks, success is the agent's word, which F1.11 showed can contradict what it saw.
- **Follow-ups:** A/B runs with tasks and the oracle (fix first: a shopper without an account must count as "no order", not "unverifiable"); more pairs when the budget allows.
