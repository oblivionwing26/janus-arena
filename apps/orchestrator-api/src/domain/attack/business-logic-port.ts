import type { PricedOrder } from '../oracles/price-mismatch.js';
import type { ScopedRequest } from '../scope/scoped-http-port.js';
import type { TestSession } from './test-user-port.js';

/** The request that carried the manipulation, as recorded: no body, no token. */
export interface ManipulationStep {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Path on the target, e.g. `/api/BasketItems/7`. */
  readonly path: string;
  readonly status: number | null;
}

/** An order placed after setting an item's quantity to a given value. */
export interface ManipulatedOrder {
  readonly step: ManipulationStep;
  /** The order as the shop recorded it; null when the shop refused to place it. */
  readonly order: PricedOrder | null;
}

/**
 * An effect a user may cause only once (liking a review, say), prepared for a race: the request
 * to fire in parallel, and how to read back who caused it.
 */
export interface OnceEffect {
  readonly name: string;
  /** Sent n times at once by the race harness, as the attacker. */
  readonly request: ScopedRequest;
  /** The record after the race: one entry per time the effect happened. */
  readBack(): Promise<readonly string[]>;
  /** How the attacker appears in that record. */
  readonly actor: string;
}

/**
 * The target-specific flows of business-logic attacks (F3.3): placing an order with an
 * out-of-range quantity, and preparing a once-per-user effect for a race. The engine decides
 * the values and runs the race; this port only knows the target's own steps. Its requests go
 * through the run's guarded client.
 */
export interface BusinessLogicPort {
  orderWithQuantity(session: TestSession, quantity: number): Promise<ManipulatedOrder>;
  /** Null when the target has no once-per-user effect to race. */
  prepareOnceEffect(session: TestSession): Promise<OnceEffect | null>;
}
