import { z } from 'zod';

// LLM roles from ADR 0004. Code names a role, never a model id.
export const modelRoleSchema = z.enum([
  'navigator',
  'competent-baseline',
  'ui-engineer',
  'red-team',
  'blue-team',
  'architect',
]);

export type ModelRole = z.infer<typeof modelRoleSchema>;
