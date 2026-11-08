import { randomBytes } from 'node:crypto';

import { newUlid } from '@janus/shared-kernel';

import { TestUserLoginError } from '../../domain/attack/attack-errors.js';
import type { TestSession, TestUser, TestUserPort } from '../../domain/attack/test-user-port.js';

/** A target that keeps its accounts in memory, for tests. */
export class InMemoryTestUsers implements TestUserPort {
  /** Every registered account, for tests that check nothing leaks. */
  readonly accounts = new Map<string, TestUser>();
  private readonly sessions = new Map<string, string>();
  private nextId = 1;

  register(label: string): Promise<TestUser> {
    const user: TestUser = {
      label,
      email: `janus-${label}-${newUlid().toLowerCase()}@janus.test`,
      password: randomBytes(18).toString('base64url'),
      userId: this.nextId++,
    };
    this.accounts.set(user.email, user);
    return Promise.resolve(user);
  }

  login(user: TestUser): Promise<TestSession> {
    const account = this.accounts.get(user.email);
    if (account?.password !== user.password) {
      return Promise.reject(new TestUserLoginError(`The target refused ${user.email}`));
    }
    const token = `token-${newUlid()}`;
    this.sessions.set(token, user.email);
    return Promise.resolve({ user, token, basketId: account.userId });
  }

  whoami(token: string): Promise<string | null> {
    return Promise.resolve(this.sessions.get(token) ?? null);
  }
}
