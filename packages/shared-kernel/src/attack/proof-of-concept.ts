import { z } from 'zod';

import { redTeamClassSchema } from '../actions/red-team-tool-inputs.js';

/** The oracles that decide an attack (F3.2); a PoC names the one that judges its replay. */
export const ORACLES = [
  'canary-leak',
  'authenticated-as',
  'script-executed',
  'price-mismatch',
  'duplicate-effect',
  'unthrottled-guessing',
  /** Launch Day's saturation (F4.1): requests at a steady rate that no defense refused. */
  'unthrottled-requests',
] as const;
export const oracleSchema = z.enum(ORACLES);
export type OracleName = z.infer<typeof oracleSchema>;

const path = z.string().startsWith('/').max(500);

/**
 * What to replay, per class (F3.4). Never a run's own ids or secrets: an IDOR names the route and
 * which of the victim's objects to ask for; an XSS names a relative URL and which payload, so a
 * replay uses its own origin and its own marker; the flows name their one parameter.
 */
export const pocStepsSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('idor'),
    method: z.literal('GET'),
    /** The route with one `:param`, e.g. `/rest/basket/:id`. */
    route: path,
    /** Which object of the victim fills the param, or an offset from the attacker's basket id. */
    bind: z.union([
      z.object({ victim: z.enum(['basketId', 'userId']) }),
      z.object({ offsetFromAttackerBasket: z.int() }),
    ]),
  }),
  z.object({
    kind: z.literal('auth-bypass'),
    method: z.literal('POST'),
    path,
    /** The JSON body sent: the payload and a placeholder password, never a real one. */
    body: z.string().max(4000),
  }),
  z.object({
    kind: z.literal('xss'),
    /** Relative to the target's origin, with `{payload}`: `/#/search?q={payload}`. */
    template: z.string().startsWith('/').includes('{payload}').max(500),
    /** Which of the engine's payloads, built again with the replay's own marker. */
    payload: z.int().min(0),
  }),
  z.object({ kind: z.literal('order-quantity'), quantity: z.number() }),
  z.object({ kind: z.literal('once-effect-race'), size: z.int().min(2).max(50) }),
  z.object({
    kind: z.literal('login-guessing'),
    method: z.literal('POST'),
    path,
    /** The login's identity and password fields, as the surface map names them. */
    identity: z.string().regex(/^[A-Za-z_]\w{0,39}$/),
    password: z.string().regex(/^[A-Za-z_]\w{0,39}$/),
    /** Wrong passwords sent to one fresh test account before the right one (F3.6). */
    guesses: z.int().min(5).max(50),
  }),
]);
export type PocSteps = z.infer<typeof pocStepsSchema>;

/**
 * A reproducible proof of concept (F3.4, ADR 0011): the attempt that an oracle confirmed, as
 * steps any run can replay with fresh test users, and the oracle that must agree again.
 */
export const proofOfConceptSchema = z.object({
  version: z.literal(1),
  target: z.string().min(1).max(100),
  class: redTeamClassSchema,
  oracle: oracleSchema,
  /** The endpoint the finding is about, e.g. `GET /rest/basket/:id`. */
  endpoint: z.string().min(1).max(300),
  steps: pocStepsSchema,
});
export type ProofOfConcept = z.infer<typeof proofOfConceptSchema>;
