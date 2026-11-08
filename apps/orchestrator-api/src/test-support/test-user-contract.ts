// Shared contract suite for TestUserPort: the in-memory fake runs it in `pnpm test`; the Juice
// Shop adapter runs it against the real image in `pnpm test:sandbox`. Not part of the build.

import { describe, expect, it } from 'vitest';

import { TestUserLoginError } from '../domain/attack/attack-errors.js';
import type { TestUserPort } from '../domain/attack/test-user-port.js';

export interface TestUserContractHarness {
  readonly users: () => TestUserPort;
  readonly timeoutMs?: number;
}

export function describeTestUserContract(name: string, harness: TestUserContractHarness): void {
  const timeout = harness.timeoutMs ?? 5_000;

  describe(`${name} (TestUserPort contract)`, () => {
    it(
      'registers synthetic users with unique emails and random passwords',
      async () => {
        const users = harness.users();
        const a = await users.register('a');
        const b = await users.register('b');

        expect(a.email).toMatch(/^janus-a-[0-9a-z]+@janus\.test$/);
        expect(a.email).not.toBe(b.email);
        expect(a.userId).not.toBe(b.userId);
        expect(a.password.length).toBeGreaterThanOrEqual(16);
        expect(a.password).not.toBe(b.password);
      },
      timeout,
    );

    it(
      'logs a user in, and the target says whose session the token opens',
      async () => {
        const users = harness.users();
        const a = await users.register('a');
        const session = await users.login(a);

        expect(session.user).toBe(a);
        expect(session.token).not.toBe('');
        expect(await users.whoami(session.token)).toBe(a.email);
        expect(await users.whoami('not-a-token')).toBeNull();
      },
      timeout,
    );

    it(
      'refuses a login with the wrong password',
      async () => {
        const users = harness.users();
        const a = await users.register('a');

        await expect(users.login({ ...a, password: `${a.password}x` })).rejects.toThrow(
          TestUserLoginError,
        );
      },
      timeout,
    );
  });
}
