import { z } from 'zod';

// agentId is a readable slug, not a ULID (see ADR 0003).
export const agentIdSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);

export type AgentId = z.infer<typeof agentIdSchema>;
