export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'ALL';

export interface CodeLocation {
  /** Path from the repository root, forward slashes. */
  readonly file: string;
  /** 1-based. */
  readonly line: number;
}

/**
 * One entry point of the target's HTTP surface (F2.6): a Next.js route handler or server
 * action, or an Express route. Found by reading the code; nothing of the target runs.
 */
export interface Endpoint {
  /** Express style: `/api/orders/:id`; server actions as `action:<file>#<name>`. */
  readonly route: string;
  readonly method: HttpMethod;
  /** Where the route is declared (Next.js file, or the Express `app.get(...)` call). */
  readonly declaredAt: CodeLocation;
  /** The function that answers, when it could be resolved. */
  readonly handler: (CodeLocation & { readonly name: string }) | null;
  /** Path parameters, then the body and query keys the handler reads (`body.quantity`). */
  readonly params: readonly string[];
}
