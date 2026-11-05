# ADR 0004: Select LLM models by role, not by name

- **Status:** Accepted
- **Date:** 2026-11-05
- **Step:** F0.2 (implemented in F0.6)

## Context

Janus makes many LLM calls with very different needs: cheap, high-volume navigation steps; code generation; attack and patch reasoning; occasional architectural synthesis. Model names, prices and capabilities change often, and cost is a first-class concern. Hard-coded model identifiers would spread through the code and make cost control and swaps difficult.

## Decision

Code never names a model. It names a **role**: `navigator`, `competent-baseline`, `ui-engineer`, `red-team`, `blue-team`, `architect`. The mapping from role to model, and the price table used for cost estimates, live in `config/models.yaml` and are loaded by the gateway.

All calls go through `LLMGatewayPort`, which also enforces the per-run budget (warning at 80 percent, abort at 100 percent), marks prompt caching only on the stable prefix (system prompt, persona, tool definitions, audit context), and emits an `llm.call` event with tokens and estimated cost. Prices are never hard-coded.

## Alternatives considered

| Option                                                     | Why not                                                           |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| Model names in code or environment variables per call site | Scattered, hard to audit, and a model swap becomes a code change. |
| One model for everything                                   | Either too costly for navigation or too weak for patching.        |
| Automatic model routing by an LLM                          | Adds cost and non-determinism where a static table is enough.     |

## Consequences

- **Positive:** swapping or testing a model is a config change; cost per role is visible; recorded adapters can replay by role and request hash.
- **Negative:** roles can drift from real needs; the price table must be kept current by hand.
- **Follow-ups:** F0.6 implements the gateway, budgets and `RecordedLLMAdapter`; F1.9 measures real tokens per step to update the FinOps estimates.
