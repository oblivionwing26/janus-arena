import type { TestSession } from '../../domain/attack/test-user-port.js';
import type { ScopedHttpClient } from '../../domain/scope/scoped-http-port.js';

/**
 * The same guarded client, sending every request as the session's user (F3.2): its token as a
 * bearer header and as the `token` cookie, the two ways shop targets read it.
 */
export function asSession(client: ScopedHttpClient, session: TestSession): ScopedHttpClient {
  return {
    send: (request) =>
      client.send({
        ...request,
        headers: {
          ...request.headers,
          authorization: `Bearer ${session.token}`,
          cookie: `token=${session.token}`,
        },
      }),
  };
}
