/**
 * Closed list of behavioural biases a persona can carry. Generic shopping behaviour, never
 * derived from the target's seeded flaws (UX_FLAWS.md must not reach an agent).
 */
export const PERSONA_BIASES = [
  /** Reads headings and buttons, not paragraphs or small print. */
  'skims-text',
  /** Watches the running total and reacts to extra costs. */
  'price-sensitive',
  /** Hesitates before giving personal data. */
  'privacy-cautious',
  /** Prefers not to create an account if there is any way around it. */
  'avoids-account-creation',
  /** Takes labels at their word and does not guess what they might mean. */
  'literal-reader',
  /** Picks the first option that seems to fit instead of comparing. */
  'picks-first-option',
  /** Reviews what was entered before confirming. */
  'double-checks',
  /** Loses patience quickly when the page is slow or nothing seems to happen. */
  'low-tolerance-for-waits',
  /** Does not remember which password this shop has; tries old ones first (F3.6). */
  'forgets-password',
] as const;

export type PersonaBias = (typeof PERSONA_BIASES)[number];

export function isPersonaBias(value: string): value is PersonaBias {
  return (PERSONA_BIASES as readonly string[]).includes(value);
}
