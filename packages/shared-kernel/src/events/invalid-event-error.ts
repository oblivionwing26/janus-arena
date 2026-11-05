import type { z } from 'zod';

export class InvalidEventError extends Error {
  override readonly name = 'InvalidEventError';

  constructor(readonly issues: readonly z.core.$ZodIssue[]) {
    super(
      `Invalid event: ${issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ')}`,
    );
  }
}
