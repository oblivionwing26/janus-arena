# ADR 0007: Build our own observation builder on the ARIA snapshot

- **Status:** Accepted
- **Date:** 2026-11-06
- **Step:** F1.1 (used by the navigator loop from F1.4; recorded at gate G1, F1.13)

## Context

Every navigator step sends the agent a view of the page. That view is the largest variable part of each LLM call, it is never cacheable (CLAUDE.md), and its quality decides whether the agent can act at all. We needed something that is cheap in tokens, gives the agent element references it can act on, and stays deterministic so that replays, golden tests and the friction engine see the same thing. Personas are synthetic users reading a page, not a vision benchmark.

## Decision

A pure package, `packages/observation-builder`, turns the page into the agent's observation. Its input is the snapshot that `BrowserPort.snapshot()` returns: Playwright's ARIA snapshot (JSON, `ai` mode, with boxes) plus the viewport. It keeps only what a shopper would use:

- controls within one screen above and below the viewport, headings, `alert`/`status` notices and the text of `main`, one line per table row;
- short refs (`e1`, `e2`…) that are stable within a session: the key is role + exact accessible name + position among equals, and the same key is the locator the executor uses (no CSS selectors);
- after the first step, a diff (`~`/`-`/`+`) instead of the full page, falling back to the full page on navigation or when the diff would be longer;
- password values are masked by the browser adapter before they reach the builder.

The package depends on zod only (`observation-builder-pure` in `check:arch`), and `application/` may import it (ADR 0001 amendment).

## Alternatives considered

| Option                                    | Why not                                                                                         |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Playwright's ARIA snapshot as is          | Whole page every step, its refs change between snapshots, and it exposes password field values. |
| Raw or cleaned DOM                        | Several times more tokens, CSS noise, and selectors that break on markup changes.               |
| Screenshots for a vision model            | Costlier per step, not diffable, and clicks by coordinates are hard to replay and to test.      |
| An off-the-shelf browsing agent framework | Hides the observation and the loop we need to instrument, cache and replay; another dependency. |

## Consequences

- **Positive:** measured in F1.9, a step costs about 2,850 input tokens in total, about 75 % of them read from cache, below the 3,000–4,000 we estimated; golden tests over saved ShopLab pages pin the output; refs double as locators, so dead and rage clicks can point at an element; the heatmap (F1.10) reuses the same element descriptions.
- **Negative:** we own the pruning rules: a control outside the window, or text outside `main`, is invisible to the agent until it scrolls; the checkout page not listing the items was one cause of the cart ↔ checkout loops in F1.9.
- **Follow-ups:** the `mobile` device still uses the desktop viewport (F1.4 note); detecting A ↔ B loops in the agent's working memory is pending (F1.9 note).

## Amendment (F3.5a): pages without `main`, controls named by their text, hidden content

Juice Shop, the second SynthLab target, showed three gaps that ShopLab never exercised:

- **No `main` landmark.** Many single-page apps have none, and the builder read prose only inside
  `main` or a dialog: Juice Shop's basket (its heading, item table and total) never reached the
  agent. On a page without `main`, the whole document is now content, minus page chrome
  (`banner`, `navigation`, `contentinfo`, `complementary`). Pages with `main` are unchanged.
- **Controls named by their content.** Playwright's `ariaSnapshotJSON` leaves the name out of a
  button whose accessible name is its text ("Checkout"). A control without a name is now named by
  its visible text, which is also the name the browser finds it by, so the ref still clicks.
- **Content hidden from assistive technology.** Icon text marked `aria-hidden` ("cart-arrow-down")
  is no longer part of any name or prose, as a screen reader would skip it.
- **A label that hides what the control shows.** Juice Shop labels every product card "Click for
  more information about the product", which replaces the product name in the accessibility tree.
  Personas are sighted shoppers who read the name on the card; without it even the competent
  baseline opened each card, forgot it on closing, and looped (run `01M77G1S…`, baseline 0/2).
  When a control's visible text is not already in its name, the line now adds it:
  `button "Click for more information about the product" shows "Apple Juice (1000ml)"`. The
  locator stays the accessible name, which is how the browser finds the control. This trades
  away measuring the label itself as friction: a screen-reader persona would need the old view.

ShopLab's golden pages and the replayed F1.4 session are unchanged by these rules. The agent's
action space also gained `type` with `submit` (Enter) and `dismiss` (Esc), which Juice Shop's
search box and Material menus need; the F1.4 replay fixture was re-recorded for the new tools.
