# Trade-off report: brute-force at POST /rest/user/login

Finding `01M786YYJN2NDQHVQT1HGGNY93` on juice-shop · Blue Team run `01M786YYM674EPYAMSJAREC0S3`. Exploitable is the PoC replayed by code on the fix (V1); success and p95 come from a paired SynthLab run, original against fix, with synthetic shoppers (V3). Synthetic task success, not conversion.

| Alternative       | Exploitable (V1) | Success, original → fix (V3) | p95 POST /rest/user/login | V3      |
| ----------------- | ---------------- | ---------------------------- | ------------------------- | ------- |
| free fix          | no               | 4/6 → 5/6                    | 50 → 90 ms                | passed  |
| account lockout   | no               | 4/6 → 3/6                    | 46 → 41 ms                | passed  |
| progressive delay | not measured     | —                            | —                         | not run |

**Recommendation:** free fix closes the attack and 5/6 shoppers succeed (4/6 on the original); the other safe alternatives keep fewer or answer slower (account lockout: 3/6).

Cost: 0.98 €

## Alternatives

### free fix

the PoC no longer works: the shop throttled at guess 11 (429); run 01M7872J0PTG23PXJ1VN4589ZQ: success A 4/6, B 5/6; POST /rest/user/login p95 50 → 90 ms (budget 100 ms)

```diff
diff --git a/routes/login.ts b/routes/login.ts
--- a/routes/login.ts
+++ b/routes/login.ts
@@ -14,6 +14,28 @@
 import { type User } from '../data/types'
 import * as utils from '../lib/utils'

+const MAX_LOGIN_ATTEMPTS = 10
+const LOGIN_WINDOW_MS = 5 * 60 * 1000
+const MAX_TRACKED_ACCOUNTS = 10000
+const loginAttempts = new Map<string, { count: number, windowStart: number }>()
+
+function registerLoginAttempt (key: string): boolean {
+  const now = Date.now()
+  if (loginAttempts.size >= MAX_TRACKED_ACCOUNTS) {
+    for (const [k, v] of loginAttempts) {
+      if (now - v.windowStart >= LOGIN_WINDOW_MS) loginAttempts.delete(k)
+    }
+    if (loginAttempts.size >= MAX_TRACKED_ACCOUNTS) loginAttempts.clear()
+  }
+  let entry = loginAttempts.get(key)
+  if (!entry || now - entry.windowStart >= LOGIN_WINDOW_MS) {
+    entry = { count: 0, windowStart: now }
+    loginAttempts.set(key, entry)
+  }
+  entry.count++
+  return entry.count <= MAX_LOGIN_ATTEMPTS
+}
+
 export function login () {
   function afterLogin (user: User, res: Response, next: NextFunction) {
     verifyPostLoginChallenges(user)
@@ -29,10 +51,18 @@
   }

   return (req: Request, res: Response, next: NextFunction) => {
+    const attemptKey = String(req.body.email || '').toLowerCase()
+    if (!registerLoginAttempt(attemptKey)) {
+      res.status(429).send(res.__('Too many login attempts. Please try again later.'))
+      return
+    }
     verifyPreLoginChallenges(req)
     models.sequelize.query(`SELECT * FROM Users WHERE email = '${req.body.email || ''}' AND password = '${security.hash(req.body.password || '')}' AND deletedAt IS NULL`, { model: UserModel, plain: true })
       .then((authenticatedUser) => {
         const user = utils.queryResultToJson(authenticatedUser)
+        if (user.data?.id) {
+          loginAttempts.delete(attemptKey)
+        }
         if (user.data?.id && user.data.totpSecret !== '') {
           res.status(401).json({
             status: 'totp_token_required',
```

### account lockout

the PoC no longer works: the shop throttled at guess 6 (429); run 01M788C3X8H7J2Z34B1BJDW5FC: success A 4/6, B 3/6; POST /rest/user/login p95 46 → 41 ms (budget 96 ms); Inés was refused with 429 in both sessions on B and never completed her purchase there

```diff
diff --git a/routes/login.ts b/routes/login.ts
--- a/routes/login.ts
+++ b/routes/login.ts
@@ -14,6 +14,14 @@
 import { type User } from '../data/types'
 import * as utils from '../lib/utils'

+const MAX_FAILED_LOGINS = 5
+const LOCKOUT_MS = 5 * 60 * 1000
+const failedLogins = new Map<string, { count: number, lockedUntil: number }>()
+
+function lockoutKey (req: Request): string {
+  return String(req.body.email || '').trim().toLowerCase()
+}
+
 export function login () {
   function afterLogin (user: User, res: Response, next: NextFunction) {
     verifyPostLoginChallenges(user)
@@ -29,10 +37,31 @@
   }

   return (req: Request, res: Response, next: NextFunction) => {
+    const key = lockoutKey(req)
+    const now = Date.now()
+    const entry = failedLogins.get(key)
+    if (entry && entry.lockedUntil > now) {
+      res.setHeader('Retry-After', Math.ceil((entry.lockedUntil - now) / 1000))
+      res.status(429).send(res.__('Too many failed login attempts. Please try again later.'))
+      return
+    }
+    if (entry && entry.lockedUntil !== 0) {
+      failedLogins.delete(key) // lock expired
+    }
     verifyPreLoginChallenges(req)
     models.sequelize.query(`SELECT * FROM Users WHERE email = '${req.body.email || ''}' AND password = '${security.hash(req.body.password || '')}' AND deletedAt IS NULL`, { model: UserModel, plain: true })
       .then((authenticatedUser) => {
         const user = utils.queryResultToJson(authenticatedUser)
+        if (user.data?.id) {
+          failedLogins.delete(key)
+        } else {
+          const current = failedLogins.get(key) ?? { count: 0, lockedUntil: 0 }
+          current.count++
+          if (current.count >= MAX_FAILED_LOGINS) {
+            current.lockedUntil = Date.now() + LOCKOUT_MS
+          }
+          failedLogins.set(key, current)
+        }
         if (user.data?.id && user.data.totpSecret !== '') {
           res.status(401).json({
             status: 'totp_token_required',
```

### progressive delay

Not measured: the Anthropic API credit ran out before the Blue Team wrote this alternative (run 01M7889HSW72AV01GWCTXFYT3C).

_No patch that builds._
