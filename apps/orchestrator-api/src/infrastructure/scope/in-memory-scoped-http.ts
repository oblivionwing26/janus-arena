import type { BlockedRequest, NetworkGuard } from '../../domain/scope/network-guard.js';
import type {
  ScopedHttpClient,
  ScopedHttpPort,
  ScopedReply,
  ScopedRequest,
} from '../../domain/scope/scoped-http-port.js';
import { guard } from './fetch-scoped-http.js';

/** Serves a fake target from a handler, behind the same guard as the real client. */
export class InMemoryScopedHttp implements ScopedHttpPort {
  /** Every request that got past the guard, in order. */
  readonly sent: ScopedRequest[] = [];

  constructor(private readonly handler: (request: ScopedRequest) => ScopedReply) {}

  client(
    networkGuard: NetworkGuard,
    onBlocked: (blocked: BlockedRequest) => Promise<void>,
  ): ScopedHttpClient {
    return {
      send: async (request) => {
        await guard(networkGuard, onBlocked, request);
        this.sent.push(request);
        return this.handler(request);
      },
    };
  }
}
