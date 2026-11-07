# FinOps: what a session really costs

Measured from the `llm.call` events of real runs (F1.9), with the prices in `config/models.yaml`
(USD converted to EUR at its `usdToEur`). Recompute with `pnpm run:replay <runId>` and the event
log; these numbers age with the models, the prices and the observation builder.

## Tokens per step

One step is one decision of the navigator: the cached prefix (rules, persona, task, tools) plus
one message with memory, last result and the full observation (F1.4).

| Model (role)                                | Input, uncached | Input, from cache | Cache writes | Output | Input total | EUR / step |
| ------------------------------------------- | --------------: | ----------------: | -----------: | -----: | ----------: | ---------: |
| Haiku 5.5 (`navigator`), F1.7 run           |             543 |             2,111 |          178 |    217 |      ~2,830 |    0.00018 |
| Sonnet 5.5 (`competent-baseline`), F1.9 run |             639 |             2,157 |           83 |    166 |      ~2,880 |    0.00308 |

The master plan estimated 3,000–4,000 input tokens per step (cached prefix ~2,000 + page +
history). The measure is ~2,850, at the low end: the observation builder keeps pages small
(F1.1: 173 tokens on average) and three quarters of the input is read from the cache.

## Steps and cost per session

| Run                                             | Sessions | Steps / session | EUR / session |
| ----------------------------------------------- | -------: | --------------: | ------------: |
| F1.7 A/A, personas (Haiku)                      |        8 |            11.3 |        0.0020 |
| F1.7 A/A, baseline (Sonnet)                     |        2 |            12.0 |         0.032 |
| F1.9 validation, baseline (Sonnet) over 5 tasks |       10 |            27.0 |         0.083 |
| F1.10 coupon task, personas (Haiku)             |       10 |            20.5 |        0.0037 |
| F1.10 coupon task, baseline (Sonnet)            |        1 |            67.0 |         0.181 |
| F1.11 A/B, personas (Haiku)                     |       33 |            14.9 |        0.0023 |
| F1.11 A/B, baseline (Sonnet)                    |        4 |            13.0 |         0.032 |
| F2.3 UI Engineer (Sonnet), per seeded flaw      |        3 |             4.0 |         0.037 |
| F2.4 automatic A/B, whole command (coupon task) |       29 |               — |  0.59 (total) |

Steps per session dominate the bill. In F1.9 three sessions took 53–60 steps because the
baseline bounced between cart and checkout (see the F1.9 note in the ROADMAP); without them the
baseline averages 13 steps (~0.04 EUR).

## Rules of thumb

- A persona session on Haiku costs about 0.002 EUR; a baseline session on Sonnet 0.03–0.08 EUR.
  The baseline, one per variant and seed, is most of the cost of an A/B run.
- An A/B run of P personas × S seeds × 2 variants costs roughly
  `2·S·(P · 0.002 + 0.04)` EUR with today's step counts: the F1.7 run (P = 4, S = 1) cost 0.081 EUR.
- Cap runs with `maxSteps` in the run file: a looping agent is the main way to overspend.
