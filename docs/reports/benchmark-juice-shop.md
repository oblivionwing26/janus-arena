# Janus benchmark: juice-shop

Reproduce it with:

```bash
pnpm run:benchmark juice-shop --runs 3
```

| | |
| --- | --- |
| Target | `bkimminich/juice-shop:v20.3.0@sha256:cea5a4af4aacee498c491491af0408934ec81d004035c0a02ef3e54395e3bf27` |
| Janus | `194330d0d8e21432138a5ea219b0ff1568a8573c` |
| Generated | 2026-11-13T09:13:14.972Z |
| Rounds | 3 attack rounds, each on a fresh instance, after one control round with no attack |
| Attacks | the deterministic engine (ADR 0011), every class: no model is called, so the cost is the sandbox's time only |

## Result

Recall on the **60 challenges** Juice Shop files under the categories where a Red Team class acts, as Juice Shop itself marks them solved after each round.

| Round | Recall | 95 % interval (Wilson) | Without side effects | Reference challenges | Findings confirmed | Time | Cost | Red Team run |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 6/60 = 10.0 % | [4.7 %, 20.1 %] | 5/60 = 8.3 % | 5/5 | 6 | 21 s | 0.00 € | `01M7A2VD4JBQH9SZ40WAZA857Y` |
| 2 | 6/60 = 10.0 % | [4.7 %, 20.1 %] | 5/60 = 8.3 % | 5/5 | 6 | 23 s | 0.00 € | `01M7A2W2H0PYN0NPKA7Y52YGFP` |
| 3 | 6/60 = 10.0 % | [4.7 %, 20.1 %] | 5/60 = 8.3 % | 5/5 | 6 | 21 s | 0.00 € | `01M7A2WSGX6C0Q11YNHHYST16E` |

Solved in **every** round: 6 of 60. Solved in **at least one**: 6 of 60.

How to read it:

- The denominator includes challenges no class even tries (a chatbot, a captcha, a forged token): the recall is on what Juice Shop files under those categories, not on what the engine was built to do.
- The interval is over the set of challenges (a Wilson interval for a proportion of `n` challenges). The rounds are repeats of a deterministic engine, so they are expected to agree; a disagreement would be a real instability.
- A challenge counts when Juice Shop marks it solved after the round and had not marked it solved after the control. Janus does not say which request solved it.
- This is a ceiling of recall, not a measure of how many vulnerabilities Juice Shop has: the engine only generates the attacks it was programmed for.

## By category

| Category | Classes that act | Challenges | Solved in every round | Solved in some round | Recall (some round) |
| --- | --- | --- | --- | --- | --- |
| Broken Access Control | idor | 12 | 1 | 1 | 8.3 % |
| Injection | auth-bypass | 14 | 1 | 1 | 7.1 % |
| XSS | xss | 9 | 1 | 1 | 11.1 % |
| Improper Input Validation | business-logic | 12 | 2 | 2 | 16.7 % |
| Broken Anti Automation | business-logic, brute-force | 4 | 1 | 1 | 25.0 % |
| Broken Authentication | auth-bypass, brute-force | 9 | 0 | 0 | 0.0 % |

## Reference challenges

The challenges the engine was built around (F3.2), apart from the rest.

| Challenge | Solved in rounds |
| --- | --- |
| View Basket (`basketAccessChallenge`) | 3/3 |
| Login Admin (`loginAdminChallenge`) | 3/3 |
| DOM XSS (`localXssChallenge`) | 3/3 |
| Payback Time (`negativeOrderChallenge`) | 3/3 |
| Multiple Likes (`timingAttackChallenge`) | 3/3 |

## Challenge by challenge

| Challenge | Category | Difficulty | Classes that act | Solved in rounds |
| --- | --- | --- | --- | --- |
| Web3 Sandbox | Broken Access Control | ★ | idor | 0/3 |
| Admin Section | Broken Access Control | ★★ | idor | 0/3 |
| AI Debugging | Broken Access Control | ★★ | idor | 0/3 |
| Five-Star Feedback | Broken Access Control | ★★ | idor | 0/3 |
| View Basket | Broken Access Control | ★★ | idor | 3/3 |
| CSRF | Broken Access Control | ★★★ | idor | 0/3 |
| Forged Feedback | Broken Access Control | ★★★ | idor | 0/3 |
| Forged Review | Broken Access Control | ★★★ | idor | 0/3 |
| Manipulate Basket | Broken Access Control | ★★★ | idor | 0/3 |
| Product Tampering | Broken Access Control | ★★★ | idor | 0/3 |
| Easter Egg | Broken Access Control | ★★★★ | idor | 0/3 |
| SSRF | Broken Access Control | ★★★★★★ | idor | 0/3 |
| CAPTCHA Bypass | Broken Anti Automation | ★★★ | business-logic, brute-force | 0/3 |
| Extra Language | Broken Anti Automation | ★★★★★ | business-logic, brute-force | 0/3 |
| Reset Morty's Password | Broken Anti Automation | ★★★★★ | business-logic, brute-force | 0/3 |
| Multiple Likes | Broken Anti Automation | ★★★★★★ | business-logic, brute-force | 3/3 |
| Password Strength | Broken Authentication | ★★ | auth-bypass, brute-force | 0/3 |
| Bjoern's Favorite Pet | Broken Authentication | ★★★ | auth-bypass, brute-force | 0/3 |
| GDPR Data Erasure | Broken Authentication | ★★★ | auth-bypass, brute-force | 0/3 |
| Reset Jim's Password | Broken Authentication | ★★★ | auth-bypass, brute-force | 0/3 |
| Login Bjoern | Broken Authentication | ★★★★ | auth-bypass, brute-force | 0/3 |
| Reset Bender's Password | Broken Authentication | ★★★★ | auth-bypass, brute-force | 0/3 |
| Change Bender's Password | Broken Authentication | ★★★★★ | auth-bypass, brute-force | 0/3 |
| Reset Bjoern's Password | Broken Authentication | ★★★★★ | auth-bypass, brute-force | 0/3 |
| Two Factor Authentication | Broken Authentication | ★★★★★ | auth-bypass, brute-force | 0/3 |
| Missing Encoding | Improper Input Validation | ★ | business-logic | 0/3 |
| Repetitive Registration (side effect, see below) | Improper Input Validation | ★ | business-logic | 3/3 |
| Zero Stars | Improper Input Validation | ★ | business-logic | 0/3 |
| Empty User Registration | Improper Input Validation | ★★ | business-logic | 0/3 |
| Admin Registration | Improper Input Validation | ★★★ | business-logic | 0/3 |
| Deluxe Fraud | Improper Input Validation | ★★★ | business-logic | 0/3 |
| Mint the Honey Pot | Improper Input Validation | ★★★ | business-logic | 0/3 |
| Payback Time | Improper Input Validation | ★★★ | business-logic | 3/3 |
| Upload Size | Improper Input Validation | ★★★ | business-logic | 0/3 |
| Upload Type | Improper Input Validation | ★★★ | business-logic | 0/3 |
| Expired Coupon | Improper Input Validation | ★★★★ | business-logic | 0/3 |
| Poison Null Byte | Improper Input Validation | ★★★★ | business-logic | 0/3 |
| Chatbot Prompt Injection | Injection | ★★ | auth-bypass | 0/3 |
| Login Admin | Injection | ★★ | auth-bypass | 3/3 |
| Database Schema | Injection | ★★★ | auth-bypass | 0/3 |
| Greedy Chatbot Manipulation | Injection | ★★★ | auth-bypass | 0/3 |
| Login Bender | Injection | ★★★ | auth-bypass | 0/3 |
| Login Jim | Injection | ★★★ | auth-bypass | 0/3 |
| System Prompt Extraction | Injection | ★★★ | auth-bypass | 0/3 |
| Christmas Special | Injection | ★★★★ | auth-bypass | 0/3 |
| Ephemeral Accountant | Injection | ★★★★ | auth-bypass | 0/3 |
| NoSQL DoS | Injection | ★★★★ | auth-bypass | 0/3 |
| NoSQL Manipulation | Injection | ★★★★ | auth-bypass | 0/3 |
| User Credentials | Injection | ★★★★ | auth-bypass | 0/3 |
| NoSQL Exfiltration | Injection | ★★★★★ | auth-bypass | 0/3 |
| SSTi | Injection | ★★★★★★ | auth-bypass | 0/3 |
| Bonus Payload | XSS | ★ | xss | 0/3 |
| DOM XSS | XSS | ★ | xss | 3/3 |
| Reflected XSS | XSS | ★★ | xss | 0/3 |
| API-only XSS | XSS | ★★★ | xss | 0/3 |
| Client-side XSS Protection | XSS | ★★★ | xss | 0/3 |
| CSP Bypass | XSS | ★★★★ | xss | 0/3 |
| HTTP-Header XSS | XSS | ★★★★ | xss | 0/3 |
| Server-side XSS Protection | XSS | ★★★★ | xss | 0/3 |
| Video XSS | XSS | ★★★★★★ | xss | 0/3 |

## Side effects

Solved, and counted, because a Janus request did solve them; but not an attack the engine means to make. The recall is also given without them.

- **Repetitive Registration** (3 rounds): The surface map lists POST /api/Users with no password-repeat parameter, so the auth-bypass generator probes it as if it were a login, and registers accounts without a repeated password. Juice Shop solves this challenge on exactly that (passwordRepeat is not the password), so it is solved by a probe aimed at something else.

## Not counted

- **Solved by the control**: none.
- **Solved outside the categories in scope**: none.

Categories in scope: Broken Access Control, Injection, XSS, Improper Input Validation, Broken Anti Automation, Broken Authentication (config/benchmarks.yaml). Control round: run `01M7A2V6EBKQ1FCZ58C6ZM20GJ`, 6 s.

Not run: Nuclei, ZAP baseline and the Argus subset (optional in the roadmap). Nuclei and ZAP crawl the target and would read its own ground truth (`/api/Challenges`, `/snippets/**`), and none of the three is an approved dependency.
