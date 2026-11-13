import { readFile } from 'node:fs/promises';

import { GATE_STAGES, redTeamClassSchema } from '@janus/shared-kernel';
import { parse } from 'yaml';
import { z } from 'zod';

/**
 * A gate file (gates/*.yaml, F3.9): which target, the run file its SynthLab stages play, the
 * global budget and its split by stage, and each stage's options. The stages themselves are
 * fixed; one the target cannot do is skipped with its reason.
 */
export const gateFileSchema = z.object({
  target: z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/),
  /** The run file SynthLab plays on A, and on A and B for the A/B (its first variant is A). */
  runFile: z.string().min(1),
  budget: z.object({
    maxEur: z.number().positive().max(20),
    shares: z.partialRecord(z.enum(GATE_STAGES), z.number().min(0).max(1)),
  }),
  variant: z.object({ zones: z.int().min(1).max(5) }).default({ zones: 2 }),
  redTeam: z.object({ classes: z.array(redTeamClassSchema).min(1).optional() }).default({}),
  blueTeam: z.object({ maxFixes: z.int().min(1).max(5) }).default({ maxFixes: 1 }),
  pr: z
    .object({ open: z.boolean(), reason: z.string().min(1).optional() })
    .refine((pr) => pr.open || pr.reason !== undefined, {
      message: 'say why the gate opens no pull request',
    })
    .default({ open: true }),
});

export type GateFile = z.infer<typeof gateFileSchema>;

export async function loadGateFile(path: string): Promise<GateFile> {
  const parsed = gateFileSchema.safeParse(parse(await readFile(path, 'utf8')));
  if (!parsed.success) {
    throw new Error(`${path} is not a valid gate file:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
