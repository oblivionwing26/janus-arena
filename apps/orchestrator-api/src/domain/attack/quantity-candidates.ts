import type { Endpoint } from '../surface/endpoint.js';

/**
 * Out-of-range quantities a shop must refuse (F3.3), nearest the edge first. The price-mismatch
 * oracle decides which accepted order is wrong.
 */
export const OUT_OF_RANGE_QUANTITIES: readonly number[] = [-1, 0, -100];

const QUANTITY = /^(quantity|qty|amount|count)$/i;

/**
 * Whether the target takes a quantity it could be tricked with: an endpoint that writes
 * (POST, PUT or PATCH) a quantity-like body field, per the surface map. No target specifics.
 */
export function takesQuantity(endpoints: readonly Endpoint[]): boolean {
  return endpoints.some(
    (endpoint) =>
      ['POST', 'PUT', 'PATCH'].includes(endpoint.method) &&
      endpoint.params.some((param) => QUANTITY.test(param.split('.').pop() ?? param)),
  );
}
