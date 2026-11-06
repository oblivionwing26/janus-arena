import type { z } from 'zod';

export class InvalidAgentActionError extends Error {
  override readonly name = 'InvalidAgentActionError';

  constructor(readonly issues: readonly z.core.$ZodIssue[]) {
    super(
      `Invalid action: ${issues.map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`).join('; ')}`,
    );
  }
}
