# Launch Day: what a defense does to abuse and to the shoppers it protects

Synthetic shoppers (personas) and saboteurs on ShopLab, variant A without the defense and B with it. Rates are synthetic task success with 95 % Wilson intervals, not predictions of real revenue. Attack success is the share of saboteurs that nothing stopped, as a deterministic oracle judged it.

| Defense (variant B) | Addresses | Attack success A → B | Shopper success A → B | Shoppers blocked A → B | Median steps A → B |
| --- | --- | --- | --- | --- | --- |
| rate limit per client 20/60 | distinct | 100 % → 50 % | 86 % → 88 % | 0 % → 0 % | 13 → 15 |
| rate limit per client 20/60 | shared | 100 % → 50 % | 80 % → 71 % | 0 % → 0 % | 16 → 15 |
| rate limit per account 3/60 | distinct | 100 % → 50 % | 80 % → 79 % | 0 % → 0 % | 15 → 14.5 |
| checkout step-up (new-accounts) | distinct | 100 % → 100 % | 75 % → 73 % | 0 % → 0 % | 15 → 16 |
| rate limit per client 6/60 | shared | 100 % → 0 % | 75 % → 73 % | 0 % → 18 % | 14 → 15 |

## rate limit per client 20/60 · addresses distinct

Run `01M7C042BQ18AAGTQ6983VY9D7`.

| Variant | Defenses | Shoppers | Shopper success | Shoppers blocked | Median steps | Attack success | Contaminated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | none | 14 | 86 % (60 %–96 %, 12/14) | 0 % (0 %–22 %, 0/14) | 13 | 100 % (34 %–100 %, 2/2) | 0 |
| B | rate limit per client 20/60 | 16 | 88 % (64 %–97 %, 14/16) | 0 % (0 %–19 %, 0/16) | 15 | 50 % (9 %–91 %, 1/2) | 0 |

- A · brute-force: 1/1 exploitable, never refused.
- A · saturation: 1/1 exploitable, never refused.
- B · brute-force: 1/1 exploitable, never refused.
- B · saturation: 0/1 exploitable, refused after 20 answered requests.

## rate limit per client 20/60 · addresses shared

Run `01M7C0X00PDK6TP50E5S4XFWFN`.

| Variant | Defenses | Shoppers | Shopper success | Shoppers blocked | Median steps | Attack success | Contaminated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | none | 15 | 80 % (55 %–93 %, 12/15) | 0 % (0 %–20 %, 0/15) | 16 | 100 % (34 %–100 %, 2/2) | 0 |
| B | rate limit per client 20/60 | 14 | 71 % (45 %–88 %, 10/14) | 0 % (0 %–22 %, 0/14) | 15 | 50 % (9 %–91 %, 1/2) | 0 |

- A · brute-force: 1/1 exploitable, never refused.
- A · saturation: 1/1 exploitable, never refused.
- B · brute-force: 1/1 exploitable, never refused.
- B · saturation: 0/1 exploitable, refused after 20 answered requests.

## rate limit per account 3/60 · addresses distinct

Run `01M7C1PZRN3DQ68BJVB8F9KHKX`.

| Variant | Defenses | Shoppers | Shopper success | Shoppers blocked | Median steps | Attack success | Contaminated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | none | 15 | 80 % (55 %–93 %, 12/15) | 0 % (0 %–20 %, 0/15) | 15 | 100 % (34 %–100 %, 2/2) | 0 |
| B | rate limit per account 3/60 | 14 | 79 % (52 %–92 %, 11/14) | 0 % (0 %–22 %, 0/14) | 14.5 | 50 % (9 %–91 %, 1/2) | 0 |

- A · brute-force: 1/1 exploitable, never refused.
- A · saturation: 1/1 exploitable, never refused.
- B · brute-force: 0/1 exploitable, refused after 4 answered requests.
- B · saturation: 1/1 exploitable, never refused.

## checkout step-up (new-accounts) · addresses distinct

Run `01M7C2Y015H82WC2XAHKYBGKD5`.

| Variant | Defenses | Shoppers | Shopper success | Shoppers blocked | Median steps | Attack success | Contaminated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | none | 16 | 75 % (51 %–90 %, 12/16) | 0 % (0 %–19 %, 0/16) | 15 | 100 % (34 %–100 %, 2/2) | 0 |
| B | checkout step-up (new-accounts) | 15 | 73 % (48 %–89 %, 11/15) | 0 % (0 %–20 %, 0/15) | 16 | 100 % (34 %–100 %, 2/2) | 0 |

- A · brute-force: 1/1 exploitable, never refused.
- A · saturation: 1/1 exploitable, never refused.
- B · brute-force: 1/1 exploitable, never refused.
- B · saturation: 1/1 exploitable, never refused.

## rate limit per client 6/60 · addresses shared

Run `01M7CZ2ZADFTJSJ1GZFF5M38EE`.

| Variant | Defenses | Shoppers | Shopper success | Shoppers blocked | Median steps | Attack success | Contaminated |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A | none | 16 | 75 % (51 %–90 %, 12/16) | 0 % (0 %–19 %, 0/16) | 14 | 100 % (34 %–100 %, 2/2) | 0 |
| B | rate limit per client 6/60 | 11 | 73 % (43 %–90 %, 8/11) | 18 % (5 %–48 %, 2/11) | 15 | 0 % (0 %–66 %, 0/2) | 0 |

- A · brute-force: 1/1 exploitable, never refused.
- A · saturation: 1/1 exploitable, never refused.
- B · brute-force: 0/1 exploitable, refused after 6 answered requests.
- B · saturation: 0/1 exploitable, refused after 6 answered requests.

