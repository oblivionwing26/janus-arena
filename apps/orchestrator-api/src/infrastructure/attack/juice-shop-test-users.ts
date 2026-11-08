import { randomBytes } from 'node:crypto';

import { newUlid } from '@janus/shared-kernel';
import { z } from 'zod';

import {
  TestUserLoginError,
  TestUserRegistrationError,
} from '../../domain/attack/attack-errors.js';
import type { TestSession, TestUser, TestUserPort } from '../../domain/attack/test-user-port.js';
import type { ScopedHttpClient, ScopedReply } from '../../domain/scope/scoped-http-port.js';

const registered = z.object({ data: z.object({ id: z.int(), email: z.string() }) });
const loggedIn = z.object({
  authentication: z.object({ token: z.string().min(1), bid: z.int().nullable().optional() }),
});
const whoami = z.object({ user: z.object({ email: z.string().optional() }).optional() });

function json(reply: ScopedReply): unknown {
  try {
    return JSON.parse(reply.body);
  } catch {
    return undefined;
  }
}

/**
 * Synthetic test users on OWASP Juice Shop (F3.2): registered through its public API with a
 * unique email and a random password, logged in like its own frontend does. Every request goes
 * through the guarded client as a probe, so it stays inside the scope.
 */
export class JuiceShopTestUsers implements TestUserPort {
  constructor(
    private readonly client: ScopedHttpClient,
    private readonly origin: string,
  ) {}

  async register(label: string): Promise<TestUser> {
    const email = `janus-${label}-${newUlid().toLowerCase()}@janus.test`;
    const password = randomBytes(18).toString('base64url');
    const reply = await this.client.send({
      method: 'POST',
      url: `${this.origin}/api/Users`,
      testType: 'http-probe',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        passwordRepeat: password,
        securityQuestion: { id: 1 },
        securityAnswer: 'janus',
      }),
    });
    const parsed = registered.safeParse(json(reply));
    if (reply.status !== 201 || !parsed.success) {
      throw new TestUserRegistrationError(
        `Juice Shop did not register ${email}: ${String(reply.status)}`,
      );
    }
    return { label, email, password, userId: parsed.data.data.id };
  }

  async login(user: TestUser): Promise<TestSession> {
    const reply = await this.client.send({
      method: 'POST',
      url: `${this.origin}/rest/user/login`,
      testType: 'http-probe',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password }),
    });
    const parsed = loggedIn.safeParse(json(reply));
    if (reply.status !== 200 || !parsed.success) {
      throw new TestUserLoginError(`Juice Shop refused ${user.email}: ${String(reply.status)}`);
    }
    const { token, bid } = parsed.data.authentication;
    return { user, token, basketId: bid ?? null };
  }

  async whoami(token: string): Promise<string | null> {
    const reply = await this.client.send({
      method: 'GET',
      url: `${this.origin}/rest/user/whoami`,
      testType: 'http-probe',
      headers: { authorization: `Bearer ${token}`, cookie: `token=${token}` },
    });
    const parsed = whoami.safeParse(json(reply));
    const email = parsed.success ? parsed.data.user?.email : undefined;
    return reply.status === 200 && email !== undefined && email !== '' ? email : null;
  }
}
