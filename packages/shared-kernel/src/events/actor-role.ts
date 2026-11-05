import { z } from 'zod';

import { modelRoleSchema } from './model-role.js';

// Who emitted an event: an LLM role, the orchestrator itself, or a scripted (non-LLM) agent.
export const actorRoleSchema = z.enum([...modelRoleSchema.options, 'orchestrator', 'scripted']);

export type ActorRole = z.infer<typeof actorRoleSchema>;
