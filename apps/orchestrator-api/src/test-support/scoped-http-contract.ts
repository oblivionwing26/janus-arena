// Shared contract suite for ScopedHttpPort: the in-memory fake and the fetch client (against a
// local HTTP server) both run it in `pnpm test`. Not part of the build.

import { describe, expect, it } from 'vitest';

import {
  NetworkGuard,
  ScopeBlockedError,
  type BlockedRequest,
} from '../domain/scope/network-guard.js';
import type {
  ScopedHttpPort,
  ScopedReply,
  ScopedRequest,
} from '../domain/scope/scoped-http-port.js';

/**
 * The fake target every adapter must reach: `/hello` says hello and echoes the method, `/away`
 * redirects off scope, `/api/Challenges` is the ground truth that must never be read.
 */
export function contractTarget(request: Pick<ScopedRequest, 'method' | 'url'>): ScopedReply {
  const path = new URL(request.url).pathname;
  if (path === '/hello') {
    return { status: 200, headers: { 'x-method': request.method }, body: 'hello' };
  }
  if (path === '/away') {
    return { status: 302, headers: { location: 'http://example.com/' }, body: '' };
  }
  if (path === '/api/Challenges') return { status: 200, headers: {}, body: 'ground truth' };
  return { status: 404, headers: {}, body: '' };
}

export interface ScopedHttpContractHarness {
  /** The port and the origin where contractTarget() answers. */
  readonly create: () => Promise<{
    http: ScopedHttpPort;
    origin: string;
    close: () => Promise<void>;
  }>;
}

export function describeScopedHttpContract(name: string, harness: ScopedHttpContractHarness): void {
  describe(`${name} (ScopedHttpPort contract)`, () => {
    async function setup() {
      const { http, origin, close } = await harness.create();
      const blocked: BlockedRequest[] = [];
      const guard = new NetworkGuard({
        target: 'contract',
        origins: [origin],
        excludedPaths: ['/api/Challenges'],
        allowedTests: ['http-probe'],
        maxRequestsPerSecond: 50,
      });
      const client = http.client(guard, (each) => {
        blocked.push(each);
        return Promise.resolve();
      });
      return { client, origin, blocked, close };
    }

    it('sends an allowed request and returns status, headers and body', async () => {
      const { client, origin, close } = await setup();
      try {
        const reply = await client.send({
          method: 'POST',
          url: `${origin}/hello`,
          testType: 'http-probe',
          body: '{}',
        });
        expect(reply.status).toBe(200);
        expect(reply.body).toBe('hello');
        expect(reply.headers['x-method']).toBe('POST');
      } finally {
        await close();
      }
    });

    it('returns a redirect as it is, without following it off scope', async () => {
      const { client, origin, close } = await setup();
      try {
        const reply = await client.send({
          method: 'GET',
          url: `${origin}/away`,
          testType: 'http-probe',
        });
        expect(reply.status).toBe(302);
        expect(reply.headers.location).toBe('http://example.com/');
      } finally {
        await close();
      }
    });

    it('blocks an unverified host and an excluded path, reporting each', async () => {
      const { client, origin, blocked, close } = await setup();
      try {
        await expect(
          client.send({ method: 'GET', url: 'http://example.com/', testType: 'http-probe' }),
        ).rejects.toThrow(ScopeBlockedError);
        await expect(
          client.send({
            method: 'GET',
            url: `${origin}/api/Challenges?x=1`,
            testType: 'http-probe',
          }),
        ).rejects.toThrow(ScopeBlockedError);
        expect(blocked.map(({ path, reason }) => [path, reason])).toEqual([
          ['/', 'out-of-scope-origin'],
          ['/api/Challenges', 'excluded-path'],
        ]);
      } finally {
        await close();
      }
    });

    it('blocks a test the policy does not allow', async () => {
      const { client, origin, blocked, close } = await setup();
      try {
        await expect(
          client.send({ method: 'GET', url: `${origin}/hello`, testType: 'idor' }),
        ).rejects.toThrow(ScopeBlockedError);
        expect(blocked[0]?.reason).toBe('test-not-allowed');
      } finally {
        await close();
      }
    });
  });
}
