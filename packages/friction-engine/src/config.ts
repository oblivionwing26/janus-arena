import { z } from 'zod';

/** A value above `medium` is a medium signal, above `high` a high one. */
const levels = z
  .strictObject({ medium: z.number().positive(), high: z.number().positive() })
  .refine((value) => value.high > value.medium, 'high must be above medium');

export const frictionConfigSchema = z.strictObject({
  rageClick: z.strictObject({
    /** Clicks on the same element that make a burst. */
    minClicks: z.int().min(2),
    /** The burst must fit in this many consecutive actions (waits not counted)… */
    windowActions: z.int().min(2),
    /** …and in this much time. An LLM agent needs seconds per decision; humans would use ~1 s. */
    windowMs: z.number().positive(),
  }),
  deadClick: z.strictObject({
    /** Elements whose click only gives focus, so no DOM change is expected. */
    ignoreRoles: z.array(z.string().min(1)),
  }),
  backtrack: z.strictObject({
    /** A → B → A counts when B lasted at most this many steps. */
    returnWithinSteps: z.int().min(1),
  }),
  formError: z.strictObject({
    /** The same error shown this many times in a session is a high signal. */
    highAfterRepeats: z.int().min(2),
  }),
  extraSteps: z.strictObject({
    /** Ratio of a persona's steps to the competent baseline's, at or above which it signals. */
    low: z.number().min(1),
    medium: z.number().min(1),
    high: z.number().min(1),
  }),
  technicalError: z.strictObject({
    /** Resource URLs (regular expressions) whose errors are noise, e.g. a missing favicon. */
    ignoreUrls: z.array(z.string().min(1)),
  }),
  performance: z.strictObject({ lcpMs: levels, cls: levels, inpMs: levels }),
});

export type FrictionConfig = z.infer<typeof frictionConfigSchema>;

/** The thresholds in config/friction.yaml; a test keeps both in sync. */
export const defaultFrictionConfig: FrictionConfig = {
  rageClick: { minClicks: 3, windowActions: 4, windowMs: 30_000 },
  deadClick: { ignoreRoles: ['textbox', 'searchbox', 'combobox', 'spinbutton', 'listbox'] },
  backtrack: { returnWithinSteps: 1 },
  formError: { highAfterRepeats: 2 },
  extraSteps: { low: 1.5, medium: 2, high: 3 },
  technicalError: {
    ignoreUrls: ['/favicon\\.ico(\\?.*)?$', '\\.(png|jpe?g|gif|svg|webp|ico|css|woff2?)(\\?.*)?$'],
  },
  performance: {
    // web.dev: "needs improvement" above the first value, "poor" above the second.
    lcpMs: { medium: 2500, high: 4000 },
    cls: { medium: 0.1, high: 0.25 },
    inpMs: { medium: 200, high: 500 },
  },
};

export class InvalidFrictionConfigError extends Error {
  override readonly name = 'InvalidFrictionConfigError';
}

/** Validates raw thresholds (e.g. parsed from config/friction.yaml). */
export function parseFrictionConfig(input: unknown): FrictionConfig {
  const result = frictionConfigSchema.safeParse(input);
  if (!result.success) throw new InvalidFrictionConfigError(z.prettifyError(result.error));
  const { extraSteps } = result.data;
  if (!(extraSteps.low <= extraSteps.medium && extraSteps.medium <= extraSteps.high)) {
    throw new InvalidFrictionConfigError('extraSteps must satisfy low <= medium <= high');
  }
  return result.data;
}
