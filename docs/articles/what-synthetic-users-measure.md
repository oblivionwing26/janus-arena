# What synthetic users measure, and what they don't

_Janus Arena, gate G2 (November 2026). Every figure comes from real runs against ShopLab, a demo
shop with three usability flaws seeded on purpose. The events, reports and exports are in the
[repository](https://github.com/oblivionwing26/janus-arena), and the console's demo build replays
them in your browser._

A "synthetic user" here is a language-model agent that plays a person (Carmen, a retired
teacher; Javier, who wants to know the total cost before he pays; Lucía, who does not want to
create yet another account) and navigates a website step by step in a real browser. It is tempting
to sell this as a cheap way to predict what your customers will do. It is not. This text is about
what we could measure, what we could not, and why the difference matters.

## The starting rule: code measures, the model acts

The model only decides the next action in the browser. Everything else is computed by
deterministic code from an event log that cannot be edited:

- friction (dead clicks, backtracking, form errors, abandonment, extra steps compared with a
  reference agent) is detected by pure functions;
- whether a task succeeded is decided by an oracle that reads the shop the way the buyer does
  (their orders), not by what the agent says;
- rates carry confidence intervals, and comparisons between variants carry an explicit decision
  rule.

That split is not an implementation detail. It is what lets you say something honest.

## What they do measure

**Where friction concentrates, when someone trips on it.** We group signals by page and element,
and each session counts once per zone. When we replayed the three seeded flaws on purpose (shipping
cost hidden until payment, the coupon tucked behind "Other options", a registration form that wipes
every field when it fails), all three ended up among the five zones with the most friction, and the
registration one was pinned to the exact button. With eight personas and the task of using a
coupon, the two hottest zones were the cart and the checkout: the loop of someone looking for a
field they cannot see. The agents' own thoughts confirm it ("I don't see the coupon at checkout; I'll
go back to the cart to find where to enter it").

**Synthetic task success, with its uncertainty.** With an oracle, "buy two notebooks" is checked
against the order, not against the agent's closing sentence. Before trusting any persona, we
validated a competent agent with no biases: it completed 9 of 10 tasks according to the oracle. If
the machinery cannot shop, no persona failure means anything.

**What it costs to measure.** About 2,850 input tokens per step, three quarters of them read from
the cache; a persona session costs 0.002 to 0.004 €. Most of the spend is the reference agent, and
above all its loops.

## What they don't measure

**Revenue or conversion.** An agent has no wallet, no real hurry and no alternatives. We talk about
"synthetic task success", never about a conversion improvement.

**Flaws nobody trips on.** The registration form that wipes its fields only hurts if you make a
mistake filling it in. In our runs every agent filled it in correctly the first time: the flaw is
there and the heatmap does not see it. A synthetic user measures the path it walks, not the whole
site.

**What lies outside their goals.** In the first real A/B, variant B fixed the hidden shipping cost
and the hidden coupon. No persona wanted to use a coupon, so that fix could not show. The result
was "no detectable difference" (B − A = −0.13 over 16 pairs, interval [−0.31, 0.00]), and it is the
right answer to that question, not a failure of the method.

**What the agent says about itself.** Javier, on variant B, read "total: 24.89 € with shipping of
4.99 €" in the cart, bought, and at the end claimed that shipping had been hidden until after
confirmation and called the session abandoned. Without an oracle, that sentence would have counted
as a failure of B. A model's self-assessment is something to check, not evidence.

## Limits worth saying out loud

- **Small samples.** With 16 pairs the intervals are wide; only large effects show. Better to say
  "not detectable" than to invent a difference.
- **Traits that weigh more than the variant.** Lucía always abandons at the sign-in wall and Tomás
  always runs out of his 12 steps, in A and in B. That is information about the shop (or the
  persona), not about the change being evaluated.
- **Agent loops.** An agent can go back and forth between cart and checkout dozens of times. We
  count each session once per zone so a loop does not look like a crowd, but the cost is still
  paid.
- **What the agent sees.** It only perceives what we show it of the page (a pruned accessibility
  tree). A purely visual problem (contrast, size, a confusing image) does not enter.

## What changed when the A/B got a task and an oracle

The A/B above had no task: success was the agent's word. In the next version every persona gets the
same task ("buy a watercolour set using your coupon") and the oracle checks the order, including
that the discount was applied. A UI-engineering agent then patched the two most intense friction
zones into a variant B, each patch checked by the shop's own lint, typecheck and tests, and a paired
run compared A and B.

The result: synthetic task success went from 1 of 6 personas on A to 5 of 7 on B, a difference of
+0.50 with an interval of [0.17, 0.83] over 6 pairs. That is an effect the method can see, because
the task now crosses the flaws that B fixes. The paired run itself cost about 0.28 €. It is still
synthetic task success on a demo shop, and the interval is wide: it says that B is better for these
personas on this task, not by how much a real shop would gain.

## What it is for, then

For what an automated test does well: detecting regressions and locating where it hurts, cheaply
and repeatably, before they reach real people. A report that says "the cart and the checkout
concentrate the friction of whoever is looking for the coupon" is useful to the team reviewing the
change. A report that promised "+8 % conversion" would not be, because it would not be true.

And that is the other half of the project: the same loop measures the UX cost of a security fix.
A rate limit or an account lockout closes a hole and changes who can still buy. The next article
is about that trade-off.
