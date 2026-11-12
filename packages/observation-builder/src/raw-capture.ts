import { z } from 'zod';

import { InvalidCaptureError } from './invalid-capture-error.js';

const boxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

/**
 * One node of Playwright's `ariaSnapshotJSON({ mode: 'ai', boxes: true })`. Only the fields the
 * builder reads are typed; anything else Playwright adds is kept and ignored.
 */
export const rawNodeSchema = z.looseObject({
  role: z.string(),
  name: z.string().optional(),
  text: z.string().optional(),
  ref: z.string().optional(),
  box: boxSchema.optional(),
  level: z.number().optional(),
  url: z.string().optional(),
  placeholder: z.string().optional(),
  checked: z.union([z.boolean(), z.literal('mixed')]).optional(),
  pressed: z.union([z.boolean(), z.literal('mixed')]).optional(),
  disabled: z.boolean().optional(),
  expanded: z.boolean().optional(),
  selected: z.boolean().optional(),
  invalid: z.union([z.boolean(), z.string()]).optional(),
  active: z.boolean().optional(),
  /** Hidden from assistive technology (an icon, say): not part of any name or prose (F3.5a). */
  ariaHidden: z.boolean().optional(),
  get children() {
    return z.array(z.union([z.string(), rawNodeSchema])).optional();
  },
});

export type RawNode = z.infer<typeof rawNodeSchema>;
export type RawBox = z.infer<typeof boxSchema>;

/** What the browser adapter captures for one page (`PageSnapshot` minus the YAML). */
export const rawCaptureSchema = z.object({
  url: z.string(),
  title: z.string(),
  viewport: z.object({ width: z.number().positive(), height: z.number().positive() }),
  tree: z.array(z.union([z.string(), rawNodeSchema])),
});

export type RawCapture = z.infer<typeof rawCaptureSchema>;

export function parseCapture(input: unknown): RawCapture {
  const result = rawCaptureSchema.safeParse(input);
  if (!result.success) {
    const where = result.error.issues
      .slice(0, 3)
      .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
      .join('; ');
    throw new InvalidCaptureError(`Not a Playwright aria capture: ${where}`);
  }
  return result.data;
}
