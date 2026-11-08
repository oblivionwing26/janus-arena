import { z } from 'zod';

// What the Red Team's tools accept (F3.3). The model's tool calls are validated here before any
// code acts on them; the scope, the limits and the oracles live in the orchestrator.

/** The attack classes the Red Team may try, a subset of the scope's test types. */
export const RED_TEAM_CLASSES = ['idor', 'auth-bypass'] as const;
export const redTeamClassSchema = z.enum(RED_TEAM_CLASSES);
export type RedTeamClass = z.infer<typeof redTeamClassSchema>;

export const redTeamToolInputs = {
  http_request: z.object({
    /** Who sends it: the attacker's own session, or nobody. */
    as: z.enum(['b', 'anonymous']),
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    /** A path on the target, never a full URL: the origin is set by code. */
    path: z.string().startsWith('/').max(500),
    /** A JSON body, as text. */
    body: z.string().max(4000).optional(),
    class: redTeamClassSchema,
  }),
  claim: z.object({
    class: redTeamClassSchema,
    /** The number the tool gave the attempt (#1, #2...). */
    attempt: z.int().min(1),
  }),
  done: z.object({ summary: z.string().min(1).max(2000) }),
} as const;

export type RedTeamHttpRequest = z.infer<typeof redTeamToolInputs.http_request>;
export type RedTeamClaim = z.infer<typeof redTeamToolInputs.claim>;
