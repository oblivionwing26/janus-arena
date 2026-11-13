# Janus dual report: juice-shop

Built by Janus `a221f3b163ae` from the event logs listed under Provenance. The signed source is `dual-report.json`. Verify it with Janus, or with cosign alone:

```bash
pnpm janus verify <this folder>
cosign verify-blob --key keys/janus.pub --signature dual-report.json.sig --insecure-ignore-tlog dual-report.json
```

## UX A/B

Synthetic task success of the personas in run `01M795H2WD2W08N1N6J6NZPPXR` (the competent baseline is a reference, not part of the comparison). Synthetic users do not predict revenue.

| Variant | Personas | Baseline |
| --- | --- | --- |
| a | 4/8 | 1/2 |

_No complete persona pairs to compare._

## Security findings

| Severity | Status | Kind | Tool | Where | Title |
| --- | --- | --- | --- | --- | --- |
| high | confirmed | dynamic | red-team | GET /rest/basket/:id | Another user’s data is reachable (IDOR): GET /rest/basket/:id (user 26 received a record of user 25 holding "Apple Juice (1000ml)") |
| critical | confirmed | dynamic | red-team | POST /rest/user/login | A session opens without the right credentials: POST /rest/user/login (a session for admin@juice-sh.op was opened without its credentials) |
| high | confirmed | dynamic | red-team | GET /#/search | Injected script runs in the page (XSS): GET /#/search (a dialog (alert) showed the marker janus-01M795W7YJJPMZGQTFSHPRGT13 on http://janus-red-shprgt13-app:3000/#/search) |
| high | confirmed | dynamic | red-team | PUT /api/BasketItems/:id | The shop accepts a request it should refuse: PUT /api/BasketItems/:id (the order total is negative: -1.99) |
| high | confirmed | dynamic | red-team | POST /rest/products/reviews | The shop accepts a request it should refuse: POST /rest/products/reviews (janus-b-01m795xqjjrr0rt6skzfjnc1ev@janus.test appears 6 times where at most 1 is allowed) |
| high | confirmed | dynamic | red-team | POST /rest/user/login | An account’s password can be guessed without limit: POST /rest/user/login (20 wrong passwords were refused in 49 ms each on average, none throttled, and the right one still signed in) |

6 reproducible PoC(s) are in the JSON: each confirmed finding was replayed by code with fresh test users.

## Fixes

### Finding `01M795XRHJVMMC45465NY0BPT1`: open after 3 iteration(s)



| Verifier | Result | Details |
| --- | --- | --- |
| build-checks | passed | the patched variant compiles (tsc) and starts |
| poc-replay | passed | the PoC no longer works: no session was opened |
| regression-tests | failed | no regression test can be generated from a auth-bypass PoC yet |
| build-checks | passed | the patched variant compiles (tsc) and starts |
| poc-replay | passed | the PoC no longer works: no session was opened |
| regression-tests | failed | no regression test can be generated from a auth-bypass PoC yet |
| build-checks | passed | the patched variant compiles (tsc) and starts |
| poc-replay | passed | the PoC no longer works: no session was opened |
| regression-tests | failed | no regression test can be generated from a auth-bypass PoC yet |

## Trade-offs

_No trade-off reports in this report._

## Cost

Total cost: 0.40 €

## Provenance

| Run | Role | Event log SHA-256 |
| --- | --- | --- |
| 01M795H2WD2W08N1N6J6NZPPXR | ux | d8d6adebe44969c3afa1c935b3eb05bdd8fdf903aa3a5ac763f80b669c08ab60 |
| 01M795W7YJJPMZGQTFSHPRGT13 | red-team | 895fddd84799866bff8dfe52dd13b528bc47a4ffec743ca9949a28471d9d69bf |
| 01M79627VH9ACKKMYX1X898830 | blue-team | 7f586e5d98cf1c844187dc9468e515682b8df04c8f337b7fa5d318e7a937280c |

| Tool | Version |
| --- | --- |
| node | v24.12.0 |
| janus | a221f3b163ae7345d7cbd26193985d23d6a3b450 |
| juice-shop image | bkimminich/juice-shop:v20.3.0@sha256:cea5a4af4aacee498c491491af0408934ec81d004035c0a02ef3e54395e3bf27 |
| model navigator | claude-haiku-5-5 |
| model competent-baseline | claude-sonnet-5-5 |
| model ui-engineer | claude-sonnet-5-5 |
| model red-team | claude-sonnet-5-5 |
| model blue-team | claude-sonnet-5-5 |
| model architect | claude-opus-5-5 |
