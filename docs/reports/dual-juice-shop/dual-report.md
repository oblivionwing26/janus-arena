# Janus dual report: juice-shop

Built by Janus `6c6234b0af2f` from the event logs listed under Provenance. The signed source is `dual-report.json`. Verify it with Janus, or with cosign alone:

```bash
pnpm janus verify <this folder>
cosign verify-blob --key keys/janus.pub --signature dual-report.json.sig --insecure-ignore-tlog dual-report.json
```

## UX A/B

Synthetic task success of the personas in run `01M781YMZD2X6JQ89Y8K43HSTP` (the competent baseline is a reference, not part of the comparison). Synthetic users do not predict revenue.

| Variant | Personas | Baseline |
| ------- | -------- | -------- |
| a       | 4/8      | 2/2      |
| b       | 4/8      | 2/2      |

B − A: 0.0 pts, 95 % interval [0.0 pts, 0.0 pts] (no-detectable-difference).

## Security findings

| Severity | Status    | Kind    | Tool     | Where                       | Title                                                                                                                                                                                   |
| -------- | --------- | ------- | -------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| high     | confirmed | dynamic | red-team | GET /rest/basket/:id        | Another user’s data is reachable (IDOR): GET /rest/basket/:id (user 26 received a record of user 25 holding "Apple Juice (1000ml)")                                                     |
| critical | confirmed | dynamic | red-team | POST /rest/user/login       | A session opens without the right credentials: POST /rest/user/login (a session for admin@juice-sh.op was opened without its credentials)                                               |
| high     | confirmed | dynamic | red-team | GET /#/search               | Injected script runs in the page (XSS): GET /#/search (a dialog (alert) showed the marker janus-01M6XY7CMV28T3236RFQABWD53 on http://janus-red-fqabwd53-app:3000/#/search)              |
| high     | confirmed | dynamic | red-team | PUT /api/BasketItems/:id    | The shop accepts a request it should refuse: PUT /api/BasketItems/:id (the order total is negative: -1.99)                                                                              |
| high     | confirmed | dynamic | red-team | POST /rest/products/reviews | The shop accepts a request it should refuse: POST /rest/products/reviews (janus-b-01m6xy96s812ebgx2tevvhw93h@janus.test appears 6 times where at most 1 is allowed)                     |
| high     | confirmed | dynamic | red-team | POST /rest/user/login       | An account’s password can be guessed without limit: POST /rest/user/login (20 wrong passwords were refused in 49 ms each on average, none throttled, and the right one still signed in) |

6 reproducible PoC(s) are in the JSON: each confirmed finding was replayed by code with fresh test users.

## Fixes

### Finding `01M781JQ9QN8YSC89FPJX0XTT0`: fixed after 1 iteration(s)

Branch `janus/fix-01M781JQ9QN8YSC89FPJX0XTT0`, run `01M781JQAW1AXVR90RJ50BV1RZ`.

| Verifier         | Result | Details                                                                                                   |
| ---------------- | ------ | --------------------------------------------------------------------------------------------------------- |
| build-checks     | passed | the patched variant compiles (tsc) and starts                                                             |
| poc-replay       | passed | the PoC no longer works: status 403                                                                       |
| regression-tests | passed | the regression test fails on the base and passes on the fix; 937 tests pass, 3 tests asserted the flaw    |
| synthlab-rerun   | passed | run 01M781YMZD2X6JQ89Y8K43HSTP: success A 4/8, B 4/8; GET /rest/basket/:id p95 83 → 86 ms (budget 133 ms) |

```diff
diff --git a/routes/basket.ts b/routes/basket.ts
--- a/routes/basket.ts
+++ b/routes/basket.ts
@@ -16,7 +16,16 @@
   return async (req: Request, res: Response, next: NextFunction) => {
     try {
       const id = req.params.id
+      const user = security.authenticatedUsers.from(req)
+      if (!user?.data?.id) {
+        res.status(401).json({ status: 'error', message: 'Authentication required' })
+        return
+      }
       const basket = await BasketModel.findOne({ where: { id }, include: [{ model: ProductModel, paranoid: false, as: 'Products' }] })
+      if (basket != null && basket.UserId !== user.data.id) {
+        res.status(403).json({ status: 'error', message: 'Forbidden' })
+        return
+      }
       /* jshint eqeqeq:false */
       challengeUtils.solveIf(challenges.basketAccessChallenge, () => {
         const user = security.authenticatedUsers.from(req)
```

### Finding `01M782Q7Q6T2RBCV11RZH3ZR4Z`: fixed after 2 iteration(s)

Branch `janus/fix-01M782Q7Q6T2RBCV11RZH3ZR4Z`, run `01M782Q7RM5RG63STZT959G7KQ`.

| Verifier         | Result | Details                                                                                                                                                           |
| ---------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| build-checks     | passed | the patched variant compiles (tsc) and starts                                                                                                                     |
| poc-replay       | passed | the PoC no longer works: the shop refused an order with quantity -1                                                                                               |
| regression-tests | passed | the regression test fails on the base and passes on the fix; 940 tests pass, 0 tests asserted the flaw                                                            |
| synthlab-rerun   | passed | run 01M7838V45QPDBGQ5RP5NWGD8J: success A 4/8, B 4/8; PUT /api/BasketItems/:id not measured on both variants; POST /api/BasketItems p95 24 → 20 ms (budget 74 ms) |

```diff
diff --git a/routes/basketItems.ts b/routes/basketItems.ts
--- a/routes/basketItems.ts
+++ b/routes/basketItems.ts
@@ -72,6 +72,11 @@
         if (item == null) {
           throw new Error('No such item found!')
         }
+        const newQuantity = Number(req.body.quantity)
+        if (!Number.isInteger(newQuantity) || newQuantity < 1) {
+          res.status(400).json({ error: 'Invalid quantity' })
+          return
+        }
         void quantityCheck(req, res, next, item.ProductId, req.body.quantity).catch((error: Error) => {
           next(error)
         })
```

## Trade-offs

### Finding `01M786YYJN2NDQHVQT1HGGNY93`

| Alternative       | Exploitable (V1) | Success, original → fix (V3) | p95, original → fix |
| ----------------- | ---------------- | ---------------------------- | ------------------- |
| free fix          | no               | 4/6 → 5/6                    | 50 → 90 ms          |
| account lockout   | no               | 4/6 → 3/6                    | 46 → 41 ms          |
| progressive delay | not measured     | —                            | —                   |

**Recommendation:** free fix closes the attack and 5/6 shoppers succeed (4/6 on the original); the other safe alternatives keep fewer or answer slower (account lockout: 3/6).

## Cost

Total cost: 1.10 €

## Provenance

| Run                        | Role      | Event log SHA-256                                                |
| -------------------------- | --------- | ---------------------------------------------------------------- |
| 01M781YMZD2X6JQ89Y8K43HSTP | ux        | 620c50d769ee7e780dfce68068d9a571a87f63f15934e7145147b9f4d1b8ae5b |
| 01M6XY7CMV28T3236RFQABWD53 | red-team  | ab5f652305ddf148882f9aa9c3b7f2a4dba6acc63c954f566e234ef5baa4dccd |
| 01M7853NTYZMW0QNB6SZVHY57D | red-team  | cf9aad05d57ab45b83af28fb2c2faf7163579fed6a3c9c41b97cfb1a566ed08b |
| 01M781JQAW1AXVR90RJ50BV1RZ | blue-team | a96df8a7faa35a2c97898cadd436dac2def68db8bfc9f94423ea63131b18be55 |
| 01M782Q7RM5RG63STZT959G7KQ | blue-team | 36f3e38260dfaf4ad31b1d865b2817bdc406a23643e7a9a0adfff4d0dc9da27f |
| 01M7838V45QPDBGQ5RP5NWGD8J | v3        | 765b9adb3983b8e16897c22180c9cecb70125efa03c33b7b2cb0bae6eb0b14f0 |

| Tool                     | Version                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------- |
| node                     | v24.12.0                                                                                              |
| janus                    | 6c6234b0af2f5f09e3afc91c2c4ee2daaf326b81                                                              |
| juice-shop image         | bkimminich/juice-shop:v20.3.0@sha256:cea5a4af4aacee498c491491af0408934ec81d004035c0a02ef3e54395e3bf27 |
| model navigator          | claude-haiku-5-5                                                                                      |
| model competent-baseline | claude-sonnet-5-5                                                                                     |
| model ui-engineer        | claude-sonnet-5-5                                                                                     |
| model red-team           | claude-sonnet-5-5                                                                                     |
| model blue-team          | claude-sonnet-5-5                                                                                     |
| model architect          | claude-opus-5-5                                                                                       |
