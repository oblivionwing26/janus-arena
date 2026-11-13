# Janus dual report: shoplab

Built by Janus `95100773e82f` from the event logs listed under Provenance. The signed source is `dual-report.json`. Verify it with Janus, or with cosign alone:

```bash
pnpm janus verify <this folder>
cosign verify-blob --key keys/janus.pub --signature dual-report.json.sig --insecure-ignore-tlog dual-report.json
```

## UX A/B

Synthetic task success of the personas in run `01M6VD0MWENHQCSKST7EHK0WG1` (the competent baseline is a reference, not part of the comparison). Synthetic users do not predict revenue.

| Variant | Personas | Baseline |
| --- | --- | --- |
| a | 1/6 | 0/1 |
| b | 5/7 | 1/1 |

B − A: 50.0 pts, 95 % interval [16.7 pts, 83.3 pts] (b-higher).

## Security findings

| Severity | Status | Kind | Tool | Where | Title |
| --- | --- | --- | --- | --- | --- |

0 reproducible PoC(s) are in the JSON: each confirmed finding was replayed by code with fresh test users.

## Fixes

_No fixes in this report._

## Trade-offs

_No trade-off reports in this report._

## Cost

Total cost: 0.28 €

## Provenance

| Run | Role | Event log SHA-256 |
| --- | --- | --- |
| 01M6VD0MWENHQCSKST7EHK0WG1 | ux | 82e92757880fe2d05dfc560aeda7059c6a0a0f0ec4a39fb4e8bdceb2650fec59 |
| 01M6WCBACRGREB2TRVXS34PZAW | audit | 8c2504086b01878d717f8cfc428ae7f4e54c28c45b0c745b92cf74fed29d18fd |

| Tool | Version |
| --- | --- |
| node | v24.12.0 |
| janus | 95100773e82f9440bd688ba322cf73c722b14f71 |
| model navigator | claude-haiku-5-5 |
| model competent-baseline | claude-sonnet-5-5 |
| model ui-engineer | claude-sonnet-5-5 |
| model red-team | claude-sonnet-5-5 |
| model blue-team | claude-sonnet-5-5 |
| model architect | claude-opus-5-5 |
