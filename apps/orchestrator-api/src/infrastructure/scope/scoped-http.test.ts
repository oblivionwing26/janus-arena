import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

import {
  contractTarget,
  describeScopedHttpContract,
} from '../../test-support/scoped-http-contract.js';
import { FetchScopedHttp } from './fetch-scoped-http.js';
import { InMemoryScopedHttp } from './in-memory-scoped-http.js';

describeScopedHttpContract('InMemoryScopedHttp', {
  create: () =>
    Promise.resolve({
      http: new InMemoryScopedHttp(contractTarget),
      origin: 'http://janus-contract-app:3000',
      close: () => Promise.resolve(),
    }),
});

describeScopedHttpContract('FetchScopedHttp', {
  create: async () => {
    const server = createServer((request, response) => {
      const reply = contractTarget({
        method: request.method === 'POST' ? 'POST' : 'GET',
        url: `http://127.0.0.1${request.url ?? '/'}`,
      });
      response.writeHead(reply.status, reply.headers);
      response.end(reply.body);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    return {
      http: new FetchScopedHttp(),
      origin: `http://127.0.0.1:${String(port)}`,
      close: () =>
        new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        }),
    };
  },
});
