# Our benchmark on Juice Shop, without makeup

_Janus Arena (November 2026). Everything below is in `docs/reports/benchmark-juice-shop.md` and
`.json`, and `pnpm run:benchmark juice-shop --runs 3` reproduces it on a fresh Juice Shop (it needs
Docker and no API key). The numbers are low. This text is about why they are low, what they do
and do not mean, and what we did so they could not be flattered._

Janus Arena has a Red Team that attacks a sandboxed copy of a target and a Blue Team that patches
what it confirms. To say anything about the Red Team we needed a number from a target we do not
control. We used OWASP Juice Shop (v20.3.0, pinned by digest), because it marks its own challenges
as solved, which gives an oracle we did not write.

## The result

**6 of the 60 challenges** that Juice Shop files under the categories where one of our attack
classes acts: **10.0 %, 95 % interval [4.7 %, 20.1 %]**. Without one challenge that a probe solved
as a side effect, 5 of 60, 8.3 %. The same in all three rounds, each on a fresh instance, after a
control round with no attack in which Juice Shop marked nothing as solved.

| Category                  | Challenges | Solved |
| ------------------------- | ---------- | ------ |
| Broken Access Control     | 12         | 1      |
| Injection                 | 14         | 1      |
| XSS                       | 9          | 1      |
| Improper Input Validation | 12         | 2      |
| Broken Anti Automation    | 4          | 1      |
| Broken Authentication     | 9          | 0      |

The five challenges the engine was built around were solved 3 of 3 times: View Basket, Login Admin,
DOM XSS, Payback Time, Multiple Likes. Nothing else that we did not build for was solved, apart
from the side effect below.

## Why it is low

**The engine only makes the attacks it was programmed to make.** It is deterministic: code generates
IDOR, login-bypass, XSS, business-logic and brute-force attempts from the target's surface map, and
a deterministic oracle judges each attempt. No language model chooses an attack (a decision we took
early, because the provider declined the agent's attack tool and because an attack that succeeds
must be reproducible). That gives a result that is the same every time, and a ceiling that is the
set of attacks we wrote.

**The denominator is not what the engine tries.** The 60 challenges are everything Juice Shop files
under those categories, including a chatbot to manipulate, a CAPTCHA, a forged token and a
server-side template injection at six stars. No class of ours even attempts them. We kept them in
the denominator on purpose: choosing the challenges we expected to solve would have given a number
we could not defend.

**Broken Authentication is 0 of 9.** It is the clearest hole: password resets by security
question and two-factor bypass are outside what the brute-force and login-bypass classes
generate.

## What we did so the number could not be flattered

- **The engine never sees the benchmark.** Juice Shop's own ground truth (`/api/Challenges`,
  `/api/Hints`, `/snippets/**`, the fixes) is outside every agent's reach by scope, and the list
  of challenges that count lives in an orchestrator-only file the attack code does not read.
- **A challenge counts only if Juice Shop marked it solved after the round and not after the
  control.** Janus does not say which request solved it.
- **Side effects are named.** One challenge, Repetitive Registration, was solved by a probe aimed
  at something else: the surface map listed `POST /api/Users` with no password-repeat parameter, so
  the login-bypass generator probed it like a login and registered accounts without a repeated
  password, which is exactly what the challenge asks for. It counts, and the recall is also given
  without it.
- **Three rounds, each fresh.** They agree, as a deterministic engine should; a disagreement
  would have been a real instability.
- **What was not run.** Nuclei, ZAP's baseline and a published subset were optional. The first
  two crawl the target and would read its ground truth, and none of the three was an approved
  dependency. We say so instead of listing them as compared.

## What the number means

It is a lower bound on what the engine finds on Juice Shop, in the categories it covers, as Juice
Shop judges it. It is not an estimate of how many vulnerabilities Juice Shop has, nor of how a
tool would do on a different application, and it says nothing about false positives, because every
confirmed finding in Janus needs a proof of concept replayed by code on a fresh sandbox before it
counts.

It is also the starting line. Each new generator we write can be measured against the same
denominator, with the same oracle, in under a minute and for nothing, and a regression (a challenge
that stops being solved) would show up as a smaller number. That is the use we want from it: not a
score to put on a slide, but a way to know whether the next change helped.
