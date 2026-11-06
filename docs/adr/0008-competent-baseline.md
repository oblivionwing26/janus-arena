# ADR 0008: A competent baseline agent as the reference of every run

- **Status:** Accepted
- **Date:** 2026-11-06
- **Step:** F1.3 (persona), F1.7 (one per variant and seed), F1.9 (validation gate); recorded at gate G1, F1.13

## Context

A persona that fails a task tells us nothing by itself: the target may be hard to use, or the agent may simply be unable to use any web shop. Before reading persona failures as UX friction we need evidence that the agent machinery (observation, actions, prompt) can complete the tasks, and a per-variant yardstick for detectors such as `extra-steps`. The baseline must also stay apart from the A/B comparison, which is about the personas.

## Decision

Every run includes a **competent baseline**: the `competent-baseline` persona, with its own model role (ADR 0004; a stronger model than the personas' `navigator`), digital literacy 5, no biases and generous patience.

- `sessionMatrix` plays it once per variant and seed (and per task when the run has tasks), with the same synthetic data as the personas of that seed.
- Its success is reported next to each variant but never enters the paired comparison (`abSummary`), and `extra-steps` compares each persona with the baseline of the same variant.
- **Gate:** the baseline must complete at least 80 % of the target's tasks, as judged by the deterministic task oracle (orders read from the target as the shopper), never by the agent's own claim. Below that, the observation or the actions are fixed before any A/B is trusted.

## Alternatives considered

| Option                                              | Why not                                                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| No baseline: compare personas between variants only | A machinery failure looks the same on A and B and is read as "no difference", or worse.      |
| A scripted (non-LLM) baseline                       | Proves the target works, not that an LLM agent can use it; breaks with every markup change.  |
| The same model as the personas, without biases      | Mixes "the model can't" with "the persona wouldn't"; the stronger model sets an upper bound. |
| Validating with the agent's own `done`              | F1.11 showed an agent claiming the opposite of what it had just seen; only an oracle counts. |

## Consequences

- **Positive:** the F1.9 gate passed with 9/10 tasks verified by the oracle, so later persona failures mean something; `extra-steps` has a fair reference per variant.
- **Negative:** the baseline is most of the bill (about 0.03 € per session, up to 0.18 € when it loops, against about 0.002–0.004 € per persona session); it can still loop between cart and checkout (F1.9, F1.10).
- **Follow-ups:** re-run the gate whenever the observation builder, the action set or the target changes materially; loop detection in working memory would cut its cost (F1.9 note).
