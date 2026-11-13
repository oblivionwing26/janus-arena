# Janus dual report: shoplab

Built by Janus `a221f3b163ae` from the event logs listed under Provenance. The signed source is `dual-report.json`. Verify it with Janus, or with cosign alone:

```bash
pnpm janus verify <this folder>
cosign verify-blob --key keys/janus.pub --signature dual-report.json.sig --insecure-ignore-tlog dual-report.json
```

## UX A/B

Synthetic task success of the personas in run `01M796YBE1ZZMFK0266VWSX956` (the competent baseline is a reference, not part of the comparison). Synthetic users do not predict revenue.

| Variant | Personas | Baseline |
| --- | --- | --- |
| a | 0/6 | 1/1 |
| b | 5/6 | 1/1 |

B − A: 83.3 pts, 95 % interval [50.0 pts, 100.0 pts] (b-higher).

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
| 01M796YBE1ZZMFK0266VWSX956 | ux | 344e77ae35703b5e01b8a23ee00d6157322e11f89520d4928ccda07b29a00512 |
| 01M797M96H2ZDM7K31R7ZM9SY3 | audit | ca8baa18f255c7e3d7032ed0b22db238a049db3fb121171d17429c831eff03e5 |

| Tool | Version |
| --- | --- |
| node | v24.12.0 |
| janus | a221f3b163ae7345d7cbd26193985d23d6a3b450 |
| model navigator | claude-haiku-5-5 |
| model competent-baseline | claude-sonnet-5-5 |
| model ui-engineer | claude-sonnet-5-5 |
| model red-team | claude-sonnet-5-5 |
| model blue-team | claude-sonnet-5-5 |
| model architect | claude-opus-5-5 |
